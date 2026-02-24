"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { ensureActiveSemesterId, getActiveSemester, listDormSemesterArchives, listDormSemesters } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Null-safe dorm_id filter: `.eq()` doesn't match SQL NULL, use `.is()` instead. */
function filterDormId<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(query: T, dormId: string | null): T {
  return dormId ? query.eq("dorm_id", dormId) : query.is("dorm_id", null);
}



const semesterPlanSchema = z.object({
  school_year: z.string().trim().min(4).max(20),
  semester: z.string().trim().min(1).max(30),
  label: z.string().trim().min(4).max(120),
  starts_on: z.string().trim().regex(dateRegex),
  ends_on: z.string().trim().regex(dateRegex),
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

async function requireSemesterManager(dormId: string | null): Promise<ManagerContext | { error: string }> {
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

  let role: string | null = null;

  if (dormId) {
    const { data: membership } = await supabase
      .from("dorm_memberships")
      .select("role")
      .eq("dorm_id", dormId)
      .eq("user_id", user.id)
      .maybeSingle();
    role = membership?.role ?? null;

    // Fallback: admin in ANY dorm can manage semesters for any dorm
    if (!role || !new Set(["admin", "adviser"]).has(role)) {
      const { data: adminMembership } = await supabase
        .from("dorm_memberships")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .limit(1);
      if (adminMembership?.[0]?.role === "admin") {
        role = "admin";
      }
    }
  } else {
    // Global management: check if admin in any dorm
    const { data: adminMembership } = await supabase
      .from("dorm_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);
    role = adminMembership?.[0]?.role ?? null;
  }

  if (!role) {
    return { error: "Dorm membership or permission not found." };
  }

  if (!new Set(["admin", "adviser"]).has(role)) {
    return { error: "You do not have permission to manage semesters." };
  }

  return {
    supabase,
    userId: user.id,
    role,
  };
}

export async function getSemesterWorkspace(dormId: string | null): Promise<SemesterWorkspace | { error: string }> {
  const manager = await requireSemesterManager(dormId);
  if ("error" in manager) {
    return manager;
  }

  const { supabase } = manager;

  const ensureResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in ensureResult) {
    return { error: ensureResult.error ?? "Failed to resolve active semester." };
  }

  const baseFetches: [Promise<any>, Promise<any>, Promise<any>] = [
    getActiveSemester(dormId, supabase),
    listDormSemesters(dormId, supabase),
    dormId ? listDormSemesterArchives(dormId, supabase) : Promise.resolve([]),
  ];

  const [activeSemester, semesters, archives] = await Promise.all(baseFetches);

  // Occupants and ledger entries only make sense for a specific dorm
  let activeOccupants: SemesterWorkspace["activeOccupants"] = [];
  let outstandingMoney: SemesterWorkspace["outstandingMoney"] = { total: 0, byLedger: { maintenance_fee: 0, sa_fines: 0, contributions: 0 } };

  if (dormId) {
    const [occupantsResult, entriesResult] = await Promise.all([
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

    if (!occupantsResult.error) {
      activeOccupants = occupantsResult.data?.map((occupant) => ({
        id: occupant.id,
        full_name: occupant.full_name,
        student_id: occupant.student_id,
        course: occupant.course,
      })) ?? [];
    }

    if (!entriesResult.error) {
      outstandingMoney = summarizeOutstandingLedger(
        (entriesResult.data ?? []) as Array<{ ledger: string; amount_pesos: number | string | null }>
      );
    }
  }

  return {
    activeSemester,
    semesters,
    archives,
    activeOccupants,
    outstandingMoney,
  };
}

export async function createSemester(dormId: string | null, formData: FormData) {
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
  let overlapQuery = supabase
    .from("dorm_semesters")
    .select("id")
    .or(`and(starts_on.lte.${parsed.data.ends_on},ends_on.gte.${parsed.data.starts_on})`)
    .limit(1);
  overlapQuery = filterDormId(overlapQuery, dormId);
  const { data: overlapping } = await overlapQuery.maybeSingle();

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
      status: "planned", // Status is "planned" on creation; the system activates based on date range
    })
    .select("id")
    .single();

  if (error || !semester) {
    return { error: error?.message ?? "Failed to create semester." };
  }

  try {
    await logAuditEvent({
      dormId: dormId ?? "global",
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

export async function updateSemester(dormId: string | null, formData: FormData) {
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
  let overlapQuery2 = supabase
    .from("dorm_semesters")
    .select("id")
    .neq("id", semesterId)
    .or(`and(starts_on.lte.${parsed.data.ends_on},ends_on.gte.${parsed.data.starts_on})`)
    .limit(1);
  overlapQuery2 = filterDormId(overlapQuery2, dormId);
  const { data: overlapping } = await overlapQuery2.maybeSingle();

  if (overlapping) {
    return { error: "The selected dates overlap with another existing semester." };
  }

  let updateQuery = supabase
    .from("dorm_semesters")
    .update({
      school_year: parsed.data.school_year,
      semester: parsed.data.semester,
      label: parsed.data.label,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      updated_at: new Date().toISOString(),
    })
    .eq("id", semesterId);
  updateQuery = filterDormId(updateQuery, dormId);
  const { error } = await updateQuery;

  if (error) {
    return { error: error.message ?? "Failed to update semester." };
  }

  try {
    await logAuditEvent({
      dormId: dormId ?? "global",
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

export async function deleteSemester(dormId: string | null, formData: FormData) {
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
  let deleteQuery = supabase
    .from("dorm_semesters")
    .delete()
    .eq("id", semesterId);
  deleteQuery = filterDormId(deleteQuery, dormId);
  const { error } = await deleteQuery;

  if (error) {
    if (error.code === "23503") {
      return { error: "Cannot delete this semester because it contains existing records (e.g., events, fines)." };
    }
    return { error: error.message ?? "Failed to delete semester." };
  }

  try {
    await logAuditEvent({
      dormId: dormId ?? "global",
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
