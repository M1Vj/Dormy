"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const occupantSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  student_id: z.string().optional(),
  classification: z.string().optional(),
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
      *,
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
      *,
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
    classification: formData.get("classification"),
    joined_at: formData.get("joined_at") || new Date().toISOString().split('T')[0],
  };

  const parsed = occupantSchema.safeParse(rawData);

  if (!parsed.success) {
    return { error: "Invalid data" };
  }

  const { error } = await supabase
    .from("occupants")
    .insert({
      dorm_id: dormId,
      full_name: parsed.data.full_name,
      student_id: parsed.data.student_id ? parsed.data.student_id : null,
      classification: parsed.data.classification,
      joined_at: parsed.data.joined_at,
      status: "active"
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/occupants");
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

  // We can reuse the same schema for now, or make partial
  const rawData = {
    full_name: formData.get("full_name"),
    student_id: formData.get("student_id"),
    classification: formData.get("classification"),
    joined_at: formData.get("joined_at"),
    status: formData.get("status"),
  };

  // Allow partial updates, but validate stricter if needed. 
  // For simpliciy, reusing logic but manually creating object
  const updates: Record<string, string | number | boolean | null> = {};
  if (rawData.full_name) updates.full_name = rawData.full_name as string;
  if (rawData.student_id !== undefined) updates.student_id = (rawData.student_id as string) || null;
  if (rawData.classification) updates.classification = rawData.classification as string;
  if (rawData.joined_at) updates.joined_at = rawData.joined_at as string;
  if (rawData.status) updates.status = rawData.status as string;

  const { error } = await supabase
    .from("occupants")
    .update(updates)
    .eq("dorm_id", dormId)
    .eq("id", occupantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/occupants");
  revalidatePath(`/occupants/${occupantId}`);
  return { success: true };
}
