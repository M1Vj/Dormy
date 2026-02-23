"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
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
      maintenance_fee: number;
      sa_fines: number;
      contributions: number;
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
      maintenance_fee: 0,
      sa_fines: 0,
      contributions: 0,
    },
  };

  for (const entry of entries) {
    const amount = Number(entry.amount_pesos ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }

    summary.total += amount;

    if (entry.ledger === "maintenance_fee") {
      summary.byLedger.maintenance_fee += amount;
    }

    if (entry.ledger === "sa_fines") {
      summary.byLedger.sa_fines += amount;
    }

    if (entry.ledger === "contributions") {
      summary.byLedger.contributions += amount;
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

export async function createSemester(dormId: string, formData: FormData) {
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

  // Overlap validation
  const { data: overlapping } = await supabase
    .from("dorm_semesters")
    .select("id")
    .eq("dorm_id", dormId)
    .or(`and(starts_on.lte.${parsed.data.ends_on},ends_on.gte.${parsed.data.starts_on})`)
    .limit(1)
    .maybeSingle();

  if (overlapping) {
    return { error: "The selected dates overlap with an existing semester." };
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
      status: "active", // Default status, though mostly ignored for date checks
    })
    .select("id")
    .single();

  if (error || !semester) {
    return { error: error?.message ?? "Failed to create semester." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.created",
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
    console.error("Failed to write audit event for semester creation:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/terms`);
  return { success: true };
}

export async function updateSemester(dormId: string, formData: FormData) {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return { error: manager.error ?? "Failed to resolve permissions." };
  }

  const semesterId = formData.get("id") as string;
  if (!semesterId) {
    return { error: "Semester ID is required." };
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

  // Overlap validation excluding itself
  const { data: overlapping } = await supabase
    .from("dorm_semesters")
    .select("id")
    .eq("dorm_id", dormId)
    .neq("id", semesterId)
    .or(`and(starts_on.lte.${parsed.data.ends_on},ends_on.gte.${parsed.data.starts_on})`)
    .limit(1)
    .maybeSingle();

  if (overlapping) {
    return { error: "The selected dates overlap with another existing semester." };
  }

  const { error } = await supabase
    .from("dorm_semesters")
    .update({
      school_year: parsed.data.school_year,
      semester: parsed.data.semester,
      label: parsed.data.label,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      updated_at: new Date().toISOString(),
    })
    .eq("dorm_id", dormId)
    .eq("id", semesterId);

  if (error) {
    return { error: error.message ?? "Failed to update semester." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.updated",
      entityType: "semester",
      entityId: semesterId,
      metadata: {
        school_year: parsed.data.school_year,
        semester: parsed.data.semester,
        label: parsed.data.label,
        starts_on: parsed.data.starts_on,
        ends_on: parsed.data.ends_on,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for semester update:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/terms`);
  return { success: true };
}

export async function deleteSemester(dormId: string, formData: FormData) {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return { error: manager.error ?? "Failed to resolve permissions." };
  }

  const semesterId = formData.get("id") as string;
  if (!semesterId) {
    return { error: "Semester ID is required." };
  }

  const { supabase, userId } = manager;

  // Attempt to delete. This will fail if there are foreign key constraints currently restricting it.
  const { error } = await supabase
    .from("dorm_semesters")
    .delete()
    .eq("dorm_id", dormId)
    .eq("id", semesterId);

  if (error) {
    if (error.code === "23503") {
      return { error: "Cannot delete this semester because it contains existing records (e.g., events, fines)." };
    }
    return { error: error.message ?? "Failed to delete semester." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: userId,
      action: "semester.deleted",
      entityType: "semester",
      entityId: semesterId,
      metadata: {},
    });
  } catch (auditError) {
    console.error("Failed to write audit event for semester deletion:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/terms`);
  return { success: true };
}
