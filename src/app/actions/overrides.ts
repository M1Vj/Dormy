"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const reasonSchema = z.string().trim().min(5).max(400);
const occupantStatusSchema = z.enum(["active", "left", "removed"]);

const occupantOverrideSchema = z.object({
  occupant_id: z.string().uuid(),
  reason: reasonSchema,
  full_name: z.string().trim().min(2).max(180).optional(),
  student_id: z.string().trim().max(80).optional(),
  course: z.string().trim().max(120).optional(),
  joined_at: z.string().trim().optional(),
  left_at: z.string().trim().optional(),
  status: occupantStatusSchema.optional(),
  clear_student_id: z.boolean().optional().default(false),
  clear_course: z.boolean().optional().default(false),
  clear_left_at: z.boolean().optional().default(false),
});

const fineOverrideSchema = z.object({
  fine_id: z.string().uuid(),
  reason: reasonSchema,
  pesos: z.number().min(0),
  points: z.number().min(0),
  note: z.string().trim().max(500).optional(),
  clear_note: z.boolean().optional().default(false),
  rule_id: z.string().uuid().optional(),
  clear_rule: z.boolean().optional().default(false),
  restore_if_voided: z.boolean().optional().default(false),
});

const ledgerOccupantOverrideSchema = z.object({
  entry_id: z.string().uuid(),
  occupant_id: z.string().uuid(),
  reason: reasonSchema,
});

const eventOverrideSchema = z.object({
  event_id: z.string().uuid(),
  reason: reasonSchema,
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(250).optional(),
  starts_at: z.string().trim().optional(),
  ends_at: z.string().trim().optional(),
  is_competition: z.boolean().optional(),
  clear_description: z.boolean().optional().default(false),
  clear_location: z.boolean().optional().default(false),
});

const eventDeadlineOverrideSchema = z.object({
  event_id: z.string().uuid(),
  reason: reasonSchema,
  deadline: z.string().trim().optional(),
  clear_deadline: z.boolean().optional().default(false),
});

const cleaningAssignmentOverrideSchema = z.object({
  week_id: z.string().uuid(),
  room_id: z.string().uuid(),
  area_id: z.string().uuid().optional(),
  reason: reasonSchema,
  allow_rest_level: z.boolean().optional().default(false),
  clear_area: z.boolean().optional().default(false),
});

const cleaningRestLevelOverrideSchema = z.object({
  week_id: z.string().uuid(),
  rest_level: z.number().int().min(1).max(3).optional(),
  reason: reasonSchema,
  clear_rest_level: z.boolean().optional().default(false),
});

const evaluationScoreOverrideSchema = z.object({
  submission_id: z.string().uuid(),
  metric_id: z.string().uuid(),
  score: z.number(),
  reason: reasonSchema,
});

type AdminContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
};

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value);
}

function parseDateOnly(value: string | undefined) {
  if (!value) {
    return { value: null as string | null };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null as string | null };
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { error: "Use YYYY-MM-DD format for date values." };
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Date value is invalid." };
  }
  return { value: trimmed };
}

function parseDateTime(value: string | undefined) {
  if (!value) {
    return { value: null as string | null };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: null as string | null };
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { error: "Date and time value is invalid." };
  }
  return { value: parsed.toISOString() };
}

async function requireDormAdmin(dormId: string): Promise<AdminContext | { error: string }> {
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

  if (membership.role !== "admin") {
    return { error: "Only admins can run override operations." };
  }

  return {
    supabase,
    userId: user.id,
  };
}

function hasKeys(payload: Record<string, unknown>) {
  return Object.keys(payload).length > 0;
}

export async function overrideOccupantRecord(
  dormId: string,
  payload: {
    occupant_id: string;
    reason: string;
    full_name?: string;
    student_id?: string;
    course?: string;
    joined_at?: string;
    left_at?: string;
    status?: "active" | "left" | "removed";
    clear_student_id?: boolean;
    clear_course?: boolean;
    clear_left_at?: boolean;
  }
) {
  const parsed = occupantOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid occupant override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;
  const { data: occupant, error: occupantError } = await supabase
    .from("occupants")
    .select(
      "id, full_name, student_id, course:classification, joined_at, left_at, status, contact_mobile, contact_email, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship"
    )
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.occupant_id)
    .maybeSingle();

  if (occupantError || !occupant) {
    return { error: occupantError?.message ?? "Occupant not found." };
  }

  const updates: Record<string, unknown> = {};

  if (parsed.data.full_name) {
    updates.full_name = parsed.data.full_name;
  }
  if (parsed.data.clear_student_id) {
    updates.student_id = null;
  } else if (parsed.data.student_id !== undefined) {
    updates.student_id = parsed.data.student_id.trim() || null;
  }
  if (parsed.data.clear_course) {
    updates.course = null;
  } else if (parsed.data.course !== undefined) {
    updates.course = parsed.data.course.trim() || null;
  }

  if (parsed.data.joined_at !== undefined) {
    const joinedAt = parseDateOnly(parsed.data.joined_at);
    if ("error" in joinedAt) {
      return { error: joinedAt.error };
    }
    if (joinedAt.value) {
      updates.joined_at = joinedAt.value;
    }
  }

  if (parsed.data.clear_left_at) {
    updates.left_at = null;
  } else if (parsed.data.left_at !== undefined) {
    const leftAt = parseDateOnly(parsed.data.left_at);
    if ("error" in leftAt) {
      return { error: leftAt.error };
    }
    updates.left_at = leftAt.value;
  }

  if (parsed.data.status) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "active" && !("left_at" in updates)) {
      updates.left_at = null;
    }
    if (
      (parsed.data.status === "left" || parsed.data.status === "removed") &&
      !("left_at" in updates) &&
      !occupant.left_at
    ) {
      updates.left_at = new Date().toISOString().slice(0, 10);
    }
  }

  if (!hasKeys(updates)) {
    return { error: "No override changes were provided." };
  }

  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("occupants")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.occupant_id);

  if (updateError) {
    return { error: updateError.message };
  }

  const changedFields = Object.keys(updates).filter(
    (field) => field !== "updated_at" && normalizeValue(occupant[field as keyof typeof occupant]) !== normalizeValue(updates[field])
  );

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.occupant_updated",
      entityType: "occupant",
      entityId: parsed.data.occupant_id,
      metadata: {
        reason: parsed.data.reason,
        changed_fields: changedFields,
        previous: {
          full_name: occupant.full_name,
          student_id: occupant.student_id,
          course: occupant.course,
          joined_at: occupant.joined_at,
          left_at: occupant.left_at,
          status: occupant.status,
        },
        updates,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for occupant override:", error);
  }

  revalidatePath("/admin/occupants");
  revalidatePath(`/admin/occupants/${parsed.data.occupant_id}`);
  revalidatePath("/occupants");
  revalidatePath(`/occupants/${parsed.data.occupant_id}`);
  revalidatePath("/admin/overrides");

  return { success: true };
}

export async function overrideFineRecord(
  dormId: string,
  payload: {
    fine_id: string;
    reason: string;
    pesos: number;
    points: number;
    note?: string;
    clear_note?: boolean;
    rule_id?: string;
    clear_rule?: boolean;
    restore_if_voided?: boolean;
  }
) {
  const parsed = fineOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid fine override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;
  const { data: fine, error: fineError } = await supabase
    .from("fines")
    .select("id, occupant_id, rule_id, pesos, points, note, voided_at, voided_by, void_reason")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.fine_id)
    .maybeSingle();

  if (fineError || !fine) {
    return { error: fineError?.message ?? "Fine not found." };
  }

  const updates: Record<string, unknown> = {
    pesos: parsed.data.pesos,
    points: parsed.data.points,
  };

  if (parsed.data.clear_note) {
    updates.note = null;
  } else if (parsed.data.note !== undefined) {
    updates.note = parsed.data.note.trim() || null;
  }

  if (parsed.data.clear_rule) {
    updates.rule_id = null;
  } else if (parsed.data.rule_id !== undefined) {
    updates.rule_id = parsed.data.rule_id;
  }

  if (parsed.data.restore_if_voided && fine.voided_at) {
    updates.voided_at = null;
    updates.voided_by = null;
    updates.void_reason = null;
  }

  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("fines")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.fine_id);

  if (updateError) {
    return { error: updateError.message };
  }

  const notePrefix =
    parsed.data.clear_note
      ? "Fine: Violation"
      : parsed.data.note !== undefined
        ? `Fine: ${parsed.data.note.trim() || "Violation"}`
        : undefined;

  const ledgerPatch: Record<string, unknown> = {
    amount_pesos: Math.abs(parsed.data.pesos),
    updated_at: new Date().toISOString(),
  };
  if (notePrefix !== undefined) {
    ledgerPatch.note = notePrefix;
  }

  const { data: ledgerRows, error: ledgerReadError } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("fine_id", parsed.data.fine_id)
    .eq("ledger", "sa_fines")
    .eq("entry_type", "charge")
    .is("voided_at", null);

  if (ledgerReadError) {
    return { error: ledgerReadError.message };
  }

  let syncedLedgerCount = 0;
  if ((ledgerRows ?? []).length > 0) {
    const { error: ledgerUpdateError } = await supabase
      .from("ledger_entries")
      .update(ledgerPatch)
      .eq("dorm_id", dormId)
      .eq("fine_id", parsed.data.fine_id)
      .eq("ledger", "sa_fines")
      .eq("entry_type", "charge")
      .is("voided_at", null);

    if (ledgerUpdateError) {
      return { error: ledgerUpdateError.message };
    }
    syncedLedgerCount = ledgerRows?.length ?? 0;
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.fine_updated",
      entityType: "fine",
      entityId: parsed.data.fine_id,
      metadata: {
        reason: parsed.data.reason,
        previous: {
          pesos: fine.pesos,
          points: fine.points,
          note: fine.note,
          rule_id: fine.rule_id,
          voided_at: fine.voided_at,
        },
        updates,
        synced_ledger_entries: syncedLedgerCount,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for fine override:", error);
  }

  revalidatePath("/admin/fines");
  revalidatePath(`/admin/occupants/${fine.occupant_id}`);
  revalidatePath("/payments");
  revalidatePath("/admin/overrides");

  return { success: true };
}

export async function overrideLedgerEntryOccupant(
  dormId: string,
  payload: {
    entry_id: string;
    occupant_id: string;
    reason: string;
  }
) {
  const parsed = ledgerOccupantOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid ledger override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;
  const [{ data: entry, error: entryError }, { data: targetOccupant, error: occupantError }] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select("id, occupant_id, ledger, entry_type, amount_pesos, fine_id, event_id, voided_at")
        .eq("dorm_id", dormId)
        .eq("id", parsed.data.entry_id)
        .maybeSingle(),
      supabase
        .from("occupants")
        .select("id, full_name")
        .eq("dorm_id", dormId)
        .eq("id", parsed.data.occupant_id)
        .maybeSingle(),
    ]);

  if (entryError || !entry) {
    return { error: entryError?.message ?? "Ledger entry not found." };
  }
  if (entry.voided_at) {
    return { error: "Ledger entry is voided and cannot be reassigned." };
  }
  if (occupantError || !targetOccupant) {
    return { error: occupantError?.message ?? "Target occupant not found." };
  }
  if (entry.occupant_id === parsed.data.occupant_id) {
    return { error: "Ledger entry is already assigned to the selected occupant." };
  }

  let updatedCount = 0;
  if (entry.fine_id) {
    const { error: fineUpdateError } = await supabase
      .from("fines")
      .update({ occupant_id: parsed.data.occupant_id, updated_at: new Date().toISOString() })
      .eq("dorm_id", dormId)
      .eq("id", entry.fine_id);
    if (fineUpdateError) {
      return { error: fineUpdateError.message };
    }

    const { data: fineLinkedEntries, error: linkedReadError } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("dorm_id", dormId)
      .eq("fine_id", entry.fine_id);

    if (linkedReadError) {
      return { error: linkedReadError.message };
    }

    const { error: linkedUpdateError } = await supabase
      .from("ledger_entries")
      .update({ occupant_id: parsed.data.occupant_id, updated_at: new Date().toISOString() })
      .eq("dorm_id", dormId)
      .eq("fine_id", entry.fine_id);

    if (linkedUpdateError) {
      return { error: linkedUpdateError.message };
    }

    updatedCount = fineLinkedEntries?.length ?? 0;
  } else {
    const { error: singleUpdateError } = await supabase
      .from("ledger_entries")
      .update({ occupant_id: parsed.data.occupant_id, updated_at: new Date().toISOString() })
      .eq("dorm_id", dormId)
      .eq("id", parsed.data.entry_id);

    if (singleUpdateError) {
      return { error: singleUpdateError.message };
    }

    updatedCount = 1;
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.ledger_occupant_reassigned",
      entityType: "ledger_entry",
      entityId: parsed.data.entry_id,
      metadata: {
        reason: parsed.data.reason,
        previous_occupant_id: entry.occupant_id,
        new_occupant_id: parsed.data.occupant_id,
        fine_id: entry.fine_id,
        event_id: entry.event_id,
        ledger: entry.ledger,
        entry_type: entry.entry_type,
        amount_pesos: entry.amount_pesos,
        updated_entries: updatedCount,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for ledger occupant override:", error);
  }

  revalidatePath("/payments");
  revalidatePath("/admin/finance/maintenance");
  revalidatePath("/admin/finance/events");
  if (entry.event_id) {
    revalidatePath(`/admin/finance/events/${entry.event_id}`);
  }
  revalidatePath("/admin/fines");
  revalidatePath("/admin/overrides");

  return { success: true };
}

export async function overrideEventRecord(
  dormId: string,
  payload: {
    event_id: string;
    reason: string;
    title?: string;
    description?: string;
    location?: string;
    starts_at?: string;
    ends_at?: string;
    is_competition?: boolean;
    clear_description?: boolean;
    clear_location?: boolean;
  }
) {
  const parsed = eventOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid event override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, is_competition")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.event_id)
    .maybeSingle();

  if (eventError || !event) {
    return { error: eventError?.message ?? "Event not found." };
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title) {
    updates.title = parsed.data.title;
  }
  if (parsed.data.clear_description) {
    updates.description = null;
  } else if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description.trim() || null;
  }
  if (parsed.data.clear_location) {
    updates.location = null;
  } else if (parsed.data.location !== undefined) {
    updates.location = parsed.data.location.trim() || null;
  }
  if (parsed.data.is_competition !== undefined) {
    updates.is_competition = parsed.data.is_competition;
  }
  if (parsed.data.starts_at !== undefined) {
    const startsAt = parseDateTime(parsed.data.starts_at);
    if ("error" in startsAt) {
      return { error: startsAt.error };
    }
    updates.starts_at = startsAt.value;
  }
  if (parsed.data.ends_at !== undefined) {
    const endsAt = parseDateTime(parsed.data.ends_at);
    if ("error" in endsAt) {
      return { error: endsAt.error };
    }
    updates.ends_at = endsAt.value;
  }

  if (!hasKeys(updates)) {
    return { error: "No override changes were provided." };
  }

  const startsAtCandidate =
    (updates.starts_at as string | null | undefined) ?? (event.starts_at as string | null);
  const endsAtCandidate =
    (updates.ends_at as string | null | undefined) ?? (event.ends_at as string | null);
  if (startsAtCandidate && endsAtCandidate) {
    const startsAt = new Date(startsAtCandidate);
    const endsAt = new Date(endsAtCandidate);
    if (endsAt < startsAt) {
      return { error: "Event end time cannot be earlier than start time." };
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("events")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.event_id);

  if (updateError) {
    return { error: updateError.message };
  }

  const changedFields = Object.keys(updates).filter(
    (field) => field !== "updated_at" && normalizeValue(event[field as keyof typeof event]) !== normalizeValue(updates[field])
  );

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.event_updated",
      entityType: "event",
      entityId: parsed.data.event_id,
      metadata: {
        reason: parsed.data.reason,
        changed_fields: changedFields,
        previous: {
          title: event.title,
          description: event.description,
          location: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          is_competition: event.is_competition,
        },
        updates,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for event override:", error);
  }

  revalidatePath("/events");
  revalidatePath(`/events/${parsed.data.event_id}`);
  revalidatePath("/admin/finance/events");
  revalidatePath(`/admin/finance/events/${parsed.data.event_id}`);
  revalidatePath("/admin/overrides");

  return { success: true };
}

export async function overrideEventPayableDeadline(
  dormId: string,
  payload: {
    event_id: string;
    reason: string;
    deadline?: string;
    clear_deadline?: boolean;
  }
) {
  const parsed = eventDeadlineOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payable deadline override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }

  const { supabase, userId } = context;
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.event_id)
    .maybeSingle();

  if (eventError || !event) {
    return { error: eventError?.message ?? "Event not found." };
  }

  let deadlineIso: string | null = null;
  if (!parsed.data.clear_deadline) {
    const deadlineParsed = parseDateTime(parsed.data.deadline);
    if ("error" in deadlineParsed) {
      return { error: deadlineParsed.error };
    }
    deadlineIso = deadlineParsed.value;
    if (!deadlineIso) {
      return { error: "Provide a deadline or select clear deadline." };
    }
  }

  const { data: entries, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("id, metadata")
    .eq("dorm_id", dormId)
    .eq("ledger", "contributions")
    .eq("entry_type", "charge")
    .eq("event_id", parsed.data.event_id)
    .is("voided_at", null);

  if (entriesError) {
    return { error: entriesError.message };
  }

  if (!entries?.length) {
    return { error: "No payable charge entries found for this event." };
  }

  const previousDeadlines = new Set<string>();
  for (const entry of entries) {
    const metadata =
      entry.metadata && typeof entry.metadata === "object"
        ? (entry.metadata as Record<string, unknown>)
        : {};
    const previous = metadata.payable_deadline;
    if (typeof previous === "string" && previous.trim()) {
      previousDeadlines.add(previous);
    }

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      payable_deadline: deadlineIso,
      payable_deadline_overridden_at: new Date().toISOString(),
      payable_deadline_overridden_by: userId,
    };

    const { error: updateError } = await supabase
      .from("ledger_entries")
      .update({
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("dorm_id", dormId)
      .eq("id", entry.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.event_payable_deadline_updated",
      entityType: "event",
      entityId: parsed.data.event_id,
      metadata: {
        reason: parsed.data.reason,
        event_title: event.title,
        previous_deadlines: [...previousDeadlines],
        new_deadline: deadlineIso,
        affected_entries: entries.length,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for payable deadline override:", error);
  }

  revalidatePath("/admin/finance/events");
  revalidatePath(`/admin/finance/events/${parsed.data.event_id}`);
  revalidatePath("/payments");
  revalidatePath("/admin/overrides");

  return { success: true };
}

export async function overrideCleaningAssignment(
  dormId: string,
  payload: {
    week_id: string;
    room_id: string;
    area_id?: string;
    reason: string;
    allow_rest_level?: boolean;
    clear_area?: boolean;
  }
) {
  const parsed = cleaningAssignmentOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cleaning assignment override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }
  const { supabase, userId } = context;

  const [{ data: week, error: weekError }, { data: room, error: roomError }] = await Promise.all([
    supabase
      .from("cleaning_weeks")
      .select("id, week_start, rest_level")
      .eq("dorm_id", dormId)
      .eq("id", parsed.data.week_id)
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("id, code, level, level_override")
      .eq("dorm_id", dormId)
      .eq("id", parsed.data.room_id)
      .maybeSingle(),
  ]);

  if (weekError || !week) {
    return { error: weekError?.message ?? "Cleaning week not found." };
  }
  if (roomError || !room) {
    return { error: roomError?.message ?? "Room not found." };
  }

  const shouldClearArea = parsed.data.clear_area || !parsed.data.area_id;
  const targetAreaId = shouldClearArea ? null : parsed.data.area_id ?? null;

  if (
    week.rest_level &&
    (room.level_override ?? room.level) === week.rest_level &&
    !parsed.data.allow_rest_level &&
    targetAreaId
  ) {
    return {
      error: `Level ${week.rest_level} is rest level for this week. Enable rest-level override to proceed.`,
    };
  }

  if (targetAreaId) {
    const { data: area, error: areaError } = await supabase
      .from("cleaning_areas")
      .select("id, name, active")
      .eq("dorm_id", dormId)
      .eq("id", targetAreaId)
      .maybeSingle();

    if (areaError || !area) {
      return { error: areaError?.message ?? "Cleaning area not found." };
    }
  }

  const { data: previousAssignment } = await supabase
    .from("cleaning_assignments")
    .select("id, area_id")
    .eq("dorm_id", dormId)
    .eq("cleaning_week_id", parsed.data.week_id)
    .eq("room_id", parsed.data.room_id)
    .maybeSingle();

  const { error: deleteError } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("dorm_id", dormId)
    .eq("cleaning_week_id", parsed.data.week_id)
    .eq("room_id", parsed.data.room_id);
  if (deleteError) {
    return { error: deleteError.message };
  }

  if (targetAreaId) {
    const { error: insertError } = await supabase.from("cleaning_assignments").insert({
      dorm_id: dormId,
      cleaning_week_id: parsed.data.week_id,
      room_id: parsed.data.room_id,
      area_id: targetAreaId,
    });
    if (insertError) {
      return { error: insertError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.cleaning_assignment_updated",
      entityType: "cleaning_assignment",
      entityId: previousAssignment?.id ?? null,
      metadata: {
        reason: parsed.data.reason,
        week_id: parsed.data.week_id,
        week_start: week.week_start,
        room_id: parsed.data.room_id,
        room_code: room.code,
        room_level: room.level_override ?? room.level,
        rest_level: week.rest_level,
        allow_rest_level: parsed.data.allow_rest_level,
        previous_area_id: previousAssignment?.area_id ?? null,
        new_area_id: targetAreaId,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for cleaning assignment override:", error);
  }

  revalidatePath("/cleaning");
  revalidatePath("/admin/overrides");
  return { success: true };
}

export async function overrideCleaningRestLevel(
  dormId: string,
  payload: {
    week_id: string;
    rest_level?: number;
    reason: string;
    clear_rest_level?: boolean;
  }
) {
  const parsed = cleaningRestLevelOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cleaning rest-level override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }
  const { supabase, userId } = context;

  const { data: week, error: weekError } = await supabase
    .from("cleaning_weeks")
    .select("id, week_start, rest_level")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.week_id)
    .maybeSingle();

  if (weekError || !week) {
    return { error: weekError?.message ?? "Cleaning week not found." };
  }

  let targetRestLevel: number | null = null;
  if (!parsed.data.clear_rest_level) {
    if (typeof parsed.data.rest_level !== "number") {
      return { error: "Choose a rest level or clear the current rest level." };
    }
    targetRestLevel = parsed.data.rest_level;
  }

  const { error: updateError } = await supabase
    .from("cleaning_weeks")
    .update({
      rest_level: targetRestLevel,
      updated_at: new Date().toISOString(),
    })
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.week_id);

  if (updateError) {
    return { error: updateError.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.cleaning_rest_level_updated",
      entityType: "cleaning_week",
      entityId: parsed.data.week_id,
      metadata: {
        reason: parsed.data.reason,
        week_start: week.week_start,
        previous_rest_level: week.rest_level,
        new_rest_level: targetRestLevel,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for cleaning rest-level override:", error);
  }

  revalidatePath("/cleaning");
  revalidatePath("/admin/overrides");
  return { success: true };
}

export async function overrideEvaluationMetricScore(
  dormId: string,
  payload: {
    submission_id: string;
    metric_id: string;
    score: number;
    reason: string;
  }
) {
  const parsed = evaluationScoreOverrideSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid evaluation score override payload." };
  }

  const context = await requireDormAdmin(dormId);
  if ("error" in context) {
    return { error: context.error };
  }
  const { supabase, userId } = context;

  const [{ data: submission, error: submissionError }, { data: metric, error: metricError }] =
    await Promise.all([
      supabase
        .from("evaluation_submissions")
        .select("id, template_id")
        .eq("dorm_id", dormId)
        .eq("id", parsed.data.submission_id)
        .maybeSingle(),
      supabase
        .from("evaluation_metrics")
        .select("id, template_id, name, scale_min, scale_max")
        .eq("dorm_id", dormId)
        .eq("id", parsed.data.metric_id)
        .maybeSingle(),
    ]);

  if (submissionError || !submission) {
    return { error: submissionError?.message ?? "Evaluation submission not found." };
  }
  if (metricError || !metric) {
    return { error: metricError?.message ?? "Evaluation metric not found." };
  }
  if (submission.template_id !== metric.template_id) {
    return { error: "Selected metric does not belong to the submission template." };
  }

  if (parsed.data.score < Number(metric.scale_min) || parsed.data.score > Number(metric.scale_max)) {
    return {
      error: `Score must be between ${metric.scale_min} and ${metric.scale_max} for this metric.`,
    };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("evaluation_metric_scores")
    .select("id, score")
    .eq("dorm_id", dormId)
    .eq("submission_id", parsed.data.submission_id)
    .eq("metric_id", parsed.data.metric_id)
    .order("id", { ascending: true });

  if (existingError) {
    return { error: existingError.message };
  }

  if ((existingRows ?? []).length > 0) {
    const { error: updateError } = await supabase
      .from("evaluation_metric_scores")
      .update({ score: parsed.data.score })
      .in(
        "id",
        (existingRows ?? []).map((row) => row.id)
      );
    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    const { error: insertError } = await supabase.from("evaluation_metric_scores").insert({
      dorm_id: dormId,
      submission_id: parsed.data.submission_id,
      metric_id: parsed.data.metric_id,
      score: parsed.data.score,
    });
    if (insertError) {
      return { error: insertError.message };
    }
  }

  const { data: template } = await supabase
    .from("evaluation_templates")
    .select("cycle_id")
    .eq("dorm_id", dormId)
    .eq("id", submission.template_id)
    .maybeSingle();

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "overrides.evaluation_score_updated",
      entityType: "evaluation_metric_score",
      entityId: parsed.data.submission_id,
      metadata: {
        reason: parsed.data.reason,
        submission_id: parsed.data.submission_id,
        metric_id: parsed.data.metric_id,
        metric_name: metric.name,
        previous_scores: (existingRows ?? []).map((row) => Number(row.score)),
        new_score: parsed.data.score,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for evaluation score override:", error);
  }

  revalidatePath("/evaluation");
  revalidatePath("/admin/evaluation");
  if (template?.cycle_id) {
    revalidatePath(`/admin/evaluation/${template.cycle_id}`);
  }
  revalidatePath("/admin/overrides");
  return { success: true };
}
