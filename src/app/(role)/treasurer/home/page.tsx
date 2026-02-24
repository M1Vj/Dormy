import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Bell, CalendarDays, ClipboardList, ReceiptText, Wallet } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getEventsOverview } from "@/app/actions/events";
import { getDormFinanceOverview } from "@/app/actions/finance";
import { getDashboardStats } from "@/app/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function TreasurerHomePage() {
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
    memberships?.find((membership) => membership.dorm_id === activeDormId && membership.role === "treasurer") ??
    memberships?.find((membership) => membership.role === "treasurer") ??
    null;

  if (!resolvedMembership?.dorm_id) {
    redirect("/join");
  }

  const dormId = resolvedMembership.dorm_id;

  const [{ data: dorm }, semester, { announcements }, events, financeOverview, statsResult] = await Promise.all([
    supabase.from("dorms").select("name, treasurer_maintenance_access").eq("id", dormId).maybeSingle(),
    getActiveSemester(dormId, supabase),
    getDormAnnouncements(dormId, { limit: 4 }),
    getEventsOverview(dormId),
    getDormFinanceOverview(dormId),
    getDashboardStats(dormId),
  ]);

  const showTreasurerMaintenance = dorm?.treasurer_maintenance_access === true;

  if ("error" in financeOverview) {
    return <div className="p-6 text-sm text-destructive">Failed to load finance overview: {financeOverview.error}</div>;
  }

  if ("error" in statsResult) {
    return <div className="p-6 text-sm text-destructive">Failed to load dashboard stats: {statsResult.error}</div>;
  }

  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= new Date() : false))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Treasurer Home</h1>
        <p className="text-sm text-muted-foreground">
          {dorm?.name ?? "Dorm"}
          {semester ? ` · ${semester.label}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contributions Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">{formatPesos(financeOverview.contributions.collected)}</div>
            <p className="text-xs text-muted-foreground">Dorm-level collection total</p>
          </CardContent>
        </Card>

        {showTreasurerMaintenance ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Maintenance Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-emerald-600">{formatPesos(financeOverview.maintenance_fee.collected)}</div>
              <p className="text-xs text-muted-foreground">Dorm maintenance cash-in</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{formatPesos(financeOverview.totals.outstanding)}</div>
            <p className="text-xs text-muted-foreground">Remaining receivables</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash on Hand</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPesos(statsResult.cashOnHand)}</div>
            <p className="text-xs text-muted-foreground">All-time paid less approved expenses</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Upcoming Events
            </CardTitle>
            <CardDescription>Events tied to contribution flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingEvents.length ? (
              upcomingEvents.map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.starts_at ? format(new Date(event.starts_at), "MMM d, yyyy h:mm a") : "Date TBD"}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/treasurer/events">Open events</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Announcements
            </CardTitle>
            <CardDescription>Most recent dorm notices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length ? (
              announcements.map((announcement) => (
                <div key={announcement.id} className={`rounded-md border p-3 ${!announcement.dorm_id ? "border-l-4 border-l-teal-500 bg-teal-50/30 dark:bg-teal-950/10" : ""}`}>
                  <div className="flex items-center gap-2">
                    {!announcement.dorm_id && <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-900 dark:text-teal-300">Admin</span>}
                    <p className="text-sm font-medium">{announcement.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{announcement.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No announcements available.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/treasurer/home/announcements">View all announcements</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Quick Access
          </CardTitle>
          <CardDescription>Treasurer financial operations.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/treasurer/finance/events">
              <CalendarDays className="mr-2 h-4 w-4" />
              Contributions
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/treasurer/finance/contribution-expenses">
              <ReceiptText className="mr-2 h-4 w-4" />
              Contribution Expenses
            </Link>
          </Button>
          {showTreasurerMaintenance ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/treasurer/finance/maintenance">
                <Wallet className="mr-2 h-4 w-4" />
                Maintenance
              </Link>
            </Button>
          ) : null}
          {showTreasurerMaintenance ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/treasurer/finance/expenses?category=maintenance_fee">Maintenance Expenses</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href="/treasurer/reporting">Reporting</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
