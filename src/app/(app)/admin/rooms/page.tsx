import { redirect } from "next/navigation";

import { getOccupants } from "@/app/actions/occupants";
import { getRoomsWithOccupants } from "@/app/actions/rooms";
import { RoomGrid } from "@/components/admin/rooms/room-grid";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminRoomsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeDormId = await getActiveDormId();
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id);

  const activeMemberships = memberships?.filter(m => m.dorm_id === activeDormId!) ?? [];
  const hasAccess = activeMemberships.some(m => new Set(["admin", "student_assistant", "adviser"]).has(m.role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const rooms = await getRoomsWithOccupants(activeDormId!);
  const occupants = await getOccupants(activeDormId!, {
    status: "active",
  });
  const unassignedOccupants = occupants.filter(
    (occupant) => !occupant.current_room_assignment
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rooms</h1>
        <p className="text-sm text-muted-foreground">
          Review occupancy and assign residents by floor.
        </p>
      </div>
      <RoomGrid
        rooms={rooms}
        dormId={activeDormId!}
        unassignedOccupants={unassignedOccupants}
      />
    </div>
  );
}
