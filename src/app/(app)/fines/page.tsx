import { redirect } from "next/navigation";

import { getFines } from "@/app/actions/fines";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RoomRef = {
  code?: string | null;
};

type RoomAssignment = {
  room?: RoomRef | RoomRef[] | null;
};

type FineOccupant = {
  full_name?: string | null;
  room_assignments?: RoomAssignment[] | RoomAssignment | null;
};

type FineRuleRef = {
  title?: string | null;
  severity?: string | null;
};

type FineRow = {
  id: string;
  pesos?: number | string | null;
  points?: number | string | null;
  note?: string | null;
  issued_at?: string | null;
  created_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  occupant?: FineOccupant | FineOccupant[] | null;
  rule?: FineRuleRef | FineRuleRef[] | null;
};

const asFirst = <T,>(value?: T | T[] | null) =>
  Array.isArray(value) ? value[0] : value;

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

const formatAmount = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  if (Number.isNaN(parsed)) return "0.00";
  return parsed.toFixed(2);
};

const getOccupantName = (occupant?: FineOccupant | FineOccupant[] | null) => {
  const ref = asFirst(occupant);
  return ref?.full_name?.trim() || "Unknown occupant";
};

const getRoomCode = (occupant?: FineOccupant | FineOccupant[] | null) => {
  const ref = asFirst(occupant);
  const assignment = asFirst(ref?.room_assignments ?? null);
  const room = asFirst(assignment?.room ?? null);
  return room?.code ?? null;
};

const getRuleLabel = (rule?: FineRuleRef | FineRuleRef[] | null) => {
  const ref = asFirst(rule);
  if (!ref?.title) return "Custom fine";
  if (!ref.severity) return ref.title;
  return `${ref.title} (${ref.severity})`;
};

export default async function FinesPage() {
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
    redirect("/admin/fines");
  }

  const fines = (await getFines(dormId)) as FineRow[];
  const activeFines = fines.filter((fine) => !fine.voided_at);
  const totalPesos = activeFines.reduce((sum, fine) => sum + Number(fine.pesos ?? 0), 0);
  const totalPoints = activeFines.reduce((sum, fine) => sum + Number(fine.points ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fines</h1>
        <p className="text-sm text-muted-foreground">
          View fines visible to your role and current dorm membership.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fines.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Peso Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalPesos.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Point Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totalPoints.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fines Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Occupant</th>
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 font-medium">Issued</th>
                  <th className="px-3 py-2 font-medium">Amounts</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fines.map((fine) => {
                  const roomCode = getRoomCode(fine.occupant);
                  const isVoided = Boolean(fine.voided_at);

                  return (
                    <tr key={fine.id} className="border-b">
                      <td className="px-3 py-2">
                        <div className="font-medium">{getOccupantName(fine.occupant)}</div>
                        <div className="text-xs text-muted-foreground">
                          {roomCode ? `Room ${roomCode}` : "No room"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{getRuleLabel(fine.rule)}</div>
                        {fine.note ? (
                          <div className="text-xs text-muted-foreground">{fine.note}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{formatDate(fine.issued_at ?? fine.created_at)}</td>
                      <td className="px-3 py-2">
                        <div>₱{formatAmount(fine.pesos)}</div>
                        <div className="text-xs text-muted-foreground">{formatAmount(fine.points)} pts</div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            isVoided
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {isVoided ? "Voided" : "Active"}
                        </span>
                        {isVoided && fine.void_reason ? (
                          <div className="mt-1 text-xs text-muted-foreground">{fine.void_reason}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!fines.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No fines are visible for your current role.
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
