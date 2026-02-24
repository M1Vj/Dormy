"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { optimizeImage } from "@/lib/images";

const transactionSchema = z.object({
  occupant_id: z.string().uuid(),
  category: z.enum(['maintenance_fee', 'sa_fines', 'contributions'] as const),
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
      signature: z.string().trim().max(3000).optional(),
      logo_url: z.string().url().trim().max(3000).optional(),
    })
    .optional(),
});

type TransactionData = z.infer<typeof transactionSchema>;
export type LedgerCategory = 'maintenance_fee' | 'sa_fines' | 'contributions';

const allowedRolesByLedger: Record<LedgerCategory, string[]> = {
  maintenance_fee: ["admin", "adviser"],
  sa_fines: ["admin", "student_assistant", "adviser"],
  contributions: ["admin", "treasurer"],
};

const contributionBatchSchema = z.object({
  amount: z.number().positive(),
  title: z.string().trim().min(2).max(120),
  details: z.string().trim().max(1200).optional().nullable(),
  description: z.string().trim().min(2).max(200).optional().nullable(),
  deadline: z.string().datetime().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  event_title: z.string().trim().max(200).optional().nullable(),
  include_already_charged: z.boolean().default(false),
});

const contributionBatchPaymentSchema = z.object({
  occupant_id: z.string().uuid(),
  contribution_ids: z.array(z.string().uuid()).min(1),
  amount: z.number().positive(),
  method: z.enum(["cash", "gcash"]),
  paid_at_iso: z.string().datetime(),
  allocation_target_id: z.string().uuid().optional().nullable(),
  send_receipt_email: z.boolean().default(true),
  receipt_email_override: z.string().email().optional().nullable(),
  receipt_subject: z.string().trim().max(140).optional().nullable(),
  receipt_message: z.string().trim().max(2000).optional().nullable(),
  receipt_signature: z.string().trim().max(3000).optional().nullable(),
  receipt_logo_url: z.string().url().optional().nullable(),
});

const contributionReceiptSignatureSchema = z.object({
  contribution_id: z.string().uuid(),
  signature: z.string().trim().min(2).max(3000),
});

const contributionReceiptTemplateSchema = z.object({
  contribution_id: z.string().uuid(),
  subject: z.string().trim().max(140).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
});

const contributionReceiptTemplatePreviewSchema = z.object({
  contribution_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "gcash", "bank_transfer"]).optional().nullable(),
  paid_at_iso: z.string().datetime().optional().nullable(),
  subject: z.string().trim().max(140).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().url().trim().max(3000).optional().nullable(),
  signature: z.string().trim().max(3000).optional().nullable(),
});

const contributionReceiptAssetUploadSchema = z.object({
  contribution_id: z.string().uuid(),
  asset_type: z.enum(["logo", "signature"]),
});

const contributionPayableOverrideSchema = z.object({
  contribution_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  new_payable: z.number().min(0),
  reason: z.string().trim().min(3).max(300),
});

const overwriteLedgerSchema = z.object({
  entry_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().trim().min(2).max(300),
  reason: z.string().trim().min(2).max(300),
  method: z.string().trim().max(60).optional(),
});

type ContributionMetadata = {
  contribution_id: string;
  contribution_title: string;
  contribution_details: string | null;
  contribution_event_title: string | null;
  payable_deadline: string | null;
  contribution_receipt_signature: string | null;
  contribution_receipt_subject: string | null;
  contribution_receipt_message: string | null;
  contribution_receipt_logo_url: string | null;
};

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseContributionMetadata(
  metadataInput: unknown,
  fallback: {
    eventId?: string | null;
    note?: string | null;
  } = {}
): ContributionMetadata {
  const metadata = asMetadataRecord(metadataInput);
  const contributionIdRaw =
    metadata.contribution_id ??
    metadata.payable_batch_id ??
    fallback.eventId ??
    null;
  const contributionTitleRaw =
    metadata.contribution_title ??
    metadata.payable_label ??
    fallback.note ??
    "Contribution";
  const detailsRaw = metadata.contribution_details;
  const eventTitleRaw = metadata.contribution_event_title;
  const deadlineRaw = metadata.payable_deadline;
  const signatureRaw = metadata.contribution_receipt_signature;
  const subjectRaw = metadata.contribution_receipt_subject;
  const messageRaw = metadata.contribution_receipt_message;
  const logoRaw = metadata.contribution_receipt_logo_url;

  return {
    contribution_id:
      typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
        ? contributionIdRaw
        : crypto.randomUUID(),
    contribution_title:
      typeof contributionTitleRaw === "string" && contributionTitleRaw.trim().length > 0
        ? contributionTitleRaw.trim()
        : "Contribution",
    contribution_details:
      typeof detailsRaw === "string" && detailsRaw.trim().length > 0
        ? detailsRaw.trim()
        : null,
    contribution_event_title:
      typeof eventTitleRaw === "string" && eventTitleRaw.trim().length > 0
        ? eventTitleRaw.trim()
        : null,
    payable_deadline:
      typeof deadlineRaw === "string" && deadlineRaw.trim().length > 0
        ? deadlineRaw
        : null,
    contribution_receipt_signature:
      typeof signatureRaw === "string" && signatureRaw.trim().length > 0
        ? signatureRaw.trim()
        : null,
    contribution_receipt_subject:
      typeof subjectRaw === "string" && subjectRaw.trim().length > 0
        ? subjectRaw.trim()
        : null,
    contribution_receipt_message:
      typeof messageRaw === "string" && messageRaw.trim().length > 0
        ? messageRaw.trim()
        : null,
    contribution_receipt_logo_url:
      typeof logoRaw === "string" && logoRaw.trim().length > 0
        ? logoRaw.trim()
        : null,
  };
}

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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  const allowed = memberships.some(m => allowedRolesByLedger[tx.category].includes(m.role));
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

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error } = await writeClient.from("ledger_entries").insert({
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
        tx.category === "maintenance_fee"
          ? "Maintenance"
          : tx.category === "sa_fines"
            ? "Fines"
            : "Contributions";

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

      const contributionMetadata =
        tx.category === "contributions"
          ? parseContributionMetadata(tx.metadata ?? {}, {
              eventId: tx.event_id ?? null,
              note: tx.note ?? null,
            })
          : null;
      const resolvedSignature =
        receiptConfig?.signature?.trim() ||
        contributionMetadata?.contribution_receipt_signature ||
        null;
      const resolvedSubject =
        receiptConfig?.subject?.trim() ||
        contributionMetadata?.contribution_receipt_subject ||
        null;
      const resolvedMessage =
        receiptConfig?.message?.trim() ||
        contributionMetadata?.contribution_receipt_message ||
        null;
      const resolvedLogoUrl =
        receiptConfig?.logo_url?.trim() ||
        contributionMetadata?.contribution_receipt_logo_url ||
        null;

      const rendered = renderPaymentReceiptEmail({
        recipientName: occupant.full_name ?? null,
        amountPesos: Math.abs(finalAmount),
        paidAtIso: new Date().toISOString(),
        ledgerLabel,
        method: tx.method?.trim() || null,
        note: tx.note?.trim() || null,
        eventTitle,
        customMessage: resolvedMessage,
        subjectOverride: resolvedSubject,
        signatureOverride: resolvedSignature,
        logoUrl: resolvedLogoUrl,
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

  const { getActiveRole } = await import("@/lib/roles-server");
  const activeRole = await getActiveRole() || "occupant";

  revalidatePath(`/${activeRole}/finance`);
  revalidatePath(`/${activeRole}/payments`); // Occupant view
  return { success: true };
}

export async function previewTransactionReceiptEmail(
  dormId: string,
  data: TransactionData
) {
  const parsed = transactionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment preview payload." };
  }

  const tx = parsed.data;
  if (tx.entry_type !== "payment") {
    return { error: "Only payment receipts can be previewed." };
  }

  const receiptConfig = tx.receipt_email ?? null;
  if (receiptConfig?.enabled === false) {
    return { error: "Receipt email is disabled for this payment." };
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  const allowed = memberships.some(m => allowedRolesByLedger[tx.category].includes(m.role));
  if (!allowed) {
    return { error: "You do not have permission to preview this receipt email." };
  }

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", tx.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for receipt email." };
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
    return { error: "No email address is available for this occupant." };
  }

  const ledgerLabel =
    tx.category === "maintenance_fee"
      ? "Maintenance"
      : tx.category === "sa_fines"
        ? "Fines"
        : "Contributions";

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

  const contributionMetadata =
    tx.category === "contributions"
      ? parseContributionMetadata(tx.metadata ?? {}, {
          eventId: tx.event_id ?? null,
          note: tx.note ?? null,
        })
      : null;
  const resolvedSignature =
    receiptConfig?.signature?.trim() ||
    contributionMetadata?.contribution_receipt_signature ||
    null;
  const resolvedSubject =
    receiptConfig?.subject?.trim() ||
    contributionMetadata?.contribution_receipt_subject ||
    null;
  const resolvedMessage =
    receiptConfig?.message?.trim() ||
    contributionMetadata?.contribution_receipt_message ||
    null;
  const resolvedLogoUrl =
    receiptConfig?.logo_url?.trim() ||
    contributionMetadata?.contribution_receipt_logo_url ||
    null;

  const { renderPaymentReceiptEmail } = await import("@/lib/email");
  const rendered = renderPaymentReceiptEmail({
    recipientName: occupant.full_name ?? null,
    amountPesos: tx.amount,
    paidAtIso: new Date().toISOString(),
    ledgerLabel,
    method: tx.method?.trim() || null,
    note: tx.note?.trim() || null,
    eventTitle,
    customMessage: resolvedMessage,
    subjectOverride: resolvedSubject,
    signatureOverride: resolvedSignature,
    logoUrl: resolvedLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
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
  if (!memberships.some(m => allowedRolesByLedger[ledger]?.includes(m.role))) {
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

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  const semesterId = "semesterId" in semesterResult ? semesterResult.semesterId : null;

  const { data: replacementEntry, error: replacementError } = await supabase
    .from("ledger_entries")
    .insert({
      dorm_id: dormId,
      semester_id: semesterId,
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

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/payments`);
  revalidatePath(`/${activeRole}/finance/maintenance`);
  revalidatePath(`/${activeRole}/finance/events`);
  if (originalEntry.event_id) {
    revalidatePath(`/${activeRole}/finance/events/${originalEntry.event_id}`);
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
    title: string;
    details?: string | null;
    description?: string | null;
    deadline?: string | null;
    event_id?: string | null;
    event_title?: string | null;
    include_already_charged?: boolean;
  }
) {
  const parsed = contributionBatchSchema.safeParse({
    amount: payload.amount,
    title: payload.title,
    details: payload.details ?? null,
    description: payload.description ?? null,
    deadline: payload.deadline ?? null,
    event_id: payload.event_id ?? null,
    event_title: payload.event_title ?? null,
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only treasurer and admin can create payable events." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  let eventTitle: string | null = parsed.data.event_title?.trim() || null;
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
    eventTitle = event.title?.trim() || eventTitle;
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
      .eq("ledger", "contributions")
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
  const contributionTitle = parsed.data.title.trim();
  const contributionDetails = parsed.data.details?.trim() || parsed.data.description?.trim() || null;

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: insertError } = await writeClient.from("ledger_entries").insert(
    targetOccupantIds.map((occupantId) => ({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      ledger: "contributions",
      entry_type: "charge",
      occupant_id: occupantId,
      event_id: parsed.data.event_id || null,
      amount_pesos: Math.abs(parsed.data.amount),
      method: "manual_charge",
      note: contributionTitle,
      metadata: {
        contribution_id: batchId,
        contribution_title: contributionTitle,
        contribution_details: contributionDetails,
        contribution_event_title: eventTitle,
        contribution_receipt_signature: null,
        contribution_receipt_subject: null,
        contribution_receipt_message: null,
        contribution_receipt_logo_url: null,
        payable_batch_id: batchId,
        payable_deadline: deadlineIso,
        payable_label: contributionTitle,
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
        contribution_title: contributionTitle,
        contribution_details: contributionDetails,
        amount_pesos: Math.abs(parsed.data.amount),
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
        include_already_charged: parsed.data.include_already_charged,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution batch creation:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events`);
  revalidatePath(`/${activeRole}/finance/events/${batchId}`);
  revalidatePath(`/${activeRole}/payments`);

  return {
    success: true,
    contributionId: batchId,
    chargedCount: targetOccupantIds.length,
  };
}

type ContributionGroupEntry = {
  contributionId: string;
  title: string;
  details: string | null;
  eventTitle: string | null;
  receiptSignature: string | null;
  receiptSubject: string | null;
  receiptMessage: string | null;
  receiptLogoUrl: string | null;
  semesterId: string | null;
  eventId: string | null;
  deadline: string | null;
  payable: number;
  paid: number;
  outstanding: number;
};

function resolveContributionReceiptSignature(rows: Array<{ title: string; receiptSignature: string | null }>) {
  const signatures = Array.from(
    new Set(
      rows
        .map((row) => row.receiptSignature?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
  );

  if (signatures.length > 1) {
    return { error: "Selected contributions have different receipt signatures. Use contributions with one signature template." as const };
  }

  if (signatures.length === 0) {
    return { error: "Set a contribution receipt signature on the contribution page before sending email." as const };
  }

  return { signature: signatures[0] as string };
}

function resolveContributionReceiptTemplate(
  rows: Array<{
    receiptSubject: string | null;
    receiptMessage: string | null;
    receiptLogoUrl: string | null;
  }>
) {
  const normalize = (value: string | null) => {
    const trimmed = value?.trim() || "";
    return trimmed.length > 0 ? trimmed : null;
  };

  const uniqueSubjects = Array.from(new Set(rows.map((row) => normalize(row.receiptSubject))));
  if (uniqueSubjects.length > 1) {
    return { error: "Selected contributions have different receipt subjects. Use one receipt template." as const };
  }

  const uniqueMessages = Array.from(new Set(rows.map((row) => normalize(row.receiptMessage))));
  if (uniqueMessages.length > 1) {
    return { error: "Selected contributions have different receipt messages. Use one receipt template." as const };
  }

  const uniqueLogos = Array.from(new Set(rows.map((row) => normalize(row.receiptLogoUrl))));
  if (uniqueLogos.length > 1) {
    return { error: "Selected contributions have different receipt logos. Use one receipt template." as const };
  }

  return {
    template: {
      subject: uniqueSubjects[0] ?? null,
      message: uniqueMessages[0] ?? null,
      logoUrl: uniqueLogos[0] ?? null,
    },
  };
}

export async function recordContributionBatchPayment(
  dormId: string,
  payload: z.infer<typeof contributionBatchPaymentSchema>
) {
  const parsed = contributionBatchPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid batch payment request." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can record contribution payments." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: rawEntries, error: rawEntriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, entry_type, amount_pesos, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (rawEntriesError) {
    return { error: rawEntriesError.message };
  }

  const selectedIds = new Set(input.contribution_ids);
  const contributionMap = new Map<string, ContributionGroupEntry>();

  for (const row of rawEntries ?? []) {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });

    if (!selectedIds.has(metadata.contribution_id)) {
      continue;
    }

    const existing = contributionMap.get(metadata.contribution_id) ?? {
      contributionId: metadata.contribution_id,
      title: metadata.contribution_title,
      details: metadata.contribution_details,
      eventTitle: metadata.contribution_event_title,
      receiptSignature: metadata.contribution_receipt_signature,
      receiptSubject: metadata.contribution_receipt_subject,
      receiptMessage: metadata.contribution_receipt_message,
      receiptLogoUrl: metadata.contribution_receipt_logo_url,
      semesterId: row.semester_id ?? null,
      eventId: row.event_id ?? null,
      deadline: metadata.payable_deadline,
      payable: 0,
      paid: 0,
      outstanding: 0,
    };

    const amount = Number(row.amount_pesos ?? 0);
    if (row.entry_type === "payment" || amount < 0) {
      existing.paid += Math.abs(amount);
    } else {
      existing.payable += amount;
    }
    existing.outstanding += amount;

    if (!existing.semesterId && row.semester_id) {
      existing.semesterId = row.semester_id;
    }
    if (!existing.eventId && row.event_id) {
      existing.eventId = row.event_id;
    }
    if (!existing.deadline && metadata.payable_deadline) {
      existing.deadline = metadata.payable_deadline;
    }
    if (!existing.eventTitle && metadata.contribution_event_title) {
      existing.eventTitle = metadata.contribution_event_title;
    }
    if (!existing.details && metadata.contribution_details) {
      existing.details = metadata.contribution_details;
    }
    if (!existing.receiptSignature && metadata.contribution_receipt_signature) {
      existing.receiptSignature = metadata.contribution_receipt_signature;
    }
    if (!existing.receiptSubject && metadata.contribution_receipt_subject) {
      existing.receiptSubject = metadata.contribution_receipt_subject;
    }
    if (!existing.receiptMessage && metadata.contribution_receipt_message) {
      existing.receiptMessage = metadata.contribution_receipt_message;
    }
    if (!existing.receiptLogoUrl && metadata.contribution_receipt_logo_url) {
      existing.receiptLogoUrl = metadata.contribution_receipt_logo_url;
    }

    contributionMap.set(metadata.contribution_id, existing);
  }

  const contributionRows = Array.from(contributionMap.values());
  if (!contributionRows.length) {
    return { error: "No selected contributions found for this occupant." };
  }

  const dueByContribution = new Map<string, number>();
  for (const row of contributionRows) {
    dueByContribution.set(row.contributionId, Math.max(0, row.outstanding));
  }

  const totalDue = Array.from(dueByContribution.values()).reduce((sum, value) => sum + value, 0);
  if (totalDue <= 0) {
    return { error: "Selected contributions are already settled." };
  }

  const allocations = new Map(dueByContribution);
  const difference = Number((input.amount - totalDue).toFixed(2));
  if (Math.abs(difference) >= 0.01) {
    if (!input.allocation_target_id) {
      return {
        error: "Select where to apply the payment difference when amount is not exact.",
      };
    }
    const existingTarget = allocations.get(input.allocation_target_id);
    if (existingTarget === undefined) {
      return { error: "Allocation target must be one of the selected contributions." };
    }
    const adjusted = Number((existingTarget + difference).toFixed(2));
    if (adjusted < 0) {
      return { error: "Difference is too large for the selected allocation target." };
    }
    allocations.set(input.allocation_target_id, adjusted);
  }

  const allocRows = contributionRows
    .map((row) => ({
      ...row,
      allocation: Number((allocations.get(row.contributionId) ?? 0).toFixed(2)),
    }))
    .filter((row) => row.allocation > 0);

  if (!allocRows.length) {
    return { error: "Nothing to record after allocation." };
  }

  const signatureResult = resolveContributionReceiptSignature(allocRows);
  if (input.send_receipt_email && "error" in signatureResult) {
    return { error: signatureResult.error };
  }

  const templateResult = resolveContributionReceiptTemplate(allocRows);
  if (input.send_receipt_email && "error" in templateResult) {
    return { error: templateResult.error };
  }

  const resolvedTemplate =
    "template" in templateResult && templateResult.template
      ? templateResult.template
      : { subject: null, message: null, logoUrl: null };
  const resolvedReceiptSignature =
    input.receipt_signature?.trim() ||
    ("signature" in signatureResult ? signatureResult.signature : null);
  const resolvedReceiptSubject = input.receipt_subject?.trim() || resolvedTemplate.subject;
  const resolvedReceiptMessage = input.receipt_message?.trim() || resolvedTemplate.message;
  const resolvedReceiptLogoUrl = input.receipt_logo_url?.trim() || resolvedTemplate.logoUrl;

  const batchPaymentId = crypto.randomUUID();
  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }
  const { error: insertError } = await writeClient.from("ledger_entries").insert(
    allocRows.map((row) => ({
      dorm_id: dormId,
      semester_id: row.semesterId ?? semesterResult.semesterId,
      ledger: "contributions",
      entry_type: "payment",
      occupant_id: input.occupant_id,
      event_id: row.eventId,
      amount_pesos: -Math.abs(row.allocation),
      method: input.method,
      note: `Batch payment • ${row.title}`,
      posted_at: input.paid_at_iso,
      metadata: {
        contribution_id: row.contributionId,
        contribution_title: row.title,
        contribution_details: row.details,
        contribution_event_title: row.eventTitle,
        payable_deadline: row.deadline,
        contribution_receipt_signature: row.receiptSignature,
        contribution_receipt_subject: row.receiptSubject,
        contribution_receipt_message: row.receiptMessage,
        contribution_receipt_logo_url: row.receiptLogoUrl,
        payment_batch_id: batchPaymentId,
        payment_allocation_pesos: row.allocation,
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
      action: "finance.contribution_batch_payment_recorded",
      entityType: "finance",
      entityId: batchPaymentId,
      metadata: {
        occupant_id: input.occupant_id,
        contribution_ids: input.contribution_ids,
        total_paid: input.amount,
        method: input.method,
        paid_at_iso: input.paid_at_iso,
        allocation_target_id: input.allocation_target_id ?? null,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution batch payment:", auditError);
  }

  if (input.send_receipt_email) {
    try {
      const { sendEmail, renderContributionBatchReceiptEmail } = await import("@/lib/email");

      const { data: occupant } = await supabase
        .from("occupants")
        .select("id, user_id, full_name, contact_email")
        .eq("dorm_id", dormId)
        .eq("id", input.occupant_id)
        .maybeSingle();

      if (!occupant) {
        throw new Error("Occupant not found for receipt.");
      }

      let recipientEmail = input.receipt_email_override?.trim() || occupant.contact_email?.trim() || "";

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
        const { data: authUser } = await adminClient.auth.admin.getUserById(occupant.user_id);
        recipientEmail = authUser.user?.email?.trim() || "";
      }

      if (recipientEmail) {
        const rendered = renderContributionBatchReceiptEmail({
          recipientName: occupant.full_name ?? null,
          paidAtIso: input.paid_at_iso,
          method: input.method,
          contributions: allocRows.map((row) => ({
            title: row.title,
            amountPesos: row.allocation,
          })),
          totalAmountPesos: allocRows.reduce((sum, row) => sum + row.allocation, 0),
          customMessage: resolvedReceiptMessage,
          subjectOverride: resolvedReceiptSubject,
          signatureOverride: resolvedReceiptSignature,
          logoUrl: resolvedReceiptLogoUrl,
        });

        const emailResult = await sendEmail({
          to: recipientEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        if (!emailResult.success) {
          console.warn("Failed to send contribution batch receipt email:", emailResult.error);
        }
      }
    } catch (emailError) {
      console.error("Contribution batch receipt email error:", emailError);
    }
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events`);
  for (const row of allocRows) {
    revalidatePath(`/${activeRole}/finance/events/${row.contributionId}`);
  }
  revalidatePath(`/${activeRole}/payments`);

  return {
    success: true,
    paidCount: allocRows.length,
    totalPaid: allocRows.reduce((sum, row) => sum + row.allocation, 0),
  };
}

export async function previewContributionBatchPaymentEmail(
  dormId: string,
  payload: z.infer<typeof contributionBatchPaymentSchema>
) {
  const parsed = contributionBatchPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid batch payment request." };
  }

  const input = parsed.data;
  if (!input.send_receipt_email) {
    return { error: "Receipt email is disabled for this payment." };
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can preview contribution payment emails." };
  }

  const { data: rawEntries, error: rawEntriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, entry_type, amount_pesos, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (rawEntriesError) {
    return { error: rawEntriesError.message };
  }

  const selectedIds = new Set(input.contribution_ids);
  const contributionMap = new Map<string, ContributionGroupEntry>();

  for (const row of rawEntries ?? []) {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });

    if (!selectedIds.has(metadata.contribution_id)) {
      continue;
    }

    const existing = contributionMap.get(metadata.contribution_id) ?? {
      contributionId: metadata.contribution_id,
      title: metadata.contribution_title,
      details: metadata.contribution_details,
      eventTitle: metadata.contribution_event_title,
      receiptSignature: metadata.contribution_receipt_signature,
      receiptSubject: metadata.contribution_receipt_subject,
      receiptMessage: metadata.contribution_receipt_message,
      receiptLogoUrl: metadata.contribution_receipt_logo_url,
      semesterId: row.semester_id ?? null,
      eventId: row.event_id ?? null,
      deadline: metadata.payable_deadline,
      payable: 0,
      paid: 0,
      outstanding: 0,
    };

    const amount = Number(row.amount_pesos ?? 0);
    if (row.entry_type === "payment" || amount < 0) {
      existing.paid += Math.abs(amount);
    } else {
      existing.payable += amount;
    }
    existing.outstanding += amount;

    if (!existing.semesterId && row.semester_id) {
      existing.semesterId = row.semester_id;
    }
    if (!existing.eventId && row.event_id) {
      existing.eventId = row.event_id;
    }
    if (!existing.deadline && metadata.payable_deadline) {
      existing.deadline = metadata.payable_deadline;
    }
    if (!existing.eventTitle && metadata.contribution_event_title) {
      existing.eventTitle = metadata.contribution_event_title;
    }
    if (!existing.details && metadata.contribution_details) {
      existing.details = metadata.contribution_details;
    }
    if (!existing.receiptSignature && metadata.contribution_receipt_signature) {
      existing.receiptSignature = metadata.contribution_receipt_signature;
    }
    if (!existing.receiptSubject && metadata.contribution_receipt_subject) {
      existing.receiptSubject = metadata.contribution_receipt_subject;
    }
    if (!existing.receiptMessage && metadata.contribution_receipt_message) {
      existing.receiptMessage = metadata.contribution_receipt_message;
    }
    if (!existing.receiptLogoUrl && metadata.contribution_receipt_logo_url) {
      existing.receiptLogoUrl = metadata.contribution_receipt_logo_url;
    }

    contributionMap.set(metadata.contribution_id, existing);
  }

  const contributionRows = Array.from(contributionMap.values());
  if (!contributionRows.length) {
    return { error: "No selected contributions found for this occupant." };
  }

  const dueByContribution = new Map<string, number>();
  for (const row of contributionRows) {
    dueByContribution.set(row.contributionId, Math.max(0, row.outstanding));
  }

  const totalDue = Array.from(dueByContribution.values()).reduce((sum, value) => sum + value, 0);
  if (totalDue <= 0) {
    return { error: "Selected contributions are already settled." };
  }

  const allocations = new Map(dueByContribution);
  const difference = Number((input.amount - totalDue).toFixed(2));
  if (Math.abs(difference) >= 0.01) {
    if (!input.allocation_target_id) {
      return { error: "Select where to apply the payment difference when amount is not exact." };
    }
    const existingTarget = allocations.get(input.allocation_target_id);
    if (existingTarget === undefined) {
      return { error: "Allocation target must be one of the selected contributions." };
    }
    const adjusted = Number((existingTarget + difference).toFixed(2));
    if (adjusted < 0) {
      return { error: "Difference is too large for the selected allocation target." };
    }
    allocations.set(input.allocation_target_id, adjusted);
  }

  const allocRows = contributionRows
    .map((row) => ({
      ...row,
      allocation: Number((allocations.get(row.contributionId) ?? 0).toFixed(2)),
    }))
    .filter((row) => row.allocation > 0);

  if (!allocRows.length) {
    return { error: "Nothing to preview after allocation." };
  }

  const signatureResult = resolveContributionReceiptSignature(allocRows);
  if ("error" in signatureResult) {
    return { error: signatureResult.error };
  }

  const templateResult = resolveContributionReceiptTemplate(allocRows);
  if ("error" in templateResult) {
    return { error: templateResult.error };
  }

  const resolvedReceiptSubject =
    input.receipt_subject?.trim() || templateResult.template.subject;
  const resolvedReceiptMessage =
    input.receipt_message?.trim() || templateResult.template.message;
  const resolvedReceiptLogoUrl =
    input.receipt_logo_url?.trim() || templateResult.template.logoUrl;
  const resolvedReceiptSignature =
    input.receipt_signature?.trim() || signatureResult.signature;

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", input.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for receipt." };
  }

  let recipientEmail = input.receipt_email_override?.trim() || occupant.contact_email?.trim() || "";

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
    const { data: authUser } = await adminClient.auth.admin.getUserById(occupant.user_id);
    recipientEmail = authUser.user?.email?.trim() || "";
  }

  if (!recipientEmail) {
    return { error: "No recipient email found for this occupant." };
  }

  const { renderContributionBatchReceiptEmail } = await import("@/lib/email");
  const rendered = renderContributionBatchReceiptEmail({
    recipientName: occupant.full_name ?? null,
    paidAtIso: input.paid_at_iso,
    method: input.method,
    contributions: allocRows.map((row) => ({
      title: row.title,
      amountPesos: row.allocation,
    })),
    totalAmountPesos: allocRows.reduce((sum, row) => sum + row.allocation, 0),
    customMessage: resolvedReceiptMessage,
    subjectOverride: resolvedReceiptSubject,
    signatureOverride: resolvedReceiptSignature,
    logoUrl: resolvedReceiptLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

export async function uploadContributionReceiptAsset(dormId: string, formData: FormData) {
  const parsed = contributionReceiptAssetUploadSchema.safeParse({
    contribution_id: formData.get("contribution_id"),
    asset_type: formData.get("asset_type"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt asset upload payload." };
  }

  const fileInput = formData.get("file");
  if (!(fileInput instanceof File) || fileInput.size <= 0) {
    return { error: "Select an image file to upload." };
  }

  if (!fileInput.type.startsWith("image/")) {
    return { error: "Only image files are allowed." };
  }

  if (fileInput.size > 8 * 1024 * 1024) {
    return { error: "Image is too large. Upload an image up to 8 MB." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can upload contribution receipt assets." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const hasContribution = (rows ?? []).some((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!hasContribution) {
    return { error: "Contribution not found." };
  }

  const optimized = await optimizeImage(fileInput);
  const storagePath = `expenses/${dormId}/contribution-receipts/${input.contribution_id}/${input.asset_type}-${Date.now()}-${crypto.randomUUID()}.${optimized.extension}`;

  let uploadClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    uploadClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: uploadError } = await uploadClient.storage
    .from("dormy-uploads")
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.contentType,
      upsert: false,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { data: signedData, error: signedError } = await uploadClient.storage
    .from("dormy-uploads")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

  if (signedError || !signedData?.signedUrl) {
    return { error: signedError?.message ?? "Failed to generate asset URL." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_asset_uploaded",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        asset_type: input.asset_type,
        storage_path: storagePath,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for contribution receipt asset upload:", auditError);
  }

  return {
    success: true,
    asset_url: signedData.signedUrl,
    storage_path: storagePath,
  };
}

export async function updateContributionReceiptTemplate(
  dormId: string,
  payload: z.infer<typeof contributionReceiptTemplateSchema>
) {
  const parsed = contributionReceiptTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt template payload." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update contribution receipt templates." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const matchingRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!matchingRows.length) {
    return { error: "Contribution not found." };
  }

  const normalizedSubject = input.subject?.trim() || null;
  const normalizedMessage = input.message?.trim() || null;
  const normalizedLogoUrl = input.logo_url?.trim() || null;

  let updateClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    updateClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  for (const row of matchingRows) {
    const currentMetadata = asMetadataRecord(row.metadata);
    const nextMetadata = {
      ...currentMetadata,
      contribution_receipt_subject: normalizedSubject,
      contribution_receipt_message: normalizedMessage,
      contribution_receipt_logo_url: normalizedLogoUrl,
    };

    const { error: updateError } = await updateClient
      .from("ledger_entries")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_template_updated",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        subject_length: normalizedSubject?.length ?? 0,
        message_length: normalizedMessage?.length ?? 0,
        has_logo: Boolean(normalizedLogoUrl),
        updated_rows: matchingRows.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for receipt template update:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/finance/events/${input.contribution_id}/receipt`);
  revalidatePath(`/${activeRole}/finance/events`);

  return {
    success: true,
    updatedCount: matchingRows.length,
  };
}

export async function previewContributionReceiptTemplateEmail(
  dormId: string,
  payload: z.infer<typeof contributionReceiptTemplatePreviewSchema>
) {
  const parsed = contributionReceiptTemplatePreviewSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt preview payload." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can preview contribution receipt templates." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const contributionRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!contributionRows.length) {
    return { error: "Contribution not found." };
  }

  const normalizedMetadata = contributionRows.map((row) =>
    parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    })
  );

  const contributionTitle =
    normalizedMetadata.find((item) => item.contribution_title.trim().length > 0)?.contribution_title ??
    "Contribution";
  const savedSubject =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_subject))?.contribution_receipt_subject ??
    null;
  const savedMessage =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_message))?.contribution_receipt_message ??
    null;
  const savedLogoUrl =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_logo_url))?.contribution_receipt_logo_url ??
    null;
  const savedSignature =
    normalizedMetadata.find((item) => Boolean(item.contribution_receipt_signature))?.contribution_receipt_signature ??
    null;

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, user_id, full_name, contact_email")
    .eq("dorm_id", dormId)
    .eq("id", input.occupant_id)
    .maybeSingle();

  if (!occupant) {
    return { error: "Occupant not found for preview." };
  }

  let recipientEmail = occupant.contact_email?.trim() || "";
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
    recipientEmail = authUserResult.user?.email?.trim() || "";
  }

  if (!recipientEmail) {
    return { error: "No recipient email found for this occupant." };
  }

  const resolvedPaidAtIso = input.paid_at_iso ?? new Date().toISOString();
  const resolvedSubject = input.subject?.trim() || savedSubject;
  const resolvedMessage = input.message?.trim() || savedMessage;
  const resolvedLogoUrl = input.logo_url?.trim() || savedLogoUrl;
  const resolvedSignature = input.signature?.trim() || savedSignature;

  const { renderContributionBatchReceiptEmail } = await import("@/lib/email");
  const rendered = renderContributionBatchReceiptEmail({
    recipientName: occupant.full_name ?? null,
    paidAtIso: resolvedPaidAtIso,
    method: input.method ?? "cash",
    contributions: [
      {
        title: contributionTitle,
        amountPesos: input.amount,
      },
    ],
    totalAmountPesos: input.amount,
    customMessage: resolvedMessage,
    subjectOverride: resolvedSubject,
    signatureOverride: resolvedSignature,
    logoUrl: resolvedLogoUrl,
  });

  return {
    success: true,
    recipient_email: recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  };
}

export async function updateContributionReceiptSignature(
  dormId: string,
  payload: z.infer<typeof contributionReceiptSignatureSchema>
) {
  const parsed = contributionReceiptSignatureSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid receipt signature payload." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update contribution receipt signatures." };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (rowsError) {
    return { error: rowsError.message };
  }

  const matchingRows = (rows ?? []).filter((row) => {
    const metadata = parseContributionMetadata(row.metadata, {
      eventId: row.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!matchingRows.length) {
    return { error: "Contribution not found." };
  }

  let updateClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    updateClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  for (const row of matchingRows) {
    const currentMetadata = asMetadataRecord(row.metadata);
    const nextMetadata = {
      ...currentMetadata,
      contribution_receipt_signature: input.signature,
    };

    const { error: updateError } = await updateClient
      .from("ledger_entries")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_receipt_signature_updated",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        signature_length: input.signature.length,
        updated_rows: matchingRows.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for receipt signature update:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/finance/events/${input.contribution_id}/receipt`);
  revalidatePath(`/${activeRole}/finance/events`);

  return {
    success: true,
    updatedCount: matchingRows.length,
  };
}

export async function overrideContributionPayable(
  dormId: string,
  payload: z.infer<typeof contributionPayableOverrideSchema>
) {
  const parsed = contributionPayableOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payable override payload." };
  }

  const input = parsed.data;
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

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  if (!memberships.some(m => new Set(["admin", "treasurer"]).has(m.role))) {
    return { error: "Only admins and treasurers can update payable amounts." };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("id, semester_id, event_id, amount_pesos, entry_type, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("occupant_id", input.occupant_id)
    .is("voided_at", null);

  if (entriesError) {
    return { error: entriesError.message };
  }

  const contributionEntries = (entries ?? []).filter((entry) => {
    const metadata = parseContributionMetadata(entry.metadata, {
      eventId: entry.event_id,
      note: null,
    });
    return metadata.contribution_id === input.contribution_id;
  });

  if (!contributionEntries.length) {
    return { error: "Contribution record not found for this occupant." };
  }

  const currentPayable = contributionEntries.reduce((sum, entry) => {
    const amount = Number(entry.amount_pesos ?? 0);
    if (entry.entry_type === "payment") {
      return sum;
    }
    return sum + amount;
  }, 0);

  const delta = Number((input.new_payable - currentPayable).toFixed(2));
  if (Math.abs(delta) < 0.01) {
    return { success: true, payable: input.new_payable };
  }

  const referenceRow = contributionEntries[0];
  const referenceMetadata = parseContributionMetadata(referenceRow.metadata, {
    eventId: referenceRow.event_id,
    note: null,
  });
  const semesterId =
    contributionEntries.find((entry) => entry.semester_id)?.semester_id ?? referenceRow.semester_id ?? null;

  let writeClient: typeof supabase = supabase;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = await import("@supabase/supabase-js");
    writeClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    ) as typeof supabase;
  }

  const { error: insertError } = await writeClient.from("ledger_entries").insert({
    dorm_id: dormId,
    semester_id: semesterId,
    ledger: "contributions",
    entry_type: "adjustment",
    occupant_id: input.occupant_id,
    event_id: referenceRow.event_id,
    amount_pesos: delta,
    method: "payable_override",
    note: `Payable override: ${input.reason}`,
    metadata: {
      contribution_id: input.contribution_id,
      contribution_title: referenceMetadata.contribution_title,
      contribution_details: referenceMetadata.contribution_details,
      contribution_event_title: referenceMetadata.contribution_event_title,
      payable_deadline: referenceMetadata.payable_deadline,
      contribution_receipt_signature: referenceMetadata.contribution_receipt_signature,
      contribution_receipt_subject: referenceMetadata.contribution_receipt_subject,
      contribution_receipt_message: referenceMetadata.contribution_receipt_message,
      contribution_receipt_logo_url: referenceMetadata.contribution_receipt_logo_url,
      override_reason: input.reason,
      override_previous_payable: currentPayable,
      override_new_payable: input.new_payable,
    },
    created_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "finance.contribution_payable_overridden",
      entityType: "finance",
      entityId: input.contribution_id,
      metadata: {
        occupant_id: input.occupant_id,
        reason: input.reason,
        old_payable: currentPayable,
        new_payable: input.new_payable,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for payable override:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events/${input.contribution_id}`);
  revalidatePath(`/${activeRole}/finance/events`);
  revalidatePath(`/${activeRole}/payments`);

  return { success: true, payable: input.new_payable };
}

export async function createMaintenanceBatch(
  dormId: string,
  payload: {
    amount: number;
    description: string;
    deadline?: string | null;
  }
) {
  // We can reuse the same schema logic as contribution
  const parsed = contributionBatchSchema.safeParse({
    amount: payload.amount,
    title: payload.description,
    details: payload.description,
    deadline: payload.deadline ?? null,
    include_already_charged: false,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid maintenance charge input." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "Forbidden" };
  }

  // Allowed roles for maintenance fee bulk charge
  if (!memberships.some(m => new Set(["admin", "adviser"]).has(m.role))) {
    return { error: "Only admins and advisers can create maintenance charges." };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
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

  const targetOccupantIds = occupants.map((occupant) => occupant.id);

  const batchId = crypto.randomUUID();
  const deadlineIso = parsed.data.deadline
    ? new Date(parsed.data.deadline).toISOString()
    : null;

  const { error: insertError } = await supabase.from("ledger_entries").insert(
    targetOccupantIds.map((occupantId) => ({
      dorm_id: dormId,
      semester_id: semesterResult.semesterId,
      ledger: "maintenance_fee",
      entry_type: "charge",
      occupant_id: occupantId,
      amount_pesos: Math.abs(parsed.data.amount),
      method: "manual_charge",
      note: parsed.data.title,
      metadata: {
        payable_batch_id: batchId,
        payable_deadline: deadlineIso,
        payable_label: parsed.data.title,
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
      action: "finance.maintenance_batch_created",
      entityType: "finance",
      entityId: batchId,
      metadata: {
        amount_pesos: Math.abs(parsed.data.amount),
        description: parsed.data.title,
        deadline: deadlineIso,
        charged_count: targetOccupantIds.length,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for maintenance batch creation:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/maintenance`);
  revalidatePath(`/${activeRole}/payments`);

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
    if (entry.ledger === 'maintenance_fee') balances.maintenance += amount;
    if (entry.ledger === 'sa_fines') balances.fines += amount;
    if (entry.ledger === 'contributions') balances.events += amount;
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
  // Strictly separate: must be cleared in EACH ledger category.
  // Assuming positive balance = debt.
  return (
    balances.maintenance <= 0 &&
    balances.fines <= 0 &&
    balances.events <= 0
  );
}

export type DormFinanceOverview = {
  maintenance_fee: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
  contributions: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
  committee_funds: {
    approved_expenses: number;
    pending_expenses: number;
    committee_count: number;
  };
  totals: {
    charged: number;
    collected: number;
    approved_expenses: number;
    outstanding: number;
  };
};

export async function getDormFinanceOverview(dormId: string): Promise<DormFinanceOverview | { error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships?.length) {
    return { error: "Forbidden" };
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "No active semester found." };
  }

  const [{ data: ledgerEntries, error: ledgerError }, { data: expenses, error: expensesError }, { count: committeeCount }] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select("ledger, amount_pesos, voided_at, semester_id")
        .eq("dorm_id", dormId)
        .eq("semester_id", semesterResult.semesterId)
        .is("voided_at", null),
      supabase
        .from("expenses")
        .select("amount_pesos, status, category, committee_id, semester_id")
        .eq("dorm_id", dormId)
        .eq("semester_id", semesterResult.semesterId),
      supabase
        .from("committees")
        .select("id", { count: "exact", head: true })
        .eq("dorm_id", dormId),
    ]);

  if (ledgerError) {
    return { error: ledgerError.message };
  }
  if (expensesError) {
    return { error: expensesError.message };
  }

  let maintenanceCharged = 0;
  let maintenanceCollected = 0;
  let contributionsCharged = 0;
  let contributionsCollected = 0;

  for (const entry of ledgerEntries ?? []) {
    const amount = Number(entry.amount_pesos ?? 0);
    if (entry.ledger === "maintenance_fee") {
      if (amount >= 0) maintenanceCharged += amount;
      else maintenanceCollected += Math.abs(amount);
    }
    if (entry.ledger === "contributions") {
      if (amount >= 0) contributionsCharged += amount;
      else contributionsCollected += Math.abs(amount);
    }
  }

  let maintenanceApprovedExpenses = 0;
  let contributionsApprovedExpenses = 0;
  let committeeApprovedExpenses = 0;
  let committeePendingExpenses = 0;

  for (const expense of expenses ?? []) {
    const amount = Number(expense.amount_pesos ?? 0);
    const isApproved = expense.status === "approved";
    const isPending = expense.status === "pending";

    if (expense.category === "maintenance_fee" && isApproved) {
      maintenanceApprovedExpenses += amount;
    }

    if (expense.category === "contributions" && isApproved) {
      contributionsApprovedExpenses += amount;
    }

    if (expense.committee_id) {
      if (isApproved) committeeApprovedExpenses += amount;
      if (isPending) committeePendingExpenses += amount;
    }
  }

  const maintenanceOutstanding = Math.max(0, maintenanceCharged - maintenanceCollected);
  const contributionsOutstanding = Math.max(0, contributionsCharged - contributionsCollected);

  const totalCharged = maintenanceCharged + contributionsCharged;
  const totalCollected = maintenanceCollected + contributionsCollected;
  const totalApprovedExpenses = maintenanceApprovedExpenses + contributionsApprovedExpenses;
  const totalOutstanding = Math.max(0, totalCharged - totalCollected);

  return {
    maintenance_fee: {
      charged: maintenanceCharged,
      collected: maintenanceCollected,
      approved_expenses: maintenanceApprovedExpenses,
      outstanding: maintenanceOutstanding,
    },
    contributions: {
      charged: contributionsCharged,
      collected: contributionsCollected,
      approved_expenses: contributionsApprovedExpenses,
      outstanding: contributionsOutstanding,
    },
    committee_funds: {
      approved_expenses: committeeApprovedExpenses,
      pending_expenses: committeePendingExpenses,
      committee_count: committeeCount ?? 0,
    },
    totals: {
      charged: totalCharged,
      collected: totalCollected,
      approved_expenses: totalApprovedExpenses,
      outstanding: totalOutstanding,
    },
  };
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
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  if (!memberships?.length || !memberships.some(m => ['admin', 'treasurer', 'adviser', 'assistant_adviser'].includes(m.role))) {
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

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance/events/${entityId}`);
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

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}/finance`);
  return { success: true };
}
