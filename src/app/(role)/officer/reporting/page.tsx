import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/stats";
import { getEventsOverview } from "@/app/actions/events";
import {
  getCommittee,
  getCommitteeFinanceSummary,
  type CommitteeDetail,
  type CommitteeFinanceSummaryRow,
} from "@/app/actions/committees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reporting/stat-card";
import { CommitteeReportView } from "@/components/reporting/committee-report-view";
import { PrintReportButton } from "@/components/reporting/print-report-button";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Star,
  Camera,
  TrendingUp,
} from "lucide-react";

export default async function ReportingDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map(m => m.role) ?? ["occupant"];

  // Check if occupant is a committee head
  let committeeData: CommitteeDetail | null = null;
  let committeeFinances: CommitteeFinanceSummaryRow[] = [];

  const { data: userCommitteeRoles } = await supabase
    .from("committee_members")
    .select("committee_id, role")
    .eq("user_id", user.id)
    .in("role", ["head", "co-head"])
    .limit(1);

  const userCommitteeRole = userCommitteeRoles?.[0] || null;

  if (userCommitteeRole) {
    const cRes = await getCommittee(userCommitteeRole.committee_id);
    const fRes = await getCommitteeFinanceSummary(userCommitteeRole.committee_id);
    if (cRes.data && cRes.data.dorm_id === dormId) {
      committeeData = cRes.data;
      if (fRes.data) committeeFinances = fRes.data;
    }
  }

  const isDormStaff = roles.some(r => new Set(["admin", "adviser", "student_assistant", "treasurer", "officer"]).has(r));

  if (!isDormStaff && !committeeData) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
        <BarChart3 className="h-12 w-12 text-muted" />
        <h2 className="text-xl font-semibold">No Reports Available</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          You do not have the required roles or committee assignments to view reports.
        </p>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // --- RENDER COMMITTEE HEAD VIEW (uses shared component) ---
  if (!isDormStaff && committeeData) {
    return (
      <CommitteeReportView
        committeeData={committeeData}
        committeeFinances={committeeFinances}
        currentDate={currentDate}
      />
    );
  }

  // --- RENDER OFFICER EVENTS REPORT ---
  const [statsRes, events] = await Promise.all([
    getDashboardStats(dormId),
    getEventsOverview(dormId),
  ]);

  if ("error" in statsRes) return <div className="p-6 text-sm text-destructive">{statsRes.error}</div>;
  const stats = statsRes;

  const ratedEvents = events.filter(e => e.average_rating !== null);
  const overallAvgRating = ratedEvents.length > 0
    ? ratedEvents.reduce((sum, e) => sum + (e.average_rating ?? 0), 0) / ratedEvents.length
    : null;
  const totalPhotos = events.reduce((sum, e) => sum + e.photo_count, 0);
  const contributionCollectionRate = stats.eventsCharged > 0
    ? ((stats.eventsPaid / stats.eventsCharged) * 100)
    : 0;

  return (
    <div className="space-y-8 print:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Events Report</h1>
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            {currentDate}
            <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 text-xs uppercase tracking-wider font-semibold">
              Officer
            </span>
          </p>
        </div>
        <PrintReportButton />
      </div>

      {/* KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Events"
          value={`${stats.totalEvents}`}
          sublabel="Organized this semester"
          icon={CalendarDays}
        />
        <StatCard
          label="Average Rating"
          value={overallAvgRating !== null ? overallAvgRating.toFixed(1) : "—"}
          sublabel={`${ratedEvents.length} event${ratedEvents.length !== 1 ? "s" : ""} rated`}
          icon={Star}
          variant={overallAvgRating !== null && overallAvgRating >= 4 ? "success" : overallAvgRating !== null && overallAvgRating < 3 ? "danger" : "default"}
        />
        <StatCard
          label="Collection Rate"
          value={`${contributionCollectionRate.toFixed(0)}%`}
          sublabel={`₱${stats.eventsPaid.toFixed(2)} of ₱${stats.eventsCharged.toFixed(2)}`}
          icon={CircleDollarSign}
          variant={contributionCollectionRate >= 80 ? "success" : contributionCollectionRate >= 50 ? "warn" : "danger"}
        />
        <StatCard
          label="Total Photos"
          value={`${totalPhotos}`}
          sublabel="Event documentation"
          icon={Camera}
        />
      </div>

      {/* Contribution Financials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Contribution Summary
          </CardTitle>
          <CardDescription>Event-related charges and payments for the semester</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Charged</p>
              <p className="text-2xl font-bold">₱{stats.eventsCharged.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Collected</p>
              <p className="text-2xl font-bold text-emerald-600">₱{stats.eventsPaid.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outstanding</p>
              <p className="text-2xl font-bold text-amber-600">₱{(stats.eventsCharged - stats.eventsPaid).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events Overview</CardTitle>
          <CardDescription>{events.length} event{events.length !== 1 ? "s" : ""} this semester</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-center font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Rating</th>
                  <th className="px-3 py-2 text-right font-medium">Photos</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No events recorded yet.</td></tr>
                )}
                {events.map(event => {
                  const eventDate = event.starts_at
                    ? new Date(event.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—";

                  return (
                    <tr key={event.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <div className="font-medium">{event.title}</div>
                        {event.location && (
                          <div className="text-xs text-muted-foreground">{event.location}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{eventDate}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                          event.is_competition
                            ? "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                            : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        }`}>
                          {event.is_competition ? "Competition" : "Event"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {event.average_rating !== null ? (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            {event.average_rating.toFixed(1)}
                            <span className="text-muted-foreground text-xs">({event.rating_count})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {event.photo_count > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                            {event.photo_count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Committee Section (if officer is also a committee head) */}
      {committeeData && (
        <div className="border-t pt-8 print:pt-6">
          <CommitteeReportView
            committeeData={committeeData}
            committeeFinances={committeeFinances}
            currentDate={currentDate}
          />
        </div>
      )}
    </div>
  );
}
