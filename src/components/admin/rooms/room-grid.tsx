import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AssignOccupantDialog,
  UnassignedOccupant,
} from "@/components/admin/rooms/assign-occupant-dialog";

type OccupantRef = {
  id: string;
  full_name?: string | null;
};

type RoomAssignment = {
  id: string;
  occupant?: OccupantRef | OccupantRef[] | null;
};

export type RoomWithAssignments = {
  id: string;
  code?: string | null;
  level?: number | string | null;
  capacity?: number | null;
  current_assignments?: RoomAssignment[] | null;
};

type RoomGridProps = {
  dormId: string;
  rooms: RoomWithAssignments[];
  unassignedOccupants: UnassignedOccupant[];
};

const getOccupantName = (assignment: RoomAssignment) => {
  if (!assignment.occupant) return "Unknown occupant";
  const occupant = Array.isArray(assignment.occupant)
    ? assignment.occupant[0]
    : assignment.occupant;
  return occupant?.full_name?.trim() || "Unnamed occupant";
};

const getLevelLabel = (levelKey: string) => {
  if (levelKey === "Unassigned") return "Unassigned level";
  return `Level ${levelKey}`;
};

export function RoomGrid({
  dormId,
  rooms,
  unassignedOccupants,
}: RoomGridProps) {
  if (!rooms.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        No rooms found for this dorm.
      </div>
    );
  }

  const groupedRooms = rooms.reduce<Record<string, RoomWithAssignments[]>>(
    (acc, room) => {
      const key =
        room.level === null || room.level === undefined
          ? "Unassigned"
          : String(room.level);
      if (!acc[key]) acc[key] = [];
      acc[key].push(room);
      return acc;
    },
    {}
  );

  const sortedLevels = Object.keys(groupedRooms).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    const aNum = Number(a);
    const bNum = Number(b);
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
      return aNum - bNum;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return (
    <div className="space-y-8">
      {sortedLevels.map((levelKey) => {
        const levelRooms = groupedRooms[levelKey] ?? [];
        return (
          <section key={levelKey} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {getLevelLabel(levelKey)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {levelRooms.length} room
                  {levelRooms.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {levelRooms.map((room) => {
                const assignments = room.current_assignments ?? [];
                const occupancy = assignments.length;
                const capacity = room.capacity ?? 0;
                const occupancyPercent =
                  capacity > 0
                    ? Math.min((occupancy / capacity) * 100, 100)
                    : 0;
                const occupantNames = assignments.map(getOccupantName);
                const roomLabel = room.code ? `Room ${room.code}` : "Room";
                const capacityLabel = capacity > 0 ? capacity : "?";

                return (
                  <Card key={room.id} className="flex h-full flex-col">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base">{roomLabel}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Capacity {capacityLabel}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Occupancy</span>
                          <span>
                            {occupancy}/{capacityLabel}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${occupancyPercent}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Current occupants
                        </p>
                        {occupantNames.length ? (
                          <ul className="space-y-1 text-sm">
                            {occupantNames.map((name, index) => (
                              <li key={`${room.id}-${index}`}>{name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No occupants assigned.
                          </p>
                        )}
                      </div>
                      <div className="mt-auto">
                        <AssignOccupantDialog
                          dormId={dormId}
                          roomId={room.id}
                          roomLabel={roomLabel}
                          occupants={unassignedOccupants}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
