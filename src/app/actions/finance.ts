"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// --- Types ---
export type LedgerCategory = 'adviser_maintenance' | 'sa_fines' | 'treasurer_events';

export const transactionSchema = z.object({
  occupant_id: z.string().uuid(),
  category: z.enum(['adviser_maintenance', 'sa_fines', 'treasurer_events'] as const),
  amount: z.number().positive(), // Always positive from client
  entry_type: z.enum(['charge', 'payment', 'adjustment', 'refund'] as const),
  method: z.string().optional(),
  note: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  event_id: z.string().uuid().optional(),
  fine_id: z.string().uuid().optional(),
});

export type TransactionData = z.infer<typeof transactionSchema>;

// --- Actions ---

export async function recordTransaction(dormId: string, data: TransactionData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // TODO: Check role permissions for the specific ledger category
  // For now, we rely on RLS, but it's good to have a check here if we knew the user's role.

  // Calculate signed amount based on entry type
  const finalAmount = data.entry_type === 'payment'
    ? -Math.abs(data.amount)
    : Math.abs(data.amount);

  const { error } = await supabase.from("ledger_entries").insert({
    dorm_id: dormId,
    ledger: data.category,
    entry_type: data.entry_type,
    occupant_id: data.occupant_id,
    amount_pesos: finalAmount,
    method: data.method,
    note: data.note,
    metadata: data.metadata || {},
    event_id: data.event_id,
    fine_id: data.fine_id,
    created_by: user.id
  });

  if (error) {
    console.error("Ledger error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/finance");
  revalidatePath("/payments"); // Occupant view
  return { success: true };
}

export async function getLedgerBalance(dormId: string, occupantId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ledger_entries")
    .select("ledger, amount_pesos, voided_at")
    .eq("dorm_id", dormId)
    .eq("occupant_id", occupantId)
    .is("voided_at", null);

  if (error) {
    console.error(error);
    return null;
  }

  const balances = {
    maintenance: 0,
    fines: 0,
    events: 0,
    total: 0
  };

  data.forEach(entry => {
    const amount = Number(entry.amount_pesos);
    if (entry.ledger === 'adviser_maintenance') balances.maintenance += amount;
    if (entry.ledger === 'sa_fines') balances.fines += amount;
    if (entry.ledger === 'treasurer_events') balances.events += amount;
    balances.total += amount;
  });

  return balances;
}

export async function getLedgerEntries(dormId: string, occupantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_entries")
    .select(`
      *,
      event:events(title),
      fine:fines(rule:fine_rules(title))
    `)
    .eq("dorm_id", dormId)
    .eq("occupant_id", occupantId)
    .order("posted_at", { ascending: false });

  if (error) {
    console.error("Error fetching ledger entries:", error);
    return [];
  }

  return data;
}

export async function getClearanceStatus(dormId: string, occupantId: string) {
  const balances = await getLedgerBalance(dormId, occupantId);
  if (!balances) return false;
  // Cleared if total balance is <= 0 (meaning paid up or overpaid).
  // Assuming positive balance = debt.
  return balances.total <= 0;
}
