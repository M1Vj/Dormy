import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Bell, CalendarDays, ClipboardList, Sparkles, Wallet } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getEventsOverview } from "@/app/actions/events";
import { getDashboardStats } from "@/app/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OfficerHomePage() {
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
    memberships?.find((membership) => membership.dorm_id === activeDormId && membership.role === "officer") ??
    memberships?.find((membership) => membership.role === "officer") ??
    null;

  if (!resolvedMembership?.dorm_id) {
    redirect("/join");
  }

  const dormId = resolvedMembership.dorm_id;

  const [{ data: dorm }, semester, { announcements }, events, statsResult] = await Promise.all([
    supabase.from("dorms").select("name").eq("id", dormId).maybeSingle(),
    getActiveSemester(dormId, supabase),
    getDormAnnouncements(dormId, { limit: 4 }),
    getEventsOverview(dormId),
    getDashboardStats(dormId),
  ]);

  if ("error" in statsResult) {
    return <div className="p-6 text-sm text-destructive">Failed to load dashboard stats: {statsResult.error}</div>;
  }

  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= new Date() : false))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Officer Home</h1>
        <p className="text-sm text-muted-foreground">
          {dorm?.name ?? "Dorm"}
          {semester ? ` · ${semester.label}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{upcomingEvents.length}</div>
            <p className="text-xs text-muted-foreground">Planned officer-led activities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{statsResult.totalEvents}</div>
            <p className="text-xs text-muted-foreground">Events this semester</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Collectibles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{statsResult.totalCollectibles.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Dorm-level outstanding amount</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{announcements.length}</div>
            <p className="text-xs text-muted-foreground">Latest dorm updates</p>
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
            <CardDescription>Nearest events in your active dorm.</CardDescription>
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
              <Link href="/officer/events">Open events</Link>
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
                <div key={announcement.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{announcement.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{announcement.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No announcements available.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/officer/home/announcements">View all announcements</Link>
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
          <CardDescription>Officer operational modules.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/officer/events">
              <CalendarDays className="mr-2 h-4 w-4" />
              Events
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/officer/finance/expenses">
              <Wallet className="mr-2 h-4 w-4" />
              Expenses
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/officer/reporting">Reporting</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/officer/cleaning">Cleaning</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/officer/ai">
              <Sparkles className="mr-2 h-4 w-4" />
              AI Workspace
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
