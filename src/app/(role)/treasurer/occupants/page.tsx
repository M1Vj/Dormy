import { redirect } from "next/navigation";
import { format } from "date-fns";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { getOccupants } from "@/app/actions/occupants";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Occupants | Dormy",
  description: "View occupants grouped by room with their payable contributions",
};

export default async function TreasurerOccupantsPage() {
  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

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
    redirect("/auth/sign-in");
  }

  // Authorize
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set(["admin", "treasurer"]).has(r));

  if (!hasAccess) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have permission to view this page.</div>;
  }

  // Get current semester
  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  if ("error" in semesterResult) {
    return (
      <div className="p-6 text-sm text-destructive">
        {semesterResult.error ?? "Failed to resolve active semester."}
      </div>
    );
  }
  const activeSemesterId = semesterResult.semesterId;

  // Fetch active occupants
  const activeOccupants = await getOccupants(activeDormId, { status: "active" });

  // Fetch contribution ledger entries for this semester
  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select("occupant_id, entry_type, amount_pesos, metadata")
    .eq("dorm_id", activeDormId)
    .eq("semester_id", activeSemesterId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (ledgerError) {
    return <div className="p-6 text-sm text-destructive">Error loading contribution payables.</div>;
  }

  // Aggregate payables per occupant based on their contribution charges and payments
  const payableMap = new Map<string, number>();

  for (const entry of ledgerEntries || []) {
    if (!entry.occupant_id) continue;

    // Ignore manual inflow/adjustments that do not have associated occupants (sanity check)
    const metadata = typeof entry.metadata === "object" && entry.metadata !== null ? entry.metadata : {};
    if (metadata.finance_manual_inflow === true) continue;

    const currentPayable = payableMap.get(entry.occupant_id) || 0;
    const amount = Number(entry.amount_pesos || 0);

    // If charge, add to payable. If payment (or negative amount), subtract.
    if (entry.entry_type === "charge" && amount > 0) {
      payableMap.set(entry.occupant_id, currentPayable + amount);
    } else if (entry.entry_type === "payment" || amount < 0) {
      payableMap.set(entry.occupant_id, currentPayable - Math.abs(amount));
    }
  }

  // Group occupants by room
  type RoomGroup = {
    roomCode: string;
    level: number;
    occupants: Array<{
      id: string;
      fullName: string;
      studentId: string | null;
      payable: number;
    }>;
  };

  const roomGroupsMap = new Map<string, RoomGroup>();

  for (const occupant of activeOccupants) {
    const roomAssignment = occupant.current_room_assignment;
    const room = roomAssignment?.room;

    // Handle potential array or single object from Supabase relation
    const roomData = Array.isArray(room) ? room[0] : room;
    const roomCode = roomData?.code || "Unassigned";
    const roomLevel = roomData?.level || 0;

    if (!roomGroupsMap.has(roomCode)) {
      roomGroupsMap.set(roomCode, {
        roomCode,
        level: roomLevel,
        occupants: [],
      });
    }

    const group = roomGroupsMap.get(roomCode)!;
    const payable = Math.max(0, payableMap.get(occupant.id) || 0); // Don't show negative payables as owing

    group.occupants.push({
      id: occupant.id,
      fullName: occupant.full_name,
      studentId: occupant.student_id,
      payable,
    });
  }

  // Sort groups by level then room code
  const sortedRoomGroups = Array.from(roomGroupsMap.values()).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true });
  });

  return (
    <div className="container py-6 space-y-6 max-w-7xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Occupants</h1>
          <p className="text-muted-foreground mt-2">
            View occupants grouped by their assigned rooms and their remaining payable contributions for this semester.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sortedRoomGroups.map((group) => {
          // Calculate total remaining payable for the room
          const roomTotalPayable = group.occupants.reduce((sum, occ) => sum + occ.payable, 0);

          return (
            <Card key={group.roomCode} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-muted/20 border-b">
                <CardTitle className="text-xl font-semibold">
                  {group.roomCode}
                </CardTitle>
                <Badge variant={roomTotalPayable > 0 ? "destructive" : "secondary"}>
                  Room Total: ₱{roomTotalPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Badge>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col pt-2 pb-4">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-0 hover:bg-transparent">
                      <TableHead className="h-8 py-1">Occupant</TableHead>
                      <TableHead className="h-8 py-1 text-right">Payable</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.occupants.map((occ) => (
                      <TableRow key={occ.id} className="border-b-0">
                        <TableCell className="py-2">
                          <p className="font-medium text-sm leading-tight">{occ.fullName}</p>
                          {occ.studentId && (
                            <p className="text-xs text-muted-foreground">{occ.studentId}</p>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <span className={`text-sm font-medium ${occ.payable > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                            ₱{occ.payable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {group.occupants.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                          No active occupants.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}

        {sortedRoomGroups.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground border rounded-xl border-dashed">
            No active occupants found for this dorm.
          </div>
        )}
      </div>
    </div>
  );
}
