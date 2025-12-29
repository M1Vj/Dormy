import Link from "next/link";
import { redirect } from "next/navigation";

import { getOccupant } from "@/app/actions/occupants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createClient } from "@/lib/supabase/server";
import { EditOccupantForm } from "@/components/admin/occupants/edit-occupant-form";

type RoomRef = {
  code?: string | null;
  level?: number | string | null;
};

type RoomAssignment = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  room?: RoomRef | RoomRef[] | null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const getRoomRef = (assignment?: RoomAssignment | null) => {
  if (!assignment?.room) return null;
  return Array.isArray(assignment.room) ? assignment.room[0] : assignment.room;
};

const getRoomLabel = (assignment?: RoomAssignment | null) => {
  const roomRef = getRoomRef(assignment);
  if (!roomRef) return "Unassigned";
  return roomRef.code ? `Room ${roomRef.code}` : "Room";
};

const getStatusClass = (status?: string | null) => {
  if (status === "active") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "left") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  if (status === "removed") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
  }
  return "border-muted bg-muted text-muted-foreground";
};

export default async function AdminOccupantProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { mode?: string };
}) {
  const supabase = await createClient();
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

  const activeMembership =
    memberships?.find((membership) => membership.dorm_id === activeDormId) ??
    memberships?.[0];

  if (!activeMembership || activeMembership.role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const occupant = await getOccupant(activeMembership.dorm_id, params.id);

  if (!occupant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Occupant not found.</p>
        <Button asChild variant="secondary">
          <Link href="/admin/occupants">Back to occupants</Link>
        </Button>
      </div>
    );
  }

  const isEditMode = searchParams.mode === "edit";

  const statusLabel = occupant.status
    ? occupant.status.replace(/_/g, " ")
    : "unknown";
  const currentRoomLabel = getRoomLabel(occupant.current_room_assignment);
  const currentRoomRef = getRoomRef(occupant.current_room_assignment);
  const currentRoomLevel =
    currentRoomRef?.level === null || currentRoomRef?.level === undefined
      ? "-"
      : `Level ${currentRoomRef.level}`;
  const assignments = (occupant.room_assignments as RoomAssignment[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {occupant.full_name ?? "Occupant profile"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Profile details and room history.
          </p>
        </div>
        <div className="flex gap-2">
          {!isEditMode && (
            <Button asChild variant="outline">
              <Link href={`/admin/occupants/${occupant.id}?mode=edit`}>Edit</Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/admin/occupants">Back to occupants</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isEditMode ? "Edit Occupant" : "Occupant details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditMode ? (
            <EditOccupantForm dormId={activeMembership.dorm_id} occupant={occupant} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${getStatusClass(
                    occupant.status
                  )}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Student ID</p>
                <p className="text-sm font-medium">
                  {occupant.student_id ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Classification</p>
                <p className="text-sm font-medium">
                  {occupant.classification ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="text-sm font-medium">{formatDate(occupant.joined_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current room</p>
                <p className="text-sm font-medium">{currentRoomLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current level</p>
                <p className="text-sm font-medium">{currentRoomLevel}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room history</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No room assignments yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Room</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Start date</th>
                    <th className="px-3 py-2 font-medium">End date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => {
                    const roomRef = getRoomRef(assignment);
                    const roomLabel = roomRef?.code
                      ? `Room ${roomRef.code}`
                      : "Room";
                    const levelLabel =
                      roomRef?.level === null || roomRef?.level === undefined
                        ? "-"
                        : `Level ${roomRef.level}`;
                    const isActive = !assignment.end_date;

                    return (
                      <tr key={assignment.id} className="border-b">
                        <td className="px-3 py-2 font-medium">{roomLabel}</td>
                        <td className="px-3 py-2">{levelLabel}</td>
                        <td className="px-3 py-2">
                          {formatDate(assignment.start_date)}
                        </td>
                        <td className="px-3 py-2">
                          {assignment.end_date
                            ? formatDate(assignment.end_date)
                            : "Present"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isActive
                                ? "border-primary/20 bg-primary/10 text-primary"
                                : "border-muted bg-muted text-muted-foreground"
                              }`}
                          >
                            {isActive ? "Current" : "Ended"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
