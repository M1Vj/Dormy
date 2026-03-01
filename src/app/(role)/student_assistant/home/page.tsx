import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Activity, Bell, ClipboardList, ShieldCheck } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getEventsOverview } from "@/app/actions/events";
import { getFineReports } from "@/app/actions/fine-reports";
import { getDashboardStats } from "@/app/actions/stats";
import { SaDashboard } from "@/components/dashboard/sa-dashboard";
import { StaffStatsGrid } from "@/components/dashboard/staff-stats-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function StudentAssistantHomePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured for this environment.</div>;
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
    memberships?.find((membership) => membership.dorm_id === activeDormId) ?? memberships?.[0] ?? null;

  if (!resolvedMembership?.dorm_id) {
    redirect("/join");
  }

  const dormId = resolvedMembership.dorm_id;
  const rolePath = "student_assistant";

  const [{ data: dorm }, semester, stats, fineReportsResult, cleaningSnapshot, events, { announcements }] = await Promise.all([
    supabase.from("dorms").select("name").eq("id", dormId).maybeSingle(),
    getActiveSemester(dormId, supabase),
    getDashboardStats(dormId),
    getFineReports(dormId),
    getCleaningSnapshot(),
    getEventsOverview(dormId),
    getDormAnnouncements(dormId, { limit: 4 }),
  ]);

  if ("error" in stats) {
    return <div className="p-6 text-sm text-destructive">Error loading stats: {stats.error}</div>;
  }

  const pendingFinesCount = "data" in fineReportsResult
    ? (fineReportsResult.data?.filter((report) => report.status === "pending").length ?? 0)
    : 0;
  const todayCleaningCount = "error" in cleaningSnapshot ? 0 : cleaningSnapshot.room_plans.length;

  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= new Date() : false))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Student Assistant Home</h1>
        <p className="text-sm text-muted-foreground">
          {dorm?.name ?? "Dorm"}
          {semester ? ` · ${semester.label}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4" />
          Dorm Operations
        </div>
        <StaffStatsGrid stats={stats} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Duty Management
        </div>
        <SaDashboard
          unverifiedFines={pendingFinesCount}
          todayCleaningCount={todayCleaningCount}
          role={rolePath}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Announcements
            </CardTitle>
            <CardDescription>Dorm-wide updates visible to residents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length ? (
              announcements.map((announcement) => (
                <div key={announcement.id} className={`rounded-md border p-3 ${!announcement.dorm_id ? "border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10" : ""}`}>
                  <div className="flex items-center gap-2">
                    {!announcement.dorm_id && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Admin</span>}
                    <p className="text-sm font-medium">{announcement.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{announcement.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent announcements.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/student_assistant/home/announcements">Manage announcements</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" />
              Upcoming Events
            </CardTitle>
            <CardDescription>Near-term events that may require SA coordination.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.length ? (
              upcomingEvents.map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.starts_at ? format(new Date(event.starts_at), "MMM d, yyyy h:mm a") : "Date TBD"}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/student_assistant/events">Open events</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
