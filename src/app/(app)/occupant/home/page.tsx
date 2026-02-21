import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ClipboardList, FileText, Shield, Wallet } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getEventsOverview } from "@/app/actions/events";
import { getFineRules } from "@/app/actions/fines";
import { getLedgerBalance, getLedgerEntries } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { getRoleLabel, getRoleSummary } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RoomRef = {
  id?: string | null;
  code?: string | null;
  level?: number | null;
};

type AssignmentRef = {
  room?: RoomRef | RoomRef[] | null;
  end_date?: string | null;
};

type OccupantSelf = {
  id: string;
  full_name: string | null;
  course: string | null;
  status: string | null;
  room_assignments?: AssignmentRef[] | AssignmentRef | null;
};

const asFirst = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

function formatPesos(value: number) {
  return `₱${value.toFixed(2)}`;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function parseDeadline(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export default async function HomePage() {
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
    .select("dorm_id, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const resolvedMembership =
    memberships?.find((membership) => membership.dorm_id === activeDormId) ??
    memberships?.[0] ??
    null;

  if (!resolvedMembership?.dorm_id || !resolvedMembership.role) {
    redirect("/join");
  }

  const dormId = resolvedMembership.dorm_id;
  const role = resolvedMembership.role;
  const finesHref = new Set(["admin", "student_assistant"]).has(role)
    ? "/admin/fines"
    : "/fines";

  const { data: dorm } = await supabase
    .from("dorms")
    .select("name")
    .eq("id", dormId)
    .maybeSingle();

  const [semester, occupant] = await Promise.all([
    getActiveSemester(dormId, supabase),
    supabase
      .from("occupants")
      .select(
        "id, full_name, course:classification, status, room_assignments(end_date, room:rooms(id, code, level))"
      )
      .eq("dorm_id", dormId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then((result) => (result.data as OccupantSelf | null) ?? null),
  ]);

  const currentAssignment = asFirst(
    (Array.isArray(occupant?.room_assignments)
      ? occupant?.room_assignments
      : occupant?.room_assignments
        ? [occupant.room_assignments]
        : [])?.filter((assignment) => !assignment.end_date)
  );
  const currentRoom = asFirst(asFirst(currentAssignment?.room ?? null));
  const roomLabel = currentRoom?.code ? `Room ${currentRoom.code}` : "Room unassigned";
  const levelLabel =
    currentRoom?.level === null || currentRoom?.level === undefined
      ? null
      : `Level ${currentRoom.level}`;

  const [fineRules, events, cleaningSnapshot, balance, entries] = await Promise.all([
    getFineRules(dormId),
    getEventsOverview(dormId),
    getCleaningSnapshot(),
    occupant ? getLedgerBalance(dormId, occupant.id) : Promise.resolve(null),
    occupant ? getLedgerEntries(dormId, occupant.id) : Promise.resolve([]),
  ]);

  const { announcements } = await getDormAnnouncements(dormId, { limit: 3 });

  const now = new Date();
  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= now : false))
    .slice(0, 4);

  const evaluationAlerts = (() => {
    // Logic to show pending evaluations if any
    return 0;
  })();

  const cleaningPlanForRoom = (() => {
    if (!currentRoom?.id) return null;
    if ("error" in cleaningSnapshot) return null;

    const plan = cleaningSnapshot.room_plans.find((row) => row.room_id === currentRoom.id);
    if (!plan) return null;
    return {
      area: plan.area_name,
      rest_level: cleaningSnapshot.week?.rest_level ?? null,
      week_start: cleaningSnapshot.week?.week_start ?? cleaningSnapshot.selected_week_start,
    };
  })();

  const eventPayables = (() => {
    const byEvent = new Map<
      string,
      {
        eventTitle: string;
        charged: number;
        paid: number;
        deadline: Date | null;
        label: string | null;
      }
    >();

    for (const entry of entries ?? []) {
      if (entry.voided_at) continue;
      if (!entry.event_id) continue;
      if (entry.ledger !== "contributions") continue;

      const key = String(entry.event_id);
      const current =
        byEvent.get(key) ?? {
          eventTitle: entry.event?.title ?? "Event contribution",
          charged: 0,
          paid: 0,
          deadline: null,
          label: null,
        };

      const amount = Number(entry.amount_pesos ?? 0);
      if (amount >= 0) {
        current.charged += amount;
      } else {
        current.paid += Math.abs(amount);
      }

      const metadata = normalizeMetadata(entry.metadata);
      const deadline = parseDeadline(metadata.payable_deadline);
      if (deadline && (!current.deadline || deadline < current.deadline)) {
        current.deadline = deadline;
      }

      if (!current.label && typeof metadata.payable_label === "string" && metadata.payable_label.trim()) {
        current.label = metadata.payable_label.trim();
      }

      byEvent.set(key, current);
    }

    const rows = [...byEvent.entries()].map(([eventId, value]) => ({
      eventId,
      ...value,
      balance: Math.max(0, value.charged - value.paid),
    }));

    return rows
      .filter((row) => row.balance > 0)
      .sort((a, b) => {
        const aTime = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      })
      .slice(0, 4);
  })();

  const rulesSummary = (() => {
    const active = (fineRules ?? []).filter((rule) => rule.active !== false);
    const counts = {
      minor: active.filter((rule) => rule.severity === "minor").length,
      major: active.filter((rule) => rule.severity === "major").length,
      severe: active.filter((rule) => rule.severity === "severe").length,
      total: active.length,
    };
    return counts;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">
            A safe, high-signal view of your dorm status, schedules, deadlines, and rules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border bg-card px-3 py-1">{dorm?.name ?? "Dorm"}</span>
          {semester ? (
            <span className="rounded-full border bg-card px-3 py-1">{semester.label}</span>
          ) : null}
          <span className="rounded-full border bg-card px-3 py-1">{getRoleLabel(role)}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-t-4 border-t-sky-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your account</CardTitle>
            <CardDescription>{getRoleSummary(role)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {occupant ? (
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Resident</div>
                  <div className="font-medium">{occupant.full_name ?? "Occupant profile"}</div>
                  <div className="text-xs text-muted-foreground">{occupant.course ?? ""}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border bg-muted/30 px-2 py-1 text-xs">{roomLabel}</span>
                  {levelLabel ? (
                    <span className="rounded-md border bg-muted/30 px-2 py-1 text-xs">{levelLabel}</span>
                  ) : null}
                  {occupant.status ? (
                    <span className="rounded-md border bg-muted/30 px-2 py-1 text-xs capitalize">
                      {occupant.status.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Your account is not linked to an occupant profile yet. Payments and personal clearance data may be unavailable.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/occupant/payments">
                  <Wallet className="mr-2 size-4 text-amber-500" />
                  Payments
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href={finesHref}>
                  <FileText className="mr-2 size-4 text-rose-500" />
                  Fines
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/occupant/cleaning">
                  <ClipboardList className="mr-2 size-4 text-lime-500" />
                  Cleaning
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/occupant/evaluation">
                  <Shield className="mr-2 size-4 text-cyan-500" />
                  Evaluation
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Balances</CardTitle>
            <CardDescription>Only your own ledgers are shown here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {balance ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className={`text-lg font-semibold ${balance.total > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {formatPesos(balance.total)}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Events</div>
                  <div className="text-lg font-semibold">{formatPesos(balance.events)}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Fines</div>
                  <div className="text-lg font-semibold">{formatPesos(balance.fines)}</div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">Maintenance</div>
                  <div className="text-lg font-semibold">{formatPesos(balance.maintenance)}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Balance summary is not available for your account yet.
              </div>
            )}

            <Button asChild className="w-full" variant="outline">
              <Link href="/occupant/payments">View transaction history</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>Cleaning and deadlines at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cleaningPlanForRoom ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-lime-600 dark:text-lime-400">Cleaning assignment</div>
                  <div className="text-xs text-muted-foreground">
                    Week of {format(new Date(cleaningPlanForRoom.week_start), "MMM d")}
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  {cleaningPlanForRoom.area ? (
                    <span className="font-medium">{cleaningPlanForRoom.area}</span>
                  ) : (
                    <span className="text-muted-foreground">No area assigned yet.</span>
                  )}
                </div>
                {cleaningPlanForRoom.rest_level ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Rest level: Level {cleaningPlanForRoom.rest_level}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Cleaning plan is unavailable for your current room selection.
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Upcoming payables</div>
              {eventPayables.length ? (
                <div className="space-y-2">
                  {eventPayables.map((row) => {
                    const isOverdue = row.deadline ? row.deadline.getTime() < now.getTime() : false;
                    return (
                      <div key={row.eventId} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.eventTitle}</div>
                            {row.label ? (
                              <div className="truncate text-xs text-muted-foreground">{row.label}</div>
                            ) : null}
                          </div>
                          <div className={`shrink-0 font-semibold ${isOverdue ? "text-rose-600" : "text-amber-600"}`}>
                            {formatPesos(row.balance)}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {row.deadline ? (
                            <span className={isOverdue ? "text-rose-600" : ""}>
                              Deadline: {format(row.deadline, "MMM d, yyyy h:mm a")}
                            </span>
                          ) : (
                            <span>Deadline not set.</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No unpaid event contributions found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base text-sky-600 dark:text-sky-400">Announcements</CardTitle>
            <CardDescription>Shared dorm updates visible to your role.</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/occupant/home/announcements">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {announcements.length ? (
            <div className="space-y-2">
              {announcements.map((announcement) => {
                const preview =
                  announcement.body.length > 220
                    ? `${announcement.body.slice(0, 220).trim()}…`
                    : announcement.body;
                return (
                  <div key={announcement.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{announcement.title}</div>
                        {announcement.committee ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {announcement.committee.name} · {announcement.audience === "committee" ? "Committee members" : "Whole dorm"}
                          </div>
                        ) : null}
                        <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                          {preview}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {announcement.starts_at
                          ? format(new Date(announcement.starts_at), "MMM d, yyyy")
                          : ""}
                      </div>
                    </div>
                    {announcement.visibility === "staff" ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Visibility: <span className="font-medium">staff</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No announcements yet.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-t-4 border-t-orange-500">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base text-orange-600 dark:text-orange-400">Upcoming events</CardTitle>
              <CardDescription>From your current semester calendar.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/occupant/events">
                <CalendarDays className="mr-2 size-4 text-orange-500" />
                Open calendar
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingEvents.length ? (
              <div className="space-y-2">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">{event.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event.starts_at ? format(new Date(event.starts_at), "MMM d, yyyy h:mm a") : "Date TBD"}
                      {event.location ? ` • ${event.location}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                No upcoming events found.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-rose-500">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base text-rose-600 dark:text-rose-400">Rules snapshot</CardTitle>
              <CardDescription>Visible dorm rules and default penalties.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={finesHref}>
                <FileText className="mr-2 size-4 text-rose-500" />
                View fines
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Active rules</div>
                <div className="text-lg font-semibold">{rulesSummary.total}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Severity mix</div>
                <div className="mt-1 text-sm">
                  Minor: <span className="font-medium text-emerald-600">{rulesSummary.minor}</span> · Major:{" "}
                  <span className="font-medium text-amber-600">{rulesSummary.major}</span> · Severe:{" "}
                  <span className="font-medium text-rose-600">{rulesSummary.severe}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/10 p-3 text-sm text-muted-foreground">
              This page intentionally avoids exposing other occupants’ personal details. You’ll only see shared dorm data and your own records.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
