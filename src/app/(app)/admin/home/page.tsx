import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ClipboardList, FileText, Shield, Wallet } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getEventsOverview } from "@/app/actions/events";
import { getDashboardStats } from "@/app/actions/stats";
import { getDormApplicationsForActiveDorm } from "@/app/actions/join";
import { StaffStatsGrid } from "@/components/dashboard/staff-stats-grid";
import { AdminQuickActions } from "@/components/dashboard/admin-quick-actions";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldAlert, Sparkles, UserCheck } from "lucide-react";
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
  const finesHref = `/${role}/fines`;

  const { data: dorm } = await supabase
    .from("dorms")
    .select("name, capacity")
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

  const [fineRules, events, cleaningSnapshot, balance, entries, stats, applications] = await Promise.all([
    getFineRules(dormId),
    getEventsOverview(dormId),
    getCleaningSnapshot(),
    occupant ? getLedgerBalance(dormId, occupant.id) : Promise.resolve(null),
    occupant ? getLedgerEntries(dormId, occupant.id) : Promise.resolve([]),
    getDashboardStats(dormId),
    getDormApplicationsForActiveDorm(dormId, "pending"),
  ]);

  if ("error" in stats) {
    return <div className="p-6">Error loading stats: {stats.error}</div>;
  }

  const { announcements } = await getDormAnnouncements(dormId, { limit: 3 });

  const activeDormCapacity = dorm?.capacity ?? 50;
  const pendingAppsCount = applications.length;

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
          eventTitle: entry.event?.title ?? "Contribution",
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

      <div className="grid gap-6">
        {/* Staff Metrics */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Activity className="h-4 w-4" />
            Dorm Operations
          </div>
          <StaffStatsGrid stats={stats} />
        </div>

        {/* Admin Specifics */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            Administrative Control
          </div>
          <AdminQuickActions 
            dormId={dormId}
            totalOccupants={stats.totalOccupants}
            capacity={activeDormCapacity}
            pendingApplications={pendingAppsCount}
            role={role}
          />
        </div>

        {/* Occupant View (Personal Standing) */}
        {occupant && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserCheck className="h-4 w-4" />
              Personal Standing
            </div>
            <OccupantStanding 
              balance={balance!}
              isCleared={balance!.total <= 0}
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

          {/* AI / Intelligent Insights Shortcut */}
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
    </div>
  );
}
