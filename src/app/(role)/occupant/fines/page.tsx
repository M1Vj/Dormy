import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getFines } from "@/app/actions/fines";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

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

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const asFirst = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

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

export default async function FinesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params?.search)?.trim() || "";
  const status = normalizeParam(params?.status)?.trim() || "";
  const hasFilters = Boolean(search) || Boolean(status);

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

  const cookieStore = await cookies();
  const occupantModeCookie = cookieStore.get("dormy_occupant_mode")?.value ?? "0";
  const eligibleForOccupantMode = new Set(["admin", "adviser", "student_assistant", "treasurer", "officer"]).has(role);
  const isOccupantMode = occupantModeCookie === "1" && eligibleForOccupantMode;
  const effectiveRole = isOccupantMode ? "occupant" : role;

  if (new Set(["admin", "student_assistant"]).has(role) && effectiveRole !== "occupant") {
    redirect(`/${role}/fines`);
  }

  // Occupants: only see their own fines
  const { data: occupant } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const fines = (await getFines(dormId, {
    search: search || undefined,
    status: status || undefined,
    occupantId: occupant?.id,
  })) as FineRow[];

  const activeFines = fines.filter((fine) => !fine.voided_at);
  const totalPesos = activeFines.reduce((sum, fine) => sum + Number(fine.pesos ?? 0), 0);
  const totalPoints = activeFines.reduce((sum, fine) => sum + Number(fine.points ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Fines</h1>
          <p className="text-sm text-muted-foreground">
            Your personal fines, points deductions, and current status.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/${effectiveRole}/fines/reports`}>Report a violation</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <CardHeader className="space-y-4">
          <CardTitle className="text-base">Fines ledger</CardTitle>
          <form className="grid gap-2 sm:grid-cols-[1fr_170px_auto_auto]" method="GET">
            <Input
              name="search"
              placeholder="Search occupant, rule, or note"
              defaultValue={search}
            />
            <select
              name="status"
              defaultValue={status}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="voided">Voided</option>
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
            {hasFilters ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link href={`/${effectiveRole}/fines`}>Reset</Link>
              </Button>
            ) : null}
          </form>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {fines.map((fine) => {
              const roomCode = getRoomCode(fine.occupant);
              const isVoided = Boolean(fine.voided_at);

              return (
                <div key={fine.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{getOccupantName(fine.occupant)}</p>
                      <p className="text-xs text-muted-foreground">
                        {roomCode ? `Room ${roomCode}` : "No room"}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isVoided
                        ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                        : "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        }`}
                    >
                      {isVoided ? "Voided" : "Active"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <p>
                      <span className="text-muted-foreground">Rule:</span> {getRuleLabel(fine.rule)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Issued:</span> {formatDate(fine.issued_at ?? fine.created_at)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Amount:</span> ₱{formatAmount(fine.pesos)} · {formatAmount(fine.points)} pts
                    </p>
                    {fine.note ? (
                      <p>
                        <span className="text-muted-foreground">Note:</span> {fine.note}
                      </p>
                    ) : null}
                    {isVoided && fine.void_reason ? (
                      <p>
                        <span className="text-muted-foreground">Void reason:</span> {fine.void_reason}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!fines.length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No fines are visible for your current role.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
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
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${isVoided
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
