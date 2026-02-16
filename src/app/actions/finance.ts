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

const eventPayableBatchSchema = z.object({
  event_id: z.string().uuid(),
  amount: z.number().positive(),
  description: z.string().trim().min(2).max(200),
  deadline: z.string().datetime().nullable(),
  include_already_charged: z.boolean().default(false),
});

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

export async function createEventPayableBatch(
  dormId: string,
  payload: {
    event_id: string;
    amount: number;
    description: string;
    deadline?: string | null;
    include_already_charged?: boolean;
  }
) {
  const parsed = eventPayableBatchSchema.safeParse({
    event_id: payload.event_id,
    amount: payload.amount,
    description: payload.description,
    deadline: payload.deadline ?? null,
    include_already_charged: payload.include_already_charged ?? false,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payable event input." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  if (!new Set(["admin", "treasurer"]).has(membership.role)) {
    return { error: "Only treasurer and admin can create payable events." };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title")
    .eq("id", parsed.data.event_id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (eventError || !event) {
    return { error: "Event not found for this dorm." };
  }

  const { data: occupants, error: occupantsError } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("status", "active");

  if (occupantsError) {
    return { error: occupantsError.message };
  }

  if (!occupants?.length) {
    return { error: "No active occupants found to charge." };
  }

  const activeOccupantIds = occupants.map((occupant) => occupant.id);
  let targetOccupantIds = activeOccupantIds;

  if (!parsed.data.include_already_charged) {
    const { data: existingCharges, error: chargesError } = await supabase
      .from("ledger_entries")
      .select("occupant_id")
      .eq("dorm_id", dormId)
      .eq("ledger", "treasurer_events")
      .eq("entry_type", "charge")
      .eq("event_id", parsed.data.event_id)
      .is("voided_at", null)
      .gt("amount_pesos", 0);

    if (chargesError) {
      return { error: chargesError.message };
    }

    const chargedSet = new Set(
      (existingCharges ?? [])
        .map((entry) => entry.occupant_id)
        .filter((value): value is string => Boolean(value))
    );

    targetOccupantIds = activeOccupantIds.filter((occupantId) => !chargedSet.has(occupantId));
  }

  if (!targetOccupantIds.length) {
    return {
      error:
        "All active occupants already have payable charges for this event. Enable re-charge to create another batch.",
    };
  }

  const batchId = crypto.randomUUID();
  const deadlineIso = parsed.data.deadline
    ? new Date(parsed.data.deadline).toISOString()
    : null;

  const { error: insertError } = await supabase.from("ledger_entries").insert(
    targetOccupantIds.map((occupantId) => ({
      dorm_id: dormId,
      ledger: "treasurer_events",
      entry_type: "charge",
      occupant_id: occupantId,
      event_id: parsed.data.event_id,
      amount_pesos: Math.abs(parsed.data.amount),
      method: "manual_charge",
      note: parsed.data.description,
      metadata: {
        payable_batch_id: batchId,
        payable_deadline: deadlineIso,
        payable_label: parsed.data.description,
      },
      created_by: user.id,
    }))
  );

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.event_payable_created",
      entityType: "event",
      entityId: parsed.data.event_id,
      metadata: {
        event_title: event.title,
        amount_pesos: Math.abs(parsed.data.amount),
        description: parsed.data.description,
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
        include_already_charged: parsed.data.include_already_charged,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for payable event creation:", auditError);
  }

  revalidatePath("/admin/finance/events");
  revalidatePath(`/admin/finance/events/${parsed.data.event_id}`);
  revalidatePath("/payments");

  return {
    success: true,
    chargedCount: targetOccupantIds.length,
  };
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
