import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, FileText } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getEventsOverview } from "@/app/actions/events";
import { getDashboardStats } from "@/app/actions/stats";
import { getExpenses } from "@/app/actions/expenses";
import { StaffStatsGrid } from "@/components/dashboard/staff-stats-grid";
import { TreasurerDashboard } from "@/components/dashboard/treasurer-dashboard";
import { OccupantStanding } from "@/components/dashboard/occupant-standing";

import { Activity, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { getRoleLabel } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFineRules } from "@/app/actions/fines";
import { getLedgerBalance, getLedgerEntries } from "@/app/actions/finance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const finesHref = `/${role}/fines`;

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

  const [fineRules, events, cleaningSnapshot, balance, , stats, expensesResult] = await Promise.all([
    getFineRules(dormId),
    getEventsOverview(dormId),
    getCleaningSnapshot(),
    occupant ? getLedgerBalance(dormId, occupant.id) : Promise.resolve(null),
    occupant ? getLedgerEntries(dormId, occupant.id) : Promise.resolve([]),
    getDashboardStats(dormId),
    getExpenses(dormId, { status: "pending" }),
  ]);

  if ("error" in stats) {
    return <div className="p-6">Error loading stats: {stats.error}</div>;
  }

  const { announcements } = await getDormAnnouncements(dormId, { limit: 3 });
  const pendingExpensesCount = "data" in expensesResult ? (expensesResult.data?.length ?? 0) : 0;

  const now = new Date();
  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= now : false))
    .slice(0, 4);


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

      <div className="grid gap-6">
        {/* Staff Metrics */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="h-4 w-4" />
            Dorm Operations
          </div>
          <StaffStatsGrid stats={stats} />
        </div>

        {/* Adviser Specifics */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Clearance & Oversight
          </div>
          <TreasurerDashboard
            totalCharged={stats.totalCharged}
            totalPaid={stats.totalPaid}
            pendingExpenses={pendingExpensesCount}
            role={role}
          />
        </div>

        {/* Occupant View (Personal Standing) */}
        {occupant && balance && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserCheck className="h-4 w-4" />
              Personal Standing
            </div>
            <OccupantStanding
              balance={balance}
              isCleared={balance.total <= 0}
              nextCleaning={cleaningPlanForRoom ? {
                area: cleaningPlanForRoom.area ?? "Unassigned",
                date: format(new Date(cleaningPlanForRoom.week_start), "MMM d")
              } : null}
              role={role}
            />
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Announcements Card */}
          <Card className="border-l-4 border-l-blue-500 h-full">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base text-sky-600 dark:text-sky-400">Announcements</CardTitle>
                <CardDescription>Dorm-wide updates</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/${role}/home/announcements`}>View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {announcements.length ? (
                <div className="space-y-3">
                  {announcements.map((announcement) => (
                    <div key={announcement.id} className="text-sm">
                      <div className="font-medium">{announcement.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {announcement.body}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No recent announcements.</p>
              )}
            </CardContent>
          </Card>

          {/* AI Shortcut */}
          <Card className="bg-gradient-to-br from-purple-500/5 to-sky-500/5 border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Intelligent Assistant
              </CardTitle>
              <CardDescription>AI-powered reporting and summaries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ask Dormy AI to summarize your ledger, generate event reports, or check occupant standing.
              </p>
              <Button asChild className="w-full bg-purple-600 hover:bg-purple-700">
                <Link href={`/${role}/ai`}>Open AI Workspace</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base text-sky-600 dark:text-sky-400">Announcements</CardTitle>
            <CardDescription>Shared dorm updates visible to your role.</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${role}/home/announcements`}>View all</Link>
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
              <Link href={`/${role}/events`}>
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
