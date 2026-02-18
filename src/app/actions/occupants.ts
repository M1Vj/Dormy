"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const occupantStatusSchema = z.enum(["active", "left", "removed"]);

const occupantSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  student_id: z.string().optional(),
  course: z.string().optional(),
  joined_at: z.string().optional(), // Date string
});

type RoomRef = {
  id: string;
  code: string;
  level: number;
};

type RoomAssignment = {
  id: string;
  start_date: string;
  end_date: string | null;
  room?: RoomRef | RoomRef[] | null;
};

const OCCUPANT_AUDIT_FIELDS = [
  "full_name",
  "student_id",
  "course",
  "joined_at",
  "status",
  "home_address",
  "birthdate",
  "contact_mobile",
  "contact_email",
  "emergency_contact_name",
  "emergency_contact_mobile",
  "emergency_contact_relationship",
] as const;

function normalizeAuditValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value);
}

function getChangedOccupantFields(
  previous: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  return OCCUPANT_AUDIT_FIELDS.filter((field) => {
    if (!(field in updates)) {
      return false;
    }
    return normalizeAuditValue(previous[field]) !== normalizeAuditValue(updates[field]);
  });
}

export async function getOccupants(
  dormId: string,
  {
    search,
    status,
    room,
    level,
  }: { search?: string; status?: string; room?: string; level?: string } = {}
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  let query = supabase
    .from("occupants")
    .select(`
      id, full_name, student_id, user_id, course:classification, joined_at, status, 
      room_assignments(
        id,
        start_date,
        end_date,
        room:rooms(id, code, level)
      )
    `)
    .eq("dorm_id", dormId);

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,student_id.ilike.%${search}%`);
  }

  query = query.order("full_name");

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching occupants:", error);
    return [];
  }

  let mapped = data.map((occ) => {
    // Find the active assignment (no end_date)
    // If multiple (shouldn't happen with DB constraint), take the first one
    const assignments = occ.room_assignments as unknown as RoomAssignment[];
    const activeAssignment = assignments?.find(
      (a) => !a.end_date
    );

    return {
      ...occ,
      current_room_assignment: activeAssignment || null,
      room_assignments: undefined, // cleaner output if we don't need history in list view
    };
  });

  const normalizedRoom = room?.trim().toLowerCase();
  const normalizedLevel = level?.trim();

  const getRoomRef = (assignment?: RoomAssignment | null) => {
    if (!assignment?.room) return null;
    return Array.isArray(assignment.room) ? assignment.room[0] : assignment.room;
  };

  if (normalizedRoom) {
    mapped = mapped.filter((occ) => {
      const roomRef = getRoomRef(occ.current_room_assignment);
      const code = roomRef?.code?.toLowerCase() ?? "";
      return code.includes(normalizedRoom);
    });
  }

  if (normalizedLevel) {
    mapped = mapped.filter((occ) => {
      const roomRef = getRoomRef(occ.current_room_assignment);
      if (roomRef?.level === null || roomRef?.level === undefined) return false;
      return String(roomRef.level) === normalizedLevel;
    });
  }

  return mapped;
}

export async function getOccupant(dormId: string, occupantId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data, error } = await supabase
    .from("occupants")
    .select(`
      id, full_name, student_id, course:classification, joined_at, status,
      home_address, birthdate, contact_mobile, contact_email, 
      emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship,
      room_assignments(
        id,
        start_date,
        end_date,
        room:rooms(id, code, level)
      )
    `)
    .eq("dorm_id", dormId)
    .eq("id", occupantId)
    .single();

  if (error) {
    console.error("Error fetching occupant:", error);
    return null;
  }

  // Sort assignments: Active first, then by end_date desc (most recent history)
  const assignments = (data.room_assignments || []) as unknown as RoomAssignment[];
  const sortedAssignments = assignments.sort((a, b) => {
    if (!a.end_date && b.end_date) return -1;
    if (a.end_date && !b.end_date) return 1;
    // Both active or both ended: sort by start_date desc
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });

  return {
    ...data,
    room_assignments: sortedAssignments,
    current_room_assignment: sortedAssignments.find((a) => !a.end_date) || null,
  };
}

export async function createOccupant(dormId: string, formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to add occupants." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    !new Set(["admin", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to add occupants." };
  }

  const rawData = {
    full_name: formData.get("full_name"),
    student_id: formData.get("student_id"),
    course: formData.get("classification"),
    joined_at: formData.get("joined_at") || new Date().toISOString().split('T')[0],
    home_address: formData.get("home_address"),
    birthdate: formData.get("birthdate"),
    contact_mobile: formData.get("contact_mobile"),
    contact_email: formData.get("contact_email"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_mobile: formData.get("emergency_contact_mobile"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
  };

  const parsed = occupantSchema.safeParse(rawData);

  if (!parsed.success) {
    return { error: "Invalid data" };
  }

  const { data: createdOccupant, error } = await supabase
    .from("occupants")
    .insert({
      dorm_id: dormId,
      full_name: parsed.data.full_name,
      student_id: parsed.data.student_id ? parsed.data.student_id : null,
      classification: parsed.data.course,
      joined_at: parsed.data.joined_at,
      home_address: typeof rawData.home_address === "string" && rawData.home_address.trim() ? rawData.home_address.trim() : null,
      birthdate: typeof rawData.birthdate === "string" && rawData.birthdate.trim() ? rawData.birthdate.trim() : null,
      contact_mobile: typeof rawData.contact_mobile === "string" && rawData.contact_mobile.trim() ? rawData.contact_mobile.trim() : null,
      contact_email: typeof rawData.contact_email === "string" && rawData.contact_email.trim()
        ? rawData.contact_email.trim().toLowerCase()
        : null,
      emergency_contact_name: typeof rawData.emergency_contact_name === "string" && rawData.emergency_contact_name.trim()
        ? rawData.emergency_contact_name.trim()
        : null,
      emergency_contact_mobile: typeof rawData.emergency_contact_mobile === "string" && rawData.emergency_contact_mobile.trim()
        ? rawData.emergency_contact_mobile.trim()
        : null,
      emergency_contact_relationship: typeof rawData.emergency_contact_relationship === "string" && rawData.emergency_contact_relationship.trim()
        ? rawData.emergency_contact_relationship.trim()
        : null,
      status: "active"
    })
    .select("id, full_name, student_id, course:classification, joined_at, status")
    .single();

  if (error || !createdOccupant) {
    return { error: error?.message ?? "Failed to create occupant." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "occupants.created",
      entityType: "occupant",
      entityId: createdOccupant.id,
      metadata: {
        full_name: createdOccupant.full_name,
        student_id: createdOccupant.student_id,
        course: createdOccupant.course,
        joined_at: createdOccupant.joined_at,
        status: createdOccupant.status,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for occupant creation:", auditError);
  }

  revalidatePath("/occupants");
  revalidatePath("/admin/occupants");
  return { success: true };
}

export async function updateOccupant(
  dormId: string,
  occupantId: string,
  formData: FormData
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to update occupants." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    !new Set(["admin", "student_assistant"]).has(membership.role)
  ) {
    return { error: "You do not have permission to update occupants." };
  }

  const { data: previousOccupant, error: previousOccupantError } = await supabase
    .from("occupants")
    .select(
      "id, full_name, student_id, course:classification, joined_at, status, home_address, birthdate, contact_mobile, contact_email, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship"
    )
    .eq("dorm_id", dormId)
    .eq("id", occupantId)
    .maybeSingle();

  if (previousOccupantError || !previousOccupant) {
    return { error: previousOccupantError?.message ?? "Occupant not found." };
  }

  const rawData = {
    full_name: formData.get("full_name"),
    student_id: formData.get("student_id"),
    course: formData.get("classification"),
    joined_at: formData.get("joined_at"),
    status: formData.get("status"),
    home_address: formData.get("home_address"),
    birthdate: formData.get("birthdate"),
    contact_mobile: formData.get("contact_mobile"),
    contact_email: formData.get("contact_email"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_mobile: formData.get("emergency_contact_mobile"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
  };

  // Allow partial updates, but validate stricter if needed. 
  // For simpliciy, reusing logic but manually creating object
  const updates: Record<string, string | number | boolean | null> = {};
  if (rawData.full_name) updates.full_name = String(rawData.full_name).trim();
  if (rawData.student_id !== undefined) updates.student_id = String(rawData.student_id ?? "").trim() || null;
  if (rawData.course !== undefined) updates.classification = String(rawData.course ?? "").trim() || null;
  if (rawData.joined_at) updates.joined_at = String(rawData.joined_at).trim();
  if (rawData.status) {
    const parsedStatus = occupantStatusSchema.safeParse(
      String(rawData.status).trim()
    );
    if (!parsedStatus.success) {
      return { error: "Invalid occupant status." };
    }
    updates.status = parsedStatus.data;
  }
  if (rawData.home_address !== undefined) updates.home_address = String(rawData.home_address ?? "").trim() || null;
  if (rawData.birthdate !== undefined) updates.birthdate = String(rawData.birthdate ?? "").trim() || null;
  if (rawData.contact_mobile !== undefined) updates.contact_mobile = String(rawData.contact_mobile ?? "").trim() || null;
  if (rawData.contact_email !== undefined) {
    const value = String(rawData.contact_email ?? "").trim();
    updates.contact_email = value ? value.toLowerCase() : null;
  }
  if (rawData.emergency_contact_name !== undefined) updates.emergency_contact_name = String(rawData.emergency_contact_name ?? "").trim() || null;
  if (rawData.emergency_contact_mobile !== undefined) updates.emergency_contact_mobile = String(rawData.emergency_contact_mobile ?? "").trim() || null;
  if (rawData.emergency_contact_relationship !== undefined) updates.emergency_contact_relationship = String(rawData.emergency_contact_relationship ?? "").trim() || null;

  const { error } = await supabase
    .from("occupants")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", occupantId);

  if (error) {
    return { error: error.message };
  }

  const changedFields = getChangedOccupantFields(previousOccupant, updates);
  const previousStatus =
    typeof previousOccupant.status === "string" ? previousOccupant.status : null;
  const updatedStatus = typeof updates.status === "string" ? updates.status : previousStatus;

  if (changedFields.length > 0) {
    let action = "occupants.updated";
    if (updatedStatus === "removed" && previousStatus !== "removed") {
      action = "occupants.deleted";
    } else if (updatedStatus === "left" && previousStatus !== "left") {
      action = "occupants.marked_left";
    }

    try {
      await logAuditEvent({
        dormId,
        actorUserId: user.id,
        action,
        entityType: "occupant",
        entityId: occupantId,
        metadata: {
          changed_fields: changedFields,
          previous_status: previousStatus,
          new_status: updatedStatus,
        },
      });
    } catch (auditError) {
      console.error("Failed to write audit event for occupant update:", auditError);
    }
  }

  revalidatePath("/occupants");
  revalidatePath("/admin/occupants");
  revalidatePath(`/admin/occupants/${occupantId}`);
  revalidatePath(`/occupants/${occupantId}`);
  return { success: true };
}
