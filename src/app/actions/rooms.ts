"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getRoomsWithOccupants(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  // Fetch rooms and all assignments
  // We filter for active assignments in JS to avoid inner-join behavior that excludes empty rooms
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select(`
      *,
      room_assignments(
        id,
        start_date,
        end_date,
        occupant:occupants(*)
      )
    `)
    .eq("dorm_id", dormId)
    .order("sort_order");

  if (error) {
    console.error("Error fetching rooms:", error);
    return [];
  }

  // Filter assignments to only include active ones (end_date is null)
  return rooms.map((room) => ({
    ...room,
    current_assignments: (room.room_assignments as { end_date: string | null }[] || []).filter(
      (a) => !a.end_date
    ),
    room_assignments: undefined, // cleanup
  }));
}

export async function assignOccupant(
  dormId: string,
  roomId: string,
  occupantId: string,
  startDate: string = new Date().toISOString().split('T')[0]
) {
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

  const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant", "adviser"]).has(r));
  if (membershipError || !hasAccess) {
    return { error: "You do not have permission to assign occupants." };
  }

  const [{ data: occupant, error: occupantError }, { data: targetRoom, error: roomError }] =
    await Promise.all([
      supabase
        .from("occupants")
        .select("id, full_name")
        .eq("dorm_id", dormId)
        .eq("id", occupantId)
        .maybeSingle(),
      supabase
        .from("rooms")
        .select("id, code, capacity")
        .eq("dorm_id", dormId)
        .eq("id", roomId)
        .maybeSingle(),
    ]);

  if (occupantError || !occupant) {
    return { error: occupantError?.message ?? "Occupant not found." };
  }

  if (roomError || !targetRoom) {
    return { error: roomError?.message ?? "Room not found." };
  }

  // Capacity enforcement: count active assignments in the target room
  const { count: activeCount, error: countError } = await supabase
    .from("room_assignments")
    .select("id", { count: "exact", head: true })
    .eq("dorm_id", dormId)
    .eq("room_id", roomId)
    .is("end_date", null);

  if (countError) {
    return { error: "Failed to check room capacity." };
  }

  const roomCapacity = targetRoom.capacity ?? 6; // fallback to default capacity
  if ((activeCount ?? 0) >= roomCapacity) {
    return {
      error: `Room ${targetRoom.code} is at full capacity (${activeCount}/${roomCapacity}). Remove an occupant first or increase the room capacity.`,
    };
  }

  // 1. Check if occupant has active assignment
  const { data: activeAssignment } = await supabase
    .from("room_assignments")
    .select("id, room_id")
    .eq("dorm_id", dormId)
    .eq("occupant_id", occupantId)
    .is("end_date", null)
    .maybeSingle();

  let previousRoomCode: string | null = null;

  if (activeAssignment) {
    // If already in this room, do nothing or return message
    if (activeAssignment.room_id === roomId) {
      return { error: "Occupant is already assigned to this room." };
    }

    const { data: previousRoom } = await supabase
      .from("rooms")
      .select("code")
      .eq("dorm_id", dormId)
      .eq("id", activeAssignment.room_id)
      .maybeSingle();
    previousRoomCode = previousRoom?.code ?? null;

    // Close old assignment
    const { error: closeError } = await supabase
      .from("room_assignments")
      .update({ end_date: startDate }) // Move happens same day effectively
      .eq("id", activeAssignment.id);

    if (closeError) return { error: "Failed to close previous assignment" };
  }

  // 2. Create new assignment
  const { data: createdAssignment, error: assignError } = await supabase
    .from("room_assignments")
    .insert({
      dorm_id: dormId,
      room_id: roomId,
      occupant_id: occupantId,
      start_date: startDate,
    })
    .select("id")
    .single();

  if (assignError || !createdAssignment) {
    return { error: assignError?.message ?? "Failed to assign occupant." };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: activeAssignment ? "rooms.assignment_transferred" : "rooms.assignment_set",
      entityType: "room_assignment",
      entityId: createdAssignment.id,
      metadata: {
        occupant_id: occupant.id,
        occupant_name: occupant.full_name,
        room_id: targetRoom.id,
        room_code: targetRoom.code,
        start_date: startDate,
        previous_room_id: activeAssignment?.room_id ?? null,
        previous_room_code: previousRoomCode,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for room assignment:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/rooms`);
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/occupants/${occupantId}`);
  revalidatePath(`/${activeRole}/profile`);
  revalidatePath(`/${activeRole}/home`);
  return { success: true };
}

export async function removeOccupantFromRoom(assignmentId: string, endDate: string) {
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

  const { data: assignment, error: assignmentError } = await supabase
    .from("room_assignments")
    .select("id, dorm_id, occupant_id, room_id, start_date, end_date, occupant:occupants(full_name), room:rooms(code)")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    return { error: assignmentError?.message ?? "Room assignment not found." };
  }

  const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", assignment.dorm_id)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant", "adviser"]).has(r));
  if (membershipError || !hasAccess) {
    return { error: "You do not have permission to remove assignments." };
  }

  const { error } = await supabase
    .from("room_assignments")
    .update({ end_date: endDate })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  const occupant = Array.isArray(assignment.occupant)
    ? assignment.occupant[0]
    : assignment.occupant;
  const room = Array.isArray(assignment.room) ? assignment.room[0] : assignment.room;

  try {
    await logAuditEvent({
      dormId: assignment.dorm_id,
      actorUserId: user.id,
      action: "rooms.assignment_removed",
      entityType: "room_assignment",
      entityId: assignmentId,
      metadata: {
        occupant_id: assignment.occupant_id,
        occupant_name: occupant?.full_name ?? null,
        room_id: assignment.room_id,
        room_code: room?.code ?? null,
        start_date: assignment.start_date,
        end_date: endDate,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for room assignment removal:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/rooms`);
  revalidatePath(`/${activeRole}/occupants`);
  revalidatePath(`/${activeRole}/occupants/${assignment.occupant_id}`);
  revalidatePath(`/${activeRole}/profile`);
  revalidatePath(`/${activeRole}/home`);
  return { success: true };
}

export async function overrideRoomLevel(
  dormId: string,
  roomId: string,
  levelOverride: number | null
) {
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

  const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "student_assistant", "adviser"]).has(r));
  if (membershipError || !hasAccess) {
    return { error: "You do not have permission to edit rooms." };
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .update({ level_override: levelOverride })
    .eq("id", roomId)
    .eq("dorm_id", dormId)
    .select("id, code, level_override")
    .single();

  if (roomError || !room) {
    return { error: roomError?.message ?? "Failed to override room level." };
  }

  try {
    await logAuditEvent({
      dormId: dormId,
      actorUserId: user.id,
      action: "rooms.override_level",
      entityType: "room",
      entityId: roomId,
      metadata: {
        room_code: room.code,
        level_override: levelOverride,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for room level override:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/rooms`);
  return { success: true };
}
