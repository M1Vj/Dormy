"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId, getActiveSemester, listDormSemesterArchives, listDormSemesters } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const booleanish = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return false;
}, z.boolean());

const semesterPlanSchema = z.object({
  school_year: z.string().trim().min(4).max(20),
  semester: z.string().trim().min(1).max(30),
  label: z.string().trim().min(4).max(120),
  starts_on: z.string().trim().regex(dateRegex),
  ends_on: z.string().trim().regex(dateRegex),
});

const activateSchema = z.object({
  semester_id: z.string().uuid(),
});

const archiveSchema = z.object({
  active_semester_id: z.string().uuid(),
  archive_label: z.string().trim().max(120).optional(),
  next_school_year: z.string().trim().min(4).max(20),
  next_semester: z.string().trim().min(1).max(30),
  next_label: z.string().trim().min(4).max(120),
  next_starts_on: z.string().trim().regex(dateRegex),
  next_ends_on: z.string().trim().regex(dateRegex),
  apply_occupant_turnover: booleanish,
});

type SemesterWorkspace = {
  activeSemester: Awaited<ReturnType<typeof getActiveSemester>>;
  semesters: Awaited<ReturnType<typeof listDormSemesters>>;
  archives: Awaited<ReturnType<typeof listDormSemesterArchives>>;
  activeOccupants: Array<{
    id: string;
    full_name: string;
    student_id: string | null;
    course: string | null;
  }>;
  outstandingMoney: {
    total: number;
    byLedger: {
      adviser_maintenance: number;
      sa_fines: number;
      treasurer_events: number;
    };
  };
};

type ManagerContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  role: string;
};

function summarizeOutstandingLedger(
  entries: Array<{ ledger: string; amount_pesos: number | string | null }>
) {
  const summary = {
    total: 0,
    byLedger: {
      adviser_maintenance: 0,
      sa_fines: 0,
      treasurer_events: 0,
    },
  };

  for (const entry of entries) {
    const amount = Number(entry.amount_pesos ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }

    summary.total += amount;

    if (entry.ledger === "adviser_maintenance") {
      summary.byLedger.adviser_maintenance += amount;
    }

    if (entry.ledger === "sa_fines") {
      summary.byLedger.sa_fines += amount;
    }

    if (entry.ledger === "treasurer_events") {
      summary.byLedger.treasurer_events += amount;
    }
  }

  return summary;
}

function assertDateRange(startsOn: string, endsOn: string) {
  const start = new Date(startsOn);
  const end = new Date(endsOn);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Provide valid start and end dates." } as const;
  }

  if (end < start) {
    return { error: "End date cannot be earlier than start date." } as const;
  }

  return { start, end } as const;
}

async function requireSemesterManager(dormId: string): Promise<ManagerContext | { error: string }> {
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

  const { data: membership, error } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !membership?.role) {
    return { error: error?.message ?? "Dorm membership not found." };
  }

  if (!new Set(["admin", "adviser"]).has(membership.role)) {
    return { error: "You do not have permission to manage semesters." };
  }

  return {
    supabase,
    userId: user.id,
    role: membership.role,
  };
}

export async function getSemesterWorkspace(dormId: string): Promise<SemesterWorkspace | { error: string }> {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return manager;
  }

  const { supabase } = manager;

  const ensureResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in ensureResult) {
    return { error: ensureResult.error ?? "Failed to resolve active semester." };
  }

  const [activeSemester, semesters, archives, occupantsResult, entriesResult] = await Promise.all([
    getActiveSemester(dormId, supabase),
    listDormSemesters(dormId, supabase),
    listDormSemesterArchives(dormId, supabase),
    supabase
      .from("occupants")
      .select("id, full_name, student_id, course:classification")
      .eq("dorm_id", dormId)
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("ledger_entries")
      .select("ledger, amount_pesos")
      .eq("dorm_id", dormId)
      .is("voided_at", null),
  ]);

  if (occupantsResult.error) {
    return { error: occupantsResult.error.message };
  }

  if (entriesResult.error) {
    return { error: entriesResult.error.message };
  }

  return {
    activeSemester,
    semesters,
    archives,
    activeOccupants:
      occupantsResult.data?.map((occupant) => ({
        id: occupant.id,
        full_name: occupant.full_name,
        student_id: occupant.student_id,
        course: occupant.course,
      })) ?? [],
    outstandingMoney: summarizeOutstandingLedger(
      (entriesResult.data ?? []) as Array<{ ledger: string; amount_pesos: number | string | null }>
    ),
  };
}

export async function createSemesterPlan(dormId: string, formData: FormData) {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return { error: manager.error ?? "Failed to resolve permissions." };
  }

  const parsed = semesterPlanSchema.safeParse({
    school_year: formData.get("school_year"),
    semester: formData.get("semester"),
    label: formData.get("label"),
    starts_on: formData.get("starts_on"),
    ends_on: formData.get("ends_on"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid semester values." };
  }

  const dateRange = assertDateRange(parsed.data.starts_on, parsed.data.ends_on);
  if ("error" in dateRange) {
    return { error: dateRange.error };
  }

  const { supabase, userId } = manager;

  const { data: existing } = await supabase
    .from("dorm_semesters")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("school_year", parsed.data.school_year)
    .eq("semester", parsed.data.semester)
    .maybeSingle();

  if (existing) {
    return { error: "This semester entry already exists." };
  }

  const { data: semester, error } = await supabase
    .from("dorm_semesters")
    .insert({
      dorm_id: dormId,
      school_year: parsed.data.school_year,
      semester: parsed.data.semester,
      label: parsed.data.label,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      status: "planned",
      metadata: {
        created_via: "semester_plan",
      },
    })
    .select("id")
    .single();

  if (error || !semester) {
    return { error: error?.message ?? "Failed to create semester plan." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.planned",
      entityType: "semester",
      entityId: semester.id,
      metadata: {
        school_year: parsed.data.school_year,
        semester: parsed.data.semester,
        label: parsed.data.label,
        starts_on: parsed.data.starts_on,
        ends_on: parsed.data.ends_on,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for semester planning:", auditError);
  }

  revalidatePath("/admin/terms");
  return { success: true };
}

export async function activateSemesterPlan(dormId: string, formData: FormData) {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return { error: manager.error ?? "Failed to resolve permissions." };
  }

  const parsed = activateSchema.safeParse({
    semester_id: formData.get("semester_id"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid semester selection." };
  }

  const { supabase, userId } = manager;

  const [{ data: targetSemester }, { data: activeSemester }] = await Promise.all([
    supabase
      .from("dorm_semesters")
      .select("id, status, label")
      .eq("dorm_id", dormId)
      .eq("id", parsed.data.semester_id)
      .maybeSingle(),
    supabase
      .from("dorm_semesters")
      .select("id")
      .eq("dorm_id", dormId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!targetSemester) {
    return { error: "Selected semester was not found." };
  }

  if (activeSemester && activeSemester.id !== targetSemester.id) {
    return { error: "Archive the current active semester before activating another one." };
  }

  const { error } = await supabase
    .from("dorm_semesters")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("dorm_id", dormId)
    .eq("id", targetSemester.id);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.activated",
      entityType: "semester",
      entityId: targetSemester.id,
      metadata: {
        label: targetSemester.label,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for semester activation:", auditError);
  }

  revalidatePath("/admin/terms");
  revalidatePath("/events");
  revalidatePath("/fines");
  revalidatePath("/cleaning");
  revalidatePath("/admin/evaluation");

  return { success: true };
}

export async function archiveSemesterAndStartNext(dormId: string, formData: FormData) {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return { error: manager.error ?? "Failed to resolve permissions." };
  }

  const parsed = archiveSchema.safeParse({
    active_semester_id: formData.get("active_semester_id"),
    archive_label: String(formData.get("archive_label") ?? "").trim() || undefined,
    next_school_year: formData.get("next_school_year"),
    next_semester: formData.get("next_semester"),
    next_label: formData.get("next_label"),
    next_starts_on: formData.get("next_starts_on"),
    next_ends_on: formData.get("next_ends_on"),
    apply_occupant_turnover: formData.get("apply_occupant_turnover"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid archive input." };
  }

  const dateRange = assertDateRange(parsed.data.next_starts_on, parsed.data.next_ends_on);
  if ("error" in dateRange) {
    return { error: dateRange.error };
  }

  const retainOccupantIds = formData
    .getAll("retain_occupant_ids")
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);

  const { supabase, userId } = manager;

  const { data: activeSemester, error: activeSemesterError } = await supabase
    .from("dorm_semesters")
    .select("id, school_year, semester, label, starts_on, ends_on")
    .eq("dorm_id", dormId)
    .eq("id", parsed.data.active_semester_id)
    .eq("status", "active")
    .maybeSingle();

  if (activeSemesterError || !activeSemester) {
    return { error: activeSemesterError?.message ?? "Active semester record was not found." };
  }

  const existingArchive = await supabase
    .from("dorm_semester_archives")
    .select("id")
    .eq("semester_id", activeSemester.id)
    .maybeSingle();

  if (existingArchive.data?.id) {
    return { error: "This semester is already archived." };
  }

  const [eventsResult, finesResult, weeksResult, exceptionsResult, cyclesResult, occupantsResult, ledgerResult] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, starts_at, ends_at, location, is_competition, created_at")
        .eq("dorm_id", dormId)
        .eq("semester_id", activeSemester.id)
        .order("starts_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("fines")
        .select("id, occupant_id, rule_id, pesos, points, note, issued_at, voided_at")
        .eq("dorm_id", dormId)
        .eq("semester_id", activeSemester.id)
        .order("issued_at", { ascending: true }),
      supabase
        .from("cleaning_weeks")
        .select("id, week_start, rest_level")
        .eq("dorm_id", dormId)
        .eq("semester_id", activeSemester.id)
        .order("week_start", { ascending: true }),
      supabase
        .from("cleaning_exceptions")
        .select("id, date, reason")
        .eq("dorm_id", dormId)
        .eq("semester_id", activeSemester.id)
        .order("date", { ascending: true }),
      supabase
        .from("evaluation_cycles")
        .select("id, school_year, semester, label, counts_for_retention, is_active")
        .eq("dorm_id", dormId)
        .eq("semester_id", activeSemester.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("occupants")
        .select("id, full_name, student_id, course:classification, status")
        .eq("dorm_id", dormId)
        .order("full_name", { ascending: true }),
      supabase
        .from("ledger_entries")
        .select("ledger, amount_pesos")
        .eq("dorm_id", dormId)
        .is("voided_at", null),
    ]);

  if (eventsResult.error) return { error: eventsResult.error.message };
  if (finesResult.error) return { error: finesResult.error.message };
  if (weeksResult.error) return { error: weeksResult.error.message };
  if (exceptionsResult.error) return { error: exceptionsResult.error.message };
  if (cyclesResult.error) return { error: cyclesResult.error.message };
  if (occupantsResult.error) return { error: occupantsResult.error.message };
  if (ledgerResult.error) return { error: ledgerResult.error.message };

  const cleaningWeekIds = (weeksResult.data ?? []).map((week) => week.id);

  let cleaningAssignments: Array<{
    id: string;
    cleaning_week_id: string;
    room_id: string;
    area_id: string;
  }> = [];

  if (cleaningWeekIds.length) {
    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from("cleaning_assignments")
      .select("id, cleaning_week_id, room_id, area_id")
      .eq("dorm_id", dormId)
      .in("cleaning_week_id", cleaningWeekIds);

    if (assignmentsError) {
      return { error: assignmentsError.message };
    }

    cleaningAssignments = assignmentRows ?? [];
  }

  const outstandingMoney = summarizeOutstandingLedger(
    (ledgerResult.data ?? []) as Array<{ ledger: string; amount_pesos: number | string | null }>
  );

  const snapshot = {
    archived_semester: {
      id: activeSemester.id,
      school_year: activeSemester.school_year,
      semester: activeSemester.semester,
      label: activeSemester.label,
      starts_on: activeSemester.starts_on,
      ends_on: activeSemester.ends_on,
    },
    summary: {
      events_count: eventsResult.data?.length ?? 0,
      fines_count: finesResult.data?.length ?? 0,
      cleaning_weeks_count: weeksResult.data?.length ?? 0,
      cleaning_assignments_count: cleaningAssignments.length,
      cleaning_exceptions_count: exceptionsResult.data?.length ?? 0,
      evaluation_cycles_count: cyclesResult.data?.length ?? 0,
      occupants_count: occupantsResult.data?.length ?? 0,
      outstanding_money_total: Number(outstandingMoney.total.toFixed(2)),
    },
    data: {
      events: eventsResult.data ?? [],
      fines: finesResult.data ?? [],
      cleaning_weeks: weeksResult.data ?? [],
      cleaning_assignments: cleaningAssignments,
      cleaning_exceptions: exceptionsResult.data ?? [],
      evaluation_cycles: cyclesResult.data ?? [],
      occupants: occupantsResult.data ?? [],
      outstanding_money: {
        total: Number(outstandingMoney.total.toFixed(2)),
        by_ledger: {
          adviser_maintenance: Number(outstandingMoney.byLedger.adviser_maintenance.toFixed(2)),
          sa_fines: Number(outstandingMoney.byLedger.sa_fines.toFixed(2)),
          treasurer_events: Number(outstandingMoney.byLedger.treasurer_events.toFixed(2)),
        },
      },
    },
  };

  const archiveLabel = parsed.data.archive_label?.trim() || activeSemester.label;

  const { error: archiveInsertError } = await supabase
    .from("dorm_semester_archives")
    .insert({
      dorm_id: dormId,
      semester_id: activeSemester.id,
      label: archiveLabel,
      archived_by: userId,
      snapshot,
    });

  if (archiveInsertError) {
    return { error: archiveInsertError.message };
  }

  const archivedAt = new Date().toISOString();

  const { error: archiveUpdateError } = await supabase
    .from("dorm_semesters")
    .update({
      status: "archived",
      archived_at: archivedAt,
      archived_by: userId,
      updated_at: archivedAt,
      metadata: {
        archived_via: "rollover",
      },
    })
    .eq("dorm_id", dormId)
    .eq("id", activeSemester.id)
    .eq("status", "active");

  if (archiveUpdateError) {
    return { error: archiveUpdateError.message };
  }

  await supabase
    .from("evaluation_cycles")
    .update({ is_active: false })
    .eq("dorm_id", dormId)
    .eq("semester_id", activeSemester.id)
    .eq("is_active", true);

  let nextSemesterId: string | null = null;

  const { data: existingNextSemester } = await supabase
    .from("dorm_semesters")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("school_year", parsed.data.next_school_year)
    .eq("semester", parsed.data.next_semester)
    .maybeSingle();

  if (existingNextSemester?.id) {
    const { error: activateNextError } = await supabase
      .from("dorm_semesters")
      .update({
        label: parsed.data.next_label,
        starts_on: parsed.data.next_starts_on,
        ends_on: parsed.data.next_ends_on,
        status: "active",
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
        metadata: {
          activated_via: "rollover",
        },
      })
      .eq("dorm_id", dormId)
      .eq("id", existingNextSemester.id);

    if (activateNextError) {
      return { error: activateNextError.message };
    }

    nextSemesterId = existingNextSemester.id;
  } else {
    const { data: createdNextSemester, error: createNextError } = await supabase
      .from("dorm_semesters")
      .insert({
        dorm_id: dormId,
        school_year: parsed.data.next_school_year,
        semester: parsed.data.next_semester,
        label: parsed.data.next_label,
        starts_on: parsed.data.next_starts_on,
        ends_on: parsed.data.next_ends_on,
        status: "active",
        metadata: {
          created_via: "rollover",
          source_semester_id: activeSemester.id,
        },
      })
      .select("id")
      .single();

    if (createNextError || !createdNextSemester) {
      return { error: createNextError?.message ?? "Failed to create next semester." };
    }

    nextSemesterId = createdNextSemester.id;
  }

  const activeOccupantRows = (occupantsResult.data ?? []).filter((occupant) => occupant.status === "active");

  let removedCount = 0;

  if (parsed.data.apply_occupant_turnover) {
    if (!retainOccupantIds.length) {
      return {
        error:
          "Select at least one retained occupant before applying new-school-year turnover.",
      };
    }

    const activeIdSet = new Set(activeOccupantRows.map((occupant) => occupant.id));
    for (const retainedId of retainOccupantIds) {
      if (!activeIdSet.has(retainedId)) {
        return { error: "A retained occupant is not currently active in this dorm." };
      }
    }

    const retainSet = new Set(retainOccupantIds);
    const removableIds = activeOccupantRows
      .map((occupant) => occupant.id)
      .filter((occupantId) => !retainSet.has(occupantId));

    if (removableIds.length) {
      const turnoverDate = parsed.data.next_starts_on;

      const { error: removeError } = await supabase
        .from("occupants")
        .update({
          status: "removed",
          left_at: turnoverDate,
          updated_at: new Date().toISOString(),
        })
        .eq("dorm_id", dormId)
        .eq("status", "active")
        .in("id", removableIds);

      if (removeError) {
        return { error: removeError.message };
      }

      const { error: assignmentCloseError } = await supabase
        .from("room_assignments")
        .update({ end_date: turnoverDate, updated_at: new Date().toISOString() })
        .eq("dorm_id", dormId)
        .is("end_date", null)
        .in("occupant_id", removableIds);

      if (assignmentCloseError) {
        return { error: assignmentCloseError.message };
      }

      removedCount = removableIds.length;
    }
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.archived_and_rolled_over",
      entityType: "semester",
      entityId: activeSemester.id,
      metadata: {
        archived_label: archiveLabel,
        next_semester_id: nextSemesterId,
        next_school_year: parsed.data.next_school_year,
        next_semester: parsed.data.next_semester,
        next_label: parsed.data.next_label,
        apply_occupant_turnover: parsed.data.apply_occupant_turnover,
        retained_count: retainOccupantIds.length,
        removed_count: removedCount,
        snapshot_counts: snapshot.summary,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for semester rollover:", auditError);
  }

  revalidatePath("/admin/terms");
  revalidatePath("/events");
  revalidatePath("/fines");
  revalidatePath("/cleaning");
  revalidatePath("/admin/fines");
  revalidatePath("/admin/finance/events");
  revalidatePath("/admin/evaluation");
  revalidatePath("/occupants");
  revalidatePath("/admin/occupants");

  return {
    success: true,
    archivedSemesterId: activeSemester.id,
    nextSemesterId,
    removedOccupants: removedCount,
  };
}
