"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureActiveSemesterId } from "@/lib/semesters";
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
  receipt_email: z
    .object({
      enabled: z.boolean().default(true),
      subject: z.string().trim().min(1).max(140).optional(),
      message: z.string().trim().max(2000).optional(),
      signature: z.string().trim().max(100).optional(),
    })
    .optional(),
});

type TransactionData = z.infer<typeof transactionSchema>;
export type LedgerCategory = 'adviser_maintenance' | 'sa_fines' | 'treasurer_events';

const allowedRolesByLedger: Record<LedgerCategory, string[]> = {
  adviser_maintenance: ["admin", "adviser", "assistant_adviser"],
  sa_fines: ["admin", "student_assistant", "adviser", "assistant_adviser"],
  treasurer_events: ["admin", "treasurer"],
};

const contributionBatchSchema = z.object({
  amount: z.number().positive(),
  description: z.string().trim().min(2).max(200),
  deadline: z.string().datetime().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  include_already_charged: z.boolean().default(false),
});

const overwriteLedgerSchema = z.object({
  entry_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().trim().min(2).max(300),
  reason: z.string().trim().min(2).max(300),
  method: z.string().trim().max(60).optional(),
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

  const allowed = allowedRolesByLedger[tx.category].includes(membership.role);
  if (!allowed) {
    return { error: "You do not have permission to record this transaction." };
  }

  // Calculate signed amount based on entry type
  const finalAmount = tx.entry_type === 'payment'
    ? -Math.abs(tx.amount)
    : Math.abs(tx.amount);

  // Ensure we have the active semester for this transaction
  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  const semesterId = "semesterId" in semesterResult ? semesterResult.semesterId : null;

  const { error } = await supabase.from("ledger_entries").insert({
    dorm_id: dormId,
    semester_id: semesterId,
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

  const receiptConfig = tx.receipt_email ?? null;
  const shouldSendReceiptEmail = finalAmount < 0 && (receiptConfig?.enabled ?? true);

  if (shouldSendReceiptEmail) {
    try {
      const { sendEmail, renderPaymentReceiptEmail } = await import("@/lib/email");

      const { data: occupant } = await supabase
        .from("occupants")
        .select("id, user_id, full_name, contact_email")
        .eq("dorm_id", dormId)
        .eq("id", tx.occupant_id)
        .maybeSingle();

      if (!occupant) {
        throw new Error("Occupant not found for receipt email.");
      }

      let recipientEmail: string | null = occupant.contact_email?.trim() || null;

      if (!recipientEmail && occupant.user_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = await import("@supabase/supabase-js");
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        );

        const { data: authUserResult } = await adminClient.auth.admin.getUserById(occupant.user_id);
        recipientEmail = authUserResult.user?.email?.trim() || null;
      }

      if (!recipientEmail) {
        throw new Error("No email address is available for this occupant.");
      }

      const ledgerLabel =
        tx.category === "adviser_maintenance"
          ? "Maintenance"
          : tx.category === "sa_fines"
            ? "Fines"
            : "Event contributions";

      let eventTitle: string | null = null;
      if (tx.event_id) {
        const { data: event } = await supabase
          .from("events")
          .select("title")
          .eq("dorm_id", dormId)
          .eq("id", tx.event_id)
          .maybeSingle();

        eventTitle = event?.title?.trim() || null;
      }

      const rendered = renderPaymentReceiptEmail({
        recipientName: occupant.full_name ?? null,
        amountPesos: Math.abs(finalAmount),
        paidAtIso: new Date().toISOString(),
        ledgerLabel,
        method: tx.method?.trim() || null,
        note: tx.note?.trim() || null,
        eventTitle,
        customMessage: receiptConfig?.message?.trim() || null,
        subjectOverride: receiptConfig?.subject?.trim() || null,
        signatureOverride: receiptConfig?.signature?.trim() || null,
      });

      const result = await sendEmail({
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!result.success) {
        console.warn("Receipt email could not be sent:", result.error);
      }
    } catch (emailError) {
      console.error("Failed to send receipt email:", emailError);
    }
  }

  revalidatePath("/admin/finance");
  revalidatePath("/payments"); // Occupant view
  return { success: true };
}

export async function overwriteLedgerEntry(
  dormId: string,
  payload: {
    entry_id: string;
    amount: number;
    note: string;
    reason: string;
    method?: string;
  }
) {
  const parsed = overwriteLedgerSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid overwrite payload." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership?.role) {
    return { error: "Forbidden" };
  }

  const { data: originalEntry, error: originalError } = await supabase
    .from("ledger_entries")
    .select(
      "id, ledger, entry_type, occupant_id, event_id, fine_id, amount_pesos, method, note, metadata, voided_at"
    )
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.entry_id)
    .maybeSingle();

  if (originalError || !originalEntry) {
    return { error: originalError?.message ?? "Ledger entry not found." };
  }

  if (originalEntry.voided_at) {
    return { error: "This ledger entry is already voided." };
  }

  const ledger = originalEntry.ledger as LedgerCategory;
  if (!allowedRolesByLedger[ledger]?.includes(membership.role)) {
    return { error: "You do not have permission to overwrite this ledger entry." };
  }

  const finalAmount =
    originalEntry.entry_type === "payment"
      ? -Math.abs(parsed.data.amount)
      : Math.abs(parsed.data.amount);

  const nowIso = new Date().toISOString();
  const voidReason = `Overwritten: ${parsed.data.reason}`;

  const { error: voidError } = await supabase
    .from("ledger_entries")
    .update({
      voided_at: nowIso,
      voided_by: user.id,
      void_reason: voidReason,
      updated_at: nowIso,
    })
    .eq("dorm_id", dormId)
    .eq("id", originalEntry.id)
    .is("voided_at", null);

  if (voidError) {
    return { error: voidError.message };
  }

  const originalMetadata =
    originalEntry.metadata && typeof originalEntry.metadata === "object"
      ? (originalEntry.metadata as Record<string, unknown>)
      : {};

  const { data: replacementEntry, error: replacementError } = await supabase
    .from("ledger_entries")
    .insert({
      dorm_id: dormId,
      ledger,
      entry_type: originalEntry.entry_type,
      occupant_id: originalEntry.occupant_id,
      event_id: originalEntry.event_id,
      fine_id: originalEntry.fine_id,
      amount_pesos: finalAmount,
      method: parsed.data.method?.trim() || originalEntry.method || "manual_overwrite",
      note: parsed.data.note,
      metadata: {
        ...originalMetadata,
        overwritten_from_entry_id: originalEntry.id,
        overwrite_reason: parsed.data.reason,
      },
      created_by: user.id,
    })
    .select("id")
    .single();

  if (replacementError || !replacementEntry) {
    await supabase
      .from("ledger_entries")
      .update({
        voided_at: null,
        voided_by: null,
        void_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("dorm_id", dormId)
      .eq("id", originalEntry.id);

    return { error: replacementError?.message ?? "Failed to create replacement entry." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.transaction_overwritten",
      entityType: "ledger_entry",
      entityId: originalEntry.id,
      metadata: {
        replacement_entry_id: replacementEntry.id,
        ledger,
        entry_type: originalEntry.entry_type,
        old_amount_pesos: Number(originalEntry.amount_pesos ?? 0),
        new_amount_pesos: finalAmount,
        reason: parsed.data.reason,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for ledger overwrite:", auditError);
  }

  revalidatePath("/payments");
  revalidatePath("/admin/finance/maintenance");
  revalidatePath("/admin/finance/events");
  if (originalEntry.event_id) {
    revalidatePath(`/admin/finance/events/${originalEntry.event_id}`);
  }

  return {
    success: true,
    replacement_entry_id: replacementEntry.id,
  };
}

export async function createContributionBatch(
  dormId: string,
  payload: {
    amount: number;
    description: string;
    deadline?: string | null;
    event_id?: string | null;
    include_already_charged?: boolean;
  }
) {
  const parsed = contributionBatchSchema.safeParse({
    amount: payload.amount,
    description: payload.description,
    deadline: payload.deadline ?? null,
    event_id: payload.event_id ?? null,
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

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  let eventTitle: string | null = null;
  if (parsed.data.event_id) {
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title")
      .eq("id", parsed.data.event_id)
      .eq("dorm_id", dormId)
      .eq("semester_id", semesterResult.semesterId)
      .maybeSingle();

    if (eventError || !event) {
      return { error: "Event not found for this dorm." };
    }
    eventTitle = event.title;
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

  if (!parsed.data.include_already_charged && parsed.data.event_id) {
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
      event_id: parsed.data.event_id || null,
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
      action: "finance.contribution_batch_created",
      entityType: "finance",
      entityId: batchId,
      metadata: {
        event_id: parsed.data.event_id || null,
        event_title: eventTitle,
        amount_pesos: Math.abs(parsed.data.amount),
        description: parsed.data.description,
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
        include_already_charged: parsed.data.include_already_charged,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution batch creation:", auditError);
  }

  revalidatePath("/admin/finance/events");
  if (parsed.data.event_id) {
    revalidatePath(`/admin/finance/events/${parsed.data.event_id}`);
  }
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

export async function createPublicViewToken(
  dormId: string,
  entityType: 'event' | 'finance_ledger',
  entityId: string,
  expiresInDays?: number
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Permission check
  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !['admin', 'treasurer', 'adviser', 'assistant_adviser'].includes(membership.role)) {
    return { error: "Forbidden" };
  }

  const expires_at = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from("public_view_tokens")
    .insert({
      dorm_id: dormId,
      entity_type: entityType,
      entity_id: entityId,
      expires_at,
      created_by: user.id
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/admin/finance/events/${entityId}`);
  return { success: true, token: data.token };
}

export async function getPublicContributionSummaryAction(token: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  // Use the RPC/Function we created in migration
  const { data, error } = await supabase.rpc('get_public_contribution_summary', {
    token_uuid: token
  });

  if (error) {
    console.error("Public summary error:", error);
    return { error: "Link is invalid or expired." };
  }

  if (!data || data.length === 0) {
    return { error: "No data found for this link." };
  }

  return { success: true, summary: data[0] };
}

export async function getEntityPublicTokens(dormId: string, entityId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("public_view_tokens")
    .select("*")
    .eq("dorm_id", dormId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) return [];
  return data;
}

export async function togglePublicViewToken(dormId: string, tokenId: string, active: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("public_view_tokens")
    .update({ is_active: active })
    .eq("dorm_id", dormId)
    .eq("id", tokenId);

  if (error) return { error: error.message };

  revalidatePath("/admin/finance");
  return { success: true };
}
