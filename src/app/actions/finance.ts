"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";

const transactionSchema = z.object({
  occupant_id: z.string().uuid(),
  category: z.enum(['adviser_maintenance', 'sa_fines', 'treasurer_events'] as const),
  amount: z.number().positive(),
  entry_type: z.enum(['charge', 'payment', 'adjustment', 'refund'] as const),
  method: z.string().optional(),
  note: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  event_id: z.string().uuid().optional(),
  fine_id: z.string().uuid().optional(),
});

type TransactionData = z.infer<typeof transactionSchema>;
export type LedgerCategory = 'adviser_maintenance' | 'sa_fines' | 'treasurer_events';

// --- Actions ---

export async function recordTransaction(dormId: string, data: TransactionData) {
  const parsed = transactionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }
  const tx = parsed.data;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: "Forbidden" };
  }

  const allowedRolesByLedger: Record<LedgerCategory, string[]> = {
    adviser_maintenance: ["admin", "adviser", "assistant_adviser"],
    sa_fines: ["admin", "student_assistant", "adviser", "assistant_adviser"],
    treasurer_events: ["admin", "treasurer"],
  };

  const allowed = allowedRolesByLedger[tx.category].includes(membership.role);
  if (!allowed) {
    return { error: "You do not have permission to record this transaction." };
  }

  // Calculate signed amount based on entry type
  const finalAmount = tx.entry_type === 'payment'
    ? -Math.abs(tx.amount)
    : Math.abs(tx.amount);

  const { error } = await supabase.from("ledger_entries").insert({
    dorm_id: dormId,
    ledger: tx.category,
    entry_type: tx.entry_type,
    occupant_id: tx.occupant_id,
    amount_pesos: finalAmount,
    method: tx.method,
    note: tx.note,
    metadata: tx.metadata || {},
    event_id: tx.event_id,
    fine_id: tx.fine_id,
    created_by: user.id
  });

  if (error) {
    console.error("Ledger error:", error);
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.transaction_recorded",
      entityType: "ledger_entry",
      metadata: {
        ledger: tx.category,
        entry_type: tx.entry_type,
        occupant_id: tx.occupant_id,
        event_id: tx.event_id ?? null,
        fine_id: tx.fine_id ?? null,
        amount_pesos: finalAmount,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for finance transaction:", auditError);
  }

  revalidatePath("/admin/finance");
  revalidatePath("/payments"); // Occupant view
  return { success: true };
}

export async function getLedgerBalance(dormId: string, occupantId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

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
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
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
