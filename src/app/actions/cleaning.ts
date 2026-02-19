"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CleaningArea,
  CleaningAssignment,
  CleaningException,
  CleaningRoom,
  CleaningRoomPlan,
  CleaningSnapshot,
  CleaningWeek,
  CleaningWeekday,
} from "@/lib/types/cleaning";
import type { DormRole } from "@/lib/types/events";

const MANAGER_ROLES = new Set<DormRole>(["admin", "student_assistant", "adviser"]);
const MOLAVE_DEFAULT_AREAS = [
  "Hallways",
  "Sala/Facade",
  "CR",
  "Kitchen",
  "Front Lawn",
  "Left Lawn",
  "Right Lawn",
  "Back Lawn",
  "Garden",
  "General Cleaning",
];

const weekInputSchema = z.object({
  week_start: z.string().trim().min(1, "Week start is required."),
  rest_level: z.number().int().min(1).max(3).nullable().optional(),
});

const areaCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sort_order: z.number().int().min(0).default(0),
});

const areaUpdateSchema = z.object({
  area_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  sort_order: z.number().int().min(0),
  active: z.boolean(),
});

const areaDeleteSchema = z.object({
  area_id: z.string().uuid(),
});

const assignmentSchema = z.object({
  week_start: z.string().trim().min(1),
  room_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  rest_level: z.number().int().min(1).max(3).nullable().optional(),
});

const exceptionCreateSchema = z.object({
  date: z.string().trim().min(1),
  reason: z.string().trim().max(240).nullable(),
});

const exceptionDeleteSchema = z.object({
  exception_id: z.string().uuid(),
});

type MembershipRow = {
  dorm_id: string;
  role: DormRole;
};

type CleaningAreaRow = {
  id: string;
  dorm_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CleaningWeekRow = {
  id: string;
  dorm_id: string;
  semester_id: string | null;
  week_start: string;
  rest_level: number | null;
  created_at: string;
  updated_at: string;
};

type CleaningRoomRow = {
  id: string;
  code: string;
  level: number;
  capacity: number;
  sort_order: number;
};

type CleaningExceptionRow = {
  id: string;
  dorm_id: string;
  semester_id: string | null;
  date: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

type CleaningAssignmentRow = {
  id: string;
  dorm_id: string;
  cleaning_week_id: string;
  room_id: string;
  area_id: string;
  created_at: string;
  room:
  | {
    code: string;
    level: number;
  }
  | {
    code: string;
    level: number;
  }[]
  | null;
  area:
  | {
    name: string;
  }
  | {
    name: string;
  }[]
  | null;
};

type ViewerContext = {
  userId: string;
  dormId: string;
  role: DormRole;
  canManage: boolean;
};

function normalizeJoin<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeekMonday(date: Date) {
  const result = new Date(date);
  const day = result.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

function normalizeWeekStart(input?: string | null) {
  const base = input && input.trim().length > 0 ? parseDateOnly(input.trim()) : new Date();
  if (!base) {
    return null;
  }
  return toIsoDate(startOfWeekMonday(base));
}

function addDays(dateInput: string, days: number) {
  const date = parseDateOnly(dateInput);
  if (!date) {
    return dateInput;
  }
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

function getNextRestLevel(previous: number | null) {
  if (!previous || previous < 1 || previous > 3) {
    return 1;
  }
  return previous === 3 ? 1 : previous + 1;
}

function mapAreaRow(row: CleaningAreaRow): CleaningArea {
  return {
    id: row.id,
    dorm_id: row.dorm_id,
    name: row.name,
    active: row.active,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapWeekRow(row: CleaningWeekRow): CleaningWeek {
  return {
    id: row.id,
    dorm_id: row.dorm_id,
    week_start: row.week_start,
    rest_level: row.rest_level,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapExceptionRow(row: CleaningExceptionRow): CleaningException {
  return {
    id: row.id,
    dorm_id: row.dorm_id,
    date: row.date,
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapAssignmentRow(row: CleaningAssignmentRow): CleaningAssignment {
  const room = normalizeJoin(row.room);
  const area = normalizeJoin(row.area);

  return {
    id: row.id,
    dorm_id: row.dorm_id,
    cleaning_week_id: row.cleaning_week_id,
    room_id: row.room_id,
    area_id: row.area_id,
    created_at: row.created_at,
    room_code: room?.code ?? "Unknown",
    room_level: room?.level ?? 0,
    area_name: area?.name ?? "Unknown",
  };
}

function buildWeekdays(weekStart: string, exceptions: CleaningException[]): CleaningWeekday[] {
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const exceptionByDate = new Map<string, CleaningException>();

  for (const exception of exceptions) {
    exceptionByDate.set(exception.date, exception);
  }

  return labels.map((dayLabel, index) => {
    const date = addDays(weekStart, index);
    const exception = exceptionByDate.get(date);

    return {
      date,
      day_label: dayLabel,
      has_exception: Boolean(exception),
      exception_reason: exception?.reason ?? null,
    };
  });
}

async function getViewerContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" } as const;
  }

  const activeDormId = await getActiveDormId();

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("dorm_id, role")
    .eq("user_id", user.id);

  if (membershipError) {
    return { error: membershipError.message } as const;
  }

  const typedMemberships = (memberships ?? []) as MembershipRow[];
  const activeMembership =
    typedMemberships.find((membership) => membership.dorm_id === activeDormId) ??
    typedMemberships[0];

  if (!activeMembership) {
    return { error: "No dorm membership found for this account." } as const;
  }

  const cookieStore = await cookies();
  const isOccupantMode = cookieStore.get("dormy_occupant_mode")?.value === "1";
  const role = isOccupantMode ? "occupant" : activeMembership.role;

  const viewer: ViewerContext = {
    userId: user.id,
    dormId: activeMembership.dorm_id,
    role,
    canManage: !isOccupantMode && MANAGER_ROLES.has(role),
  };

  return { supabase, viewer } as const;
}

async function getWeekByStart(dormId: string, weekStart: string, semesterId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const { data: week, error } = await supabase
    .from("cleaning_weeks")
    .select("id, dorm_id, semester_id, week_start, rest_level, created_at, updated_at")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    return { error: error.message } as const;
  }

  return { week: (week as CleaningWeekRow | null) ?? null } as const;
}

async function ensureWeekRecord(
  dormId: string,
  weekStart: string,
  requestedRestLevel: number | null | undefined,
  semesterId: string
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const { data: existingWeek, error: existingError } = await supabase
    .from("cleaning_weeks")
    .select("id, dorm_id, semester_id, week_start, rest_level, created_at, updated_at")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message } as const;
  }

  if (existingWeek) {
    if (
      typeof requestedRestLevel === "number" &&
      requestedRestLevel >= 1 &&
      requestedRestLevel <= 3 &&
      existingWeek.rest_level !== requestedRestLevel
    ) {
      const { data: updatedWeek, error: updateError } = await supabase
        .from("cleaning_weeks")
        .update({ rest_level: requestedRestLevel })
        .eq("id", existingWeek.id)
        .eq("dorm_id", dormId)
        .select("id, dorm_id, week_start, rest_level, created_at, updated_at")
        .single();

      if (updateError) {
        return { error: updateError.message } as const;
      }

      return {
        week: updatedWeek as CleaningWeekRow,
        created: false,
        updatedRestLevel: true,
      } as const;
    }

    return {
      week: existingWeek as CleaningWeekRow,
      created: false,
      updatedRestLevel: false,
    } as const;
  }

  let restLevelToUse: number;
  if (typeof requestedRestLevel === "number" && requestedRestLevel >= 1 && requestedRestLevel <= 3) {
    restLevelToUse = requestedRestLevel;
  } else {
    const { data: previousWeek, error: previousWeekError } = await supabase
      .from("cleaning_weeks")
      .select("rest_level")
      .eq("dorm_id", dormId)
      .eq("semester_id", semesterId)
      .lt("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousWeekError) {
      return { error: previousWeekError.message } as const;
    }

    restLevelToUse = getNextRestLevel((previousWeek?.rest_level as number | null) ?? null);
  }

  const { data: createdWeek, error: createError } = await supabase
    .from("cleaning_weeks")
    .insert({
      dorm_id: dormId,
      semester_id: semesterId,
      week_start: weekStart,
      rest_level: restLevelToUse,
    })
    .select("id, dorm_id, semester_id, week_start, rest_level, created_at, updated_at")
    .single();

  if (createError) {
    return { error: createError.message } as const;
  }

  return {
    week: createdWeek as CleaningWeekRow,
    created: true,
    updatedRestLevel: false,
  } as const;
}

function buildRoomPlans(
  rooms: CleaningRoom[],
  assignments: CleaningAssignment[],
  restLevel: number | null
): CleaningRoomPlan[] {
  const assignmentByRoom = new Map<string, CleaningAssignment>();
  for (const assignment of assignments) {
    assignmentByRoom.set(assignment.room_id, assignment);
  }

  return rooms.map((room) => {
    const assignment = assignmentByRoom.get(room.id);
    return {
      room_id: room.id,
      room_code: room.code,
      room_level: room.level,
      occupant_count: room.occupant_count,
      area_id: assignment?.area_id ?? null,
      area_name: assignment?.area_name ?? null,
      is_rest_week: Boolean(restLevel && room.level === restLevel),
    };
  });
}

export async function getCleaningSnapshot(
  weekStartInput?: string
): Promise<CleaningSnapshot | { error: string }> {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  const selectedWeekStart = normalizeWeekStart(weekStartInput);

  if (!selectedWeekStart) {
    return { error: "Invalid week start value." };
  }

  const semesterResult = await ensureActiveSemesterId(viewer.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const weekResult = await getWeekByStart(
    viewer.dormId,
    selectedWeekStart,
    semesterResult.semesterId
  );
  if ("error" in weekResult) {
    return { error: weekResult.error ?? "Failed to load week data." };
  }

  let weekRow = weekResult.week;
  if (!weekRow && viewer.canManage) {
    const ensured = await ensureWeekRecord(
      viewer.dormId,
      selectedWeekStart,
      undefined,
      semesterResult.semesterId
    );
    if ("error" in ensured) {
      return { error: ensured.error ?? "Failed to create cleaning week." };
    }
    weekRow = ensured.week;
  }

  const [areasResult, roomsResult, activeRoomAssignmentsResult] = await Promise.all([
    supabase
      .from("cleaning_areas")
      .select("id, dorm_id, name, active, sort_order, created_at, updated_at")
      .eq("dorm_id", viewer.dormId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("rooms")
      .select("id, code, level, capacity, sort_order")
      .eq("dorm_id", viewer.dormId)
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("room_assignments")
      .select("room_id")
      .eq("dorm_id", viewer.dormId)
      .is("end_date", null),
  ]);

  if (areasResult.error) {
    return { error: areasResult.error.message };
  }

  if (roomsResult.error) {
    return { error: roomsResult.error.message };
  }

  if (activeRoomAssignmentsResult.error) {
    return { error: activeRoomAssignmentsResult.error.message };
  }

  const areaRows = (areasResult.data ?? []) as CleaningAreaRow[];
  const areas = areaRows.map(mapAreaRow);

  const roomRows = (roomsResult.data ?? []) as CleaningRoomRow[];

  const roomOccupantCount = new Map<string, number>();
  for (const assignment of activeRoomAssignmentsResult.data ?? []) {
    const roomId = (assignment as { room_id: string }).room_id;
    roomOccupantCount.set(roomId, (roomOccupantCount.get(roomId) ?? 0) + 1);
  }

  const rooms: CleaningRoom[] = roomRows.map((room) => ({
    id: room.id,
    code: room.code,
    level: room.level,
    capacity: room.capacity,
    sort_order: room.sort_order,
    occupant_count: roomOccupantCount.get(room.id) ?? 0,
  }));

  let assignments: CleaningAssignment[] = [];
  if (weekRow) {
    const assignmentsResult = await supabase
      .from("cleaning_assignments")
      .select(
        "id, dorm_id, cleaning_week_id, room_id, area_id, created_at, room:rooms(code, level), area:cleaning_areas(name)"
      )
      .eq("dorm_id", viewer.dormId)
      .eq("cleaning_week_id", weekRow.id)
      .order("created_at", { ascending: true });

    if (assignmentsResult.error) {
      return { error: assignmentsResult.error.message };
    }

    assignments = ((assignmentsResult.data ?? []) as CleaningAssignmentRow[]).map(mapAssignmentRow);
  }

  const weekStartForExceptionQuery = weekRow?.week_start ?? selectedWeekStart;
  const weekEnd = addDays(weekStartForExceptionQuery, 4);

  const exceptionsResult = await supabase
    .from("cleaning_exceptions")
    .select("id, dorm_id, semester_id, date, reason, created_at, updated_at")
    .eq("dorm_id", viewer.dormId)
    .eq("semester_id", semesterResult.semesterId)
    .gte("date", weekStartForExceptionQuery)
    .lte("date", weekEnd)
    .order("date", { ascending: true });

  if (exceptionsResult.error) {
    return { error: exceptionsResult.error.message };
  }

  const exceptions = ((exceptionsResult.data ?? []) as CleaningExceptionRow[]).map(mapExceptionRow);

  const restLevel = weekRow?.rest_level ?? null;
  const roomPlans = buildRoomPlans(rooms, assignments, restLevel);
  const weekdays = buildWeekdays(weekStartForExceptionQuery, exceptions);

  return {
    viewer: {
      dorm_id: viewer.dormId,
      role: viewer.role,
      can_manage: viewer.canManage,
    },
    selected_week_start: selectedWeekStart,
    week: weekRow ? mapWeekRow(weekRow) : null,
    areas,
    rooms,
    assignments,
    exceptions,
    weekdays,
    room_plans: roomPlans,
  };
}

export async function seedDefaultCleaningAreas() {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning areas." };
  }

  const { data: areaRows, error: areaError } = await supabase
    .from("cleaning_areas")
    .select("id, name, sort_order")
    .eq("dorm_id", viewer.dormId)
    .order("sort_order", { ascending: true });

  if (areaError) {
    return { error: areaError.message };
  }

  const existingNames = new Set(
    (areaRows ?? []).map((row) => String((row as { name: string }).name).trim().toLowerCase())
  );

  const existingMaxOrder =
    (areaRows ?? []).reduce((maxOrder, row) => {
      const sortOrder = Number((row as { sort_order: number }).sort_order ?? 0);
      return Number.isFinite(sortOrder) ? Math.max(maxOrder, sortOrder) : maxOrder;
    }, 0) ?? 0;

  const inserts = MOLAVE_DEFAULT_AREAS.filter(
    (name) => !existingNames.has(name.toLowerCase())
  ).map((name, index) => ({
    dorm_id: viewer.dormId,
    name,
    active: true,
    sort_order: existingMaxOrder + index + 1,
  }));

  if (!inserts.length) {
    return { success: true, inserted: 0 };
  }

  const { error: insertError } = await supabase.from("cleaning_areas").insert(inserts);
  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.areas_seeded",
      entityType: "cleaning_area",
      metadata: {
        inserted_count: inserts.length,
        names: inserts.map((item) => item.name),
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning area seeding:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true, inserted: inserts.length };
}

export async function createCleaningArea(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning areas." };
  }

  const parsed = areaCreateSchema.safeParse({
    name: formData.get("name"),
    sort_order: Number(formData.get("sort_order") ?? 0),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid area input." };
  }

  const { data: area, error } = await supabase
    .from("cleaning_areas")
    .insert({
      dorm_id: viewer.dormId,
      name: parsed.data.name,
      active: true,
      sort_order: parsed.data.sort_order,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.area_created",
      entityType: "cleaning_area",
      entityId: (area as { id: string }).id,
      metadata: parsed.data,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning area creation:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}

export async function updateCleaningArea(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning areas." };
  }

  const parsed = areaUpdateSchema.safeParse({
    area_id: formData.get("area_id"),
    name: formData.get("name"),
    sort_order: Number(formData.get("sort_order") ?? 0),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid area input." };
  }

  const { error } = await supabase
    .from("cleaning_areas")
    .update({
      name: parsed.data.name,
      sort_order: parsed.data.sort_order,
      active: parsed.data.active,
    })
    .eq("dorm_id", viewer.dormId)
    .eq("id", parsed.data.area_id);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.area_updated",
      entityType: "cleaning_area",
      entityId: parsed.data.area_id,
      metadata: {
        name: parsed.data.name,
        sort_order: parsed.data.sort_order,
        active: parsed.data.active,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning area update:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}

export async function deleteCleaningArea(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning areas." };
  }

  const parsed = areaDeleteSchema.safeParse({
    area_id: formData.get("area_id"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid area input." };
  }

  const { error: deleteAssignmentsError } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("dorm_id", viewer.dormId)
    .eq("area_id", parsed.data.area_id);

  if (deleteAssignmentsError) {
    return { error: deleteAssignmentsError.message };
  }

  const { error } = await supabase
    .from("cleaning_areas")
    .delete()
    .eq("dorm_id", viewer.dormId)
    .eq("id", parsed.data.area_id);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.area_deleted",
      entityType: "cleaning_area",
      entityId: parsed.data.area_id,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning area deletion:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}

export async function upsertCleaningWeek(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning schedules." };
  }

  const parsed = weekInputSchema.safeParse({
    week_start: formData.get("week_start"),
    rest_level: formData.get("rest_level")
      ? Number(formData.get("rest_level"))
      : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid week input." };
  }

  const weekStart = normalizeWeekStart(parsed.data.week_start);
  if (!weekStart) {
    return { error: "Invalid week start value." };
  }

  const semesterResult = await ensureActiveSemesterId(viewer.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const ensured = await ensureWeekRecord(
    viewer.dormId,
    weekStart,
    parsed.data.rest_level ?? null,
    semesterResult.semesterId
  );

  if ("error" in ensured) {
    return { error: ensured.error ?? "Failed to create or update week." };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: ensured.created ? "cleaning.week_created" : "cleaning.week_updated",
      entityType: "cleaning_week",
      entityId: ensured.week.id,
      metadata: {
        week_start: ensured.week.week_start,
        rest_level: ensured.week.rest_level,
        updated_rest_level: ensured.updatedRestLevel,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning week upsert:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true, week_id: ensured.week.id, week_start: ensured.week.week_start };
}

export async function setCleaningRoomAssignment(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning assignments." };
  }

  const parsed = assignmentSchema.safeParse({
    week_start: formData.get("week_start"),
    room_id: formData.get("room_id"),
    area_id: formData.get("area_id")
      ? String(formData.get("area_id"))
      : null,
    rest_level: formData.get("rest_level")
      ? Number(formData.get("rest_level"))
      : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment input." };
  }

  const weekStart = normalizeWeekStart(parsed.data.week_start);
  if (!weekStart) {
    return { error: "Invalid week start value." };
  }

  const semesterResult = await ensureActiveSemesterId(viewer.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const ensuredWeek = await ensureWeekRecord(
    viewer.dormId,
    weekStart,
    parsed.data.rest_level ?? null,
    semesterResult.semesterId
  );

  if ("error" in ensuredWeek) {
    return { error: ensuredWeek.error ?? "Failed to resolve target week." };
  }

  const { data: roomRow, error: roomError } = await supabase
    .from("rooms")
    .select("id, level")
    .eq("dorm_id", viewer.dormId)
    .eq("id", parsed.data.room_id)
    .maybeSingle();

  if (roomError) {
    return { error: roomError.message };
  }

  if (!roomRow) {
    return { error: "Room not found for this dorm." };
  }

  if (
    ensuredWeek.week.rest_level &&
    (roomRow as { level: number }).level === ensuredWeek.week.rest_level
  ) {
    return {
      error: `Level ${ensuredWeek.week.rest_level} is the rest-week level and cannot receive assignments.`,
    };
  }

  if (parsed.data.area_id) {
    const { data: areaRow, error: areaError } = await supabase
      .from("cleaning_areas")
      .select("id")
      .eq("dorm_id", viewer.dormId)
      .eq("id", parsed.data.area_id)
      .eq("active", true)
      .maybeSingle();

    if (areaError) {
      return { error: areaError.message };
    }

    if (!areaRow) {
      return { error: "Selected area was not found or is inactive." };
    }
  }

  const { error: deleteExistingError } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("dorm_id", viewer.dormId)
    .eq("cleaning_week_id", ensuredWeek.week.id)
    .eq("room_id", parsed.data.room_id);

  if (deleteExistingError) {
    return { error: deleteExistingError.message };
  }

  if (parsed.data.area_id) {
    const { error: insertError } = await supabase.from("cleaning_assignments").insert({
      dorm_id: viewer.dormId,
      cleaning_week_id: ensuredWeek.week.id,
      room_id: parsed.data.room_id,
      area_id: parsed.data.area_id,
    });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: parsed.data.area_id
        ? "cleaning.assignment_set"
        : "cleaning.assignment_cleared",
      entityType: "cleaning_assignment",
      metadata: {
        week_id: ensuredWeek.week.id,
        week_start: ensuredWeek.week.week_start,
        room_id: parsed.data.room_id,
        area_id: parsed.data.area_id,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning assignment mutation:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}

export async function generateCleaningAssignments(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to generate cleaning assignments." };
  }

  const parsed = weekInputSchema.safeParse({
    week_start: formData.get("week_start"),
    rest_level: formData.get("rest_level")
      ? Number(formData.get("rest_level"))
      : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid week input." };
  }

  const weekStart = normalizeWeekStart(parsed.data.week_start);
  if (!weekStart) {
    return { error: "Invalid week start value." };
  }

  const semesterResult = await ensureActiveSemesterId(viewer.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const ensuredWeek = await ensureWeekRecord(
    viewer.dormId,
    weekStart,
    parsed.data.rest_level ?? null,
    semesterResult.semesterId
  );

  if ("error" in ensuredWeek) {
    return { error: ensuredWeek.error ?? "Failed to resolve target week." };
  }

  const [areasResult, roomsResult] = await Promise.all([
    supabase
      .from("cleaning_areas")
      .select("id, name, active, sort_order")
      .eq("dorm_id", viewer.dormId)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("rooms")
      .select("id, level, sort_order")
      .eq("dorm_id", viewer.dormId)
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (areasResult.error) {
    return { error: areasResult.error.message };
  }

  if (roomsResult.error) {
    return { error: roomsResult.error.message };
  }

  const areas = (areasResult.data ?? []) as Array<{
    id: string;
    name: string;
    active: boolean;
    sort_order: number;
  }>;

  if (!areas.length) {
    return { error: "No active cleaning areas found. Add or activate an area first." };
  }

  const activeRooms = ((roomsResult.data ?? []) as Array<{
    id: string;
    level: number;
    sort_order: number;
  }>).filter((room) => room.level !== ensuredWeek.week.rest_level);

  if (!activeRooms.length) {
    return {
      error:
        "No eligible rooms were found for this week. Check rest-level settings and room data.",
    };
  }

  // Smart rotation: fetch past assignment history to determine least-recently-assigned areas
  const { data: pastAssignments } = await supabase
    .from("cleaning_assignments")
    .select("room_id, area_id, created_at")
    .eq("dorm_id", viewer.dormId)
    .order("created_at", { ascending: false });

  // Build a map: room_id → area_id → last assigned timestamp
  const roomAreaHistory = new Map<string, Map<string, string>>();
  for (const pa of (pastAssignments ?? []) as Array<{ room_id: string; area_id: string; created_at: string }>) {
    if (!roomAreaHistory.has(pa.room_id)) {
      roomAreaHistory.set(pa.room_id, new Map());
    }
    const areaMap = roomAreaHistory.get(pa.room_id)!;
    // Only keep the most recent assignment per area (first seen = most recent due to DESC order)
    if (!areaMap.has(pa.area_id)) {
      areaMap.set(pa.area_id, pa.created_at);
    }
  }

  const gardenArea =
    areas.find((area) => area.name.toLowerCase().includes("garden")) ?? null;

  const nonGardenAreas = gardenArea
    ? areas.filter((area) => area.id !== gardenArea.id)
    : areas;

  const fallbackAreas = nonGardenAreas.length ? nonGardenAreas : areas;

  // For garden area: find the room that had it least recently
  let gardenRoomId: string | null = null;
  if (gardenArea) {
    let leastRecentGardenTime = Infinity;
    let leastRecentGardenRoom = activeRooms[0]?.id ?? null;

    for (const room of activeRooms) {
      const areaMap = roomAreaHistory.get(room.id);
      const lastGardenTime = areaMap?.get(gardenArea.id);
      const timestamp = lastGardenTime ? new Date(lastGardenTime).getTime() : 0;
      if (timestamp < leastRecentGardenTime) {
        leastRecentGardenTime = timestamp;
        leastRecentGardenRoom = room.id;
      }
    }
    gardenRoomId = leastRecentGardenRoom;
  }

  // For each room, sort available areas by least-recently-assigned
  const usedAreaIds = new Set<string>();
  const assignments = activeRooms.map((room) => {
    if (gardenArea && room.id === gardenRoomId) {
      usedAreaIds.add(gardenArea.id);
      return {
        dorm_id: viewer.dormId,
        cleaning_week_id: ensuredWeek.week.id,
        room_id: room.id,
        area_id: gardenArea.id,
      };
    }

    const areaMap = roomAreaHistory.get(room.id);

    // Score each area: lower timestamp = haven't done it recently = preferred
    const scoredAreas = fallbackAreas
      .filter((a) => !usedAreaIds.has(a.id)) // prefer unused areas this week
      .map((area) => {
        const lastTime = areaMap?.get(area.id);
        return {
          area,
          score: lastTime ? new Date(lastTime).getTime() : 0, // 0 = never assigned = most preferred
        };
      })
      .sort((a, b) => a.score - b.score);

    // Pick the least-recently-assigned area, or fallback to any available
    const selectedArea =
      scoredAreas[0]?.area ?? fallbackAreas[0];

    usedAreaIds.add(selectedArea.id);

    return {
      dorm_id: viewer.dormId,
      cleaning_week_id: ensuredWeek.week.id,
      room_id: room.id,
      area_id: selectedArea.id,
    };
  });

  const { error: clearError } = await supabase
    .from("cleaning_assignments")
    .delete()
    .eq("dorm_id", viewer.dormId)
    .eq("cleaning_week_id", ensuredWeek.week.id);

  if (clearError) {
    return { error: clearError.message };
  }

  const { error: insertError } = await supabase
    .from("cleaning_assignments")
    .insert(assignments);

  if (insertError) {
    return { error: insertError.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.assignments_generated",
      entityType: "cleaning_week",
      entityId: ensuredWeek.week.id,
      metadata: {
        week_start: ensuredWeek.week.week_start,
        rest_level: ensuredWeek.week.rest_level,
        generated_count: assignments.length,
        garden_room_id: gardenRoomId,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning assignment generation:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true, generated: assignments.length };
}

export async function createCleaningException(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning exceptions." };
  }

  const parsed = exceptionCreateSchema.safeParse({
    date: formData.get("date"),
    reason: String(formData.get("reason") ?? "").trim() || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid exception input." };
  }

  const date = parseDateOnly(parsed.data.date);
  if (!date) {
    return { error: "Invalid exception date." };
  }

  const isoDate = toIsoDate(date);

  const semesterResult = await ensureActiveSemesterId(viewer.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: exceptionRow, error } = await supabase
    .from("cleaning_exceptions")
    .upsert(
      {
        dorm_id: viewer.dormId,
        semester_id: semesterResult.semesterId,
        date: isoDate,
        reason: parsed.data.reason,
      },
      {
        onConflict: "dorm_id,semester_id,date",
      }
    )
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.exception_upserted",
      entityType: "cleaning_exception",
      entityId: (exceptionRow as { id: string }).id,
      metadata: {
        date: isoDate,
        reason: parsed.data.reason,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning exception upsert:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}

export async function deleteCleaningException(formData: FormData) {
  const contextResult = await getViewerContext();
  if ("error" in contextResult) {
    return { error: contextResult.error ?? "Failed to resolve viewer context." };
  }

  const { viewer, supabase } = contextResult;
  if (!viewer.canManage) {
    return { error: "You do not have permission to manage cleaning exceptions." };
  }

  const parsed = exceptionDeleteSchema.safeParse({
    exception_id: formData.get("exception_id"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid exception input." };
  }

  const { error } = await supabase
    .from("cleaning_exceptions")
    .delete()
    .eq("dorm_id", viewer.dormId)
    .eq("id", parsed.data.exception_id);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      supabase,
      dormId: viewer.dormId,
      actorUserId: viewer.userId,
      action: "cleaning.exception_deleted",
      entityType: "cleaning_exception",
      entityId: parsed.data.exception_id,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for cleaning exception deletion:", auditError);
  }

  revalidatePath("/cleaning");
  return { success: true };
}
