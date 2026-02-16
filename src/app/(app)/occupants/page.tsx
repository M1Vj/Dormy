import { redirect } from "next/navigation";

import { getOccupants } from "@/app/actions/occupants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RoomRef = {
  code?: string | null;
  level?: number | string | null;
};

type AssignmentRef = {
  room?: RoomRef | RoomRef[] | null;
};

type OccupantRow = {
  id: string;
  full_name?: string | null;
  classification?: string | null;
  student_id?: string | null;
  status?: string | null;
  current_room_assignment?: AssignmentRef | null;
};

const asFirst = <T,>(value?: T | T[] | null) =>
  Array.isArray(value) ? value[0] : value;

export default async function OccupantsPage() {
  const dormId = await getActiveDormId();
  if (!dormId) {
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
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? null;

  if (!role) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No dorm membership found for this account.
      </div>
    );
  }

  if (new Set(["admin", "student_assistant"]).has(role)) {
    redirect("/admin/occupants");
  }

  if (role === "occupant") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Occupant roster access is limited to dorm staff roles.
      </div>
    );
  }

  const occupants = (await getOccupants(dormId, { status: "active" })) as OccupantRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Occupant Roster</h1>
        <p className="text-sm text-muted-foreground">
          Active residents and room placement for your selected dorm.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Occupants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {occupants.map((occupant) => {
              const assignment = occupant.current_room_assignment;
              const roomRef = asFirst(asFirst(assignment?.room ?? null));
              const levelLabel =
                roomRef?.level === null || roomRef?.level === undefined
                  ? "Unassigned level"
                  : `Level ${roomRef.level}`;

              return (
                <div key={occupant.id} className="rounded-lg border p-3">
                  <p className="font-medium">{occupant.full_name ?? "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">{occupant.classification ?? "-"}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Student ID</p>
                      <p>{occupant.student_id ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Room</p>
                      <p>{roomRef?.code ? `Room ${roomRef.code}` : "Unassigned"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Level</p>
                      <p>{levelLabel}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {!occupants.length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No active occupants found.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Classification</th>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 font-medium">Room</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {occupants.map((occupant) => {
                  const assignment = occupant.current_room_assignment;
                  const roomRef = asFirst(asFirst(assignment?.room ?? null));

                  return (
                    <tr key={occupant.id} className="border-b">
                      <td className="px-3 py-2 font-medium">{occupant.full_name ?? "Unnamed"}</td>
                      <td className="px-3 py-2">{occupant.classification ?? "-"}</td>
                      <td className="px-3 py-2">{occupant.student_id ?? "-"}</td>
                      <td className="px-3 py-2">
                        {roomRef?.code ? `Room ${roomRef.code}` : "Unassigned"}
                      </td>
                      <td className="px-3 py-2">
                        {roomRef?.level === null || roomRef?.level === undefined
                          ? "-"
                          : `Level ${roomRef.level}`}
                      </td>
                    </tr>
                  );
                })}
                {!occupants.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No active occupants found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
