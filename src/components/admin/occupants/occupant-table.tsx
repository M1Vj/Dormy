import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RoomRef = {
  id: string;
  code: string | null;
  level: number | string | null;
};

type OccupantAssignment = {
  room?: RoomRef | RoomRef[] | null;
};

export type OccupantRow = {
  id: string;
  full_name?: string | null;
  classification?: string | null;
  student_id?: string | null;
  status?: string | null;
  joined_at?: string | null;
  current_room_assignment?: OccupantAssignment | null;
};

type OccupantTableProps = {
  occupants: OccupantRow[];
  filters?: {
    search?: string;
    status?: string;
    room?: string;
    level?: string;
  };
};

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "left", label: "Left" },
];

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const getRoomCode = (assignment?: OccupantAssignment | null) => {
  if (!assignment?.room) return null;
  const room = Array.isArray(assignment.room)
    ? assignment.room[0]
    : assignment.room;
  return room?.code ?? null;
};

const getStatusClass = (status?: string | null) => {
  if (status === "active") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "left") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "border-muted bg-muted text-muted-foreground";
};

export function OccupantTable({ occupants, filters }: OccupantTableProps) {
  const hasFilters =
    Boolean(filters?.search) ||
    Boolean(filters?.status) ||
    Boolean(filters?.room) ||
    Boolean(filters?.level);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">Occupant roster</CardTitle>
            <p className="text-sm text-muted-foreground">
              Search by name or student ID and filter by status, room, or level.
            </p>
          </div>
          <form className="flex flex-wrap items-center gap-2" method="GET">
            <Input
              className="w-48"
              name="search"
              placeholder="Search name or ID"
              defaultValue={filters?.search ?? ""}
            />
            <Input
              className="w-36"
              name="room"
              placeholder="Room code"
              defaultValue={filters?.room ?? ""}
            />
            <Input
              className="w-28"
              name="level"
              placeholder="Level"
              type="number"
              min="0"
              defaultValue={filters?.level ?? ""}
            />
            <select
              name="status"
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={filters?.status ?? ""}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">
              Filter
            </Button>
            {hasFilters ? (
              <Button asChild type="button" size="sm" variant="ghost">
                <Link href="/admin/occupants">Reset</Link>
              </Button>
            ) : null}
          </form>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Classification</th>
                <th className="px-3 py-2 font-medium">Student ID</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Joined date</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {occupants.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No occupants match this filter.
                  </td>
                </tr>
              ) : (
                occupants.map((occupant) => {
                  const roomCode = getRoomCode(
                    occupant.current_room_assignment
                  );
                  const statusLabel = occupant.status
                    ? occupant.status.replace(/_/g, " ")
                    : "unknown";

                  return (
                    <tr key={occupant.id} className="border-b">
                      <td className="px-3 py-2 font-medium">
                        {occupant.full_name ?? "Unnamed occupant"}
                      </td>
                      <td className="px-3 py-2">
                        {occupant.classification ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {occupant.student_id ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            roomCode
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-muted bg-muted text-muted-foreground"
                          }`}
                        >
                          {roomCode ?? "Unassigned"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${getStatusClass(
                            occupant.status
                          )}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {formatDate(occupant.joined_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/admin/occupants/${occupant.id}`}>
                              View
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              href={`/admin/occupants/${occupant.id}?mode=edit`}
                            >
                              Edit
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
