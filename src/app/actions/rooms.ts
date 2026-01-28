"use server";

import { revalidatePath } from "next/cache";
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

  // 1. Check if occupant has active assignment
  const { data: activeAssignment } = await supabase
    .from("room_assignments")
    .select("id, room_id")
    .eq("occupant_id", occupantId)
    .is("end_date", null)
    .single();

  if (activeAssignment) {
    // If already in this room, do nothing or return message
    if (activeAssignment.room_id === roomId) {
      return { error: "Occupant is already assigned to this room." };
    }

    // Close old assignment
    const { error: closeError } = await supabase
      .from("room_assignments")
      .update({ end_date: startDate }) // Move happens same day effectively
      .eq("id", activeAssignment.id);

    if (closeError) return { error: "Failed to close previous assignment" };
  }

  // 2. Create new assignment
  const { error: assignError } = await supabase
    .from("room_assignments")
    .insert({
      dorm_id: dormId,
      room_id: roomId,
      occupant_id: occupantId,
      start_date: startDate,
    });

  if (assignError) {
    return { error: assignError.message };
  }

  revalidatePath("/admin/rooms");
  revalidatePath("/admin/occupants");
  return { success: true };
}

export async function removeOccupantFromRoom(assignmentId: string, endDate: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { error } = await supabase
    .from("room_assignments")
    .update({ end_date: endDate })
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/rooms");
  revalidatePath("/admin/occupants");
  return { success: true };
}
