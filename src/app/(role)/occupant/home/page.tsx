import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Bell, CalendarDays, ClipboardList, Users, Wallet } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getEventsOverview } from "@/app/actions/events";
import { getDormFinanceOverview } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type RoomRef = {
  id?: string | null;
  code?: string | null;
};

type AssignmentRef = {
  room?: RoomRef | RoomRef[] | null;
  end_date?: string | null;
};

const asFirst = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

export default async function OccupantHomePage() {
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

  const [{ data: dorm }, semester, { announcements }, events, cleaningSnapshot, financeOverview, { data: occupant }, { data: committeeMemberships }] =
    await Promise.all([
      supabase.from("dorms").select("name").eq("id", dormId).maybeSingle(),
      getActiveSemester(dormId, supabase),
      getDormAnnouncements(dormId, { limit: 4 }),
      getEventsOverview(dormId),
      getCleaningSnapshot(),
      getDormFinanceOverview(dormId),
      supabase
        .from("occupants")
        .select("id, room_assignments(end_date, room:rooms(id, code))")
        .eq("dorm_id", dormId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("committee_members")
        .select("role, committee:committees(id, name)")
        .eq("user_id", user.id),
    ]);

  const upcomingEvents = events
    .filter((event) => (event.starts_at ? new Date(event.starts_at) >= new Date() : false))
    .slice(0, 4);

  const finance = "error" in financeOverview
    ? null
    : financeOverview;

  const currentAssignment = asFirst(
    (Array.isArray(occupant?.room_assignments)
      ? occupant.room_assignments
      : occupant?.room_assignments
        ? [occupant.room_assignments]
        : []
    ).filter((assignment: AssignmentRef) => !assignment.end_date)
  );

  const currentRoom = asFirst(asFirst(currentAssignment?.room ?? null));

  const cleaningPlanForRoom = (() => {
    if (!currentRoom?.id) return null;
    if ("error" in cleaningSnapshot) return null;

    const plan = cleaningSnapshot.room_plans.find((row) => row.room_id === currentRoom.id);
    if (!plan) return null;

    return {
      area: plan.area_name,
      week_start: cleaningSnapshot.week?.week_start ?? cleaningSnapshot.selected_week_start,
    };
  })();

  const viewerCommittees = (committeeMemberships ?? [])
    .map((row) => {
      const committee = Array.isArray(row.committee) ? row.committee[0] : row.committee;
      if (!committee?.id) return null;
      return {
        id: committee.id,
        name: committee.name ?? "Committee",
        role: row.role,
      };
    })
    .filter((value): value is { id: string; name: string; role: string } => Boolean(value));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Occupant Home</h1>
        <p className="text-sm text-muted-foreground">
          {dorm?.name ?? "Dorm"}
          {semester ? ` · ${semester.label}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Dorm Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">
              {finance ? formatPesos(finance.totals.outstanding) : "--"}
            </div>
            <p className="text-xs text-muted-foreground">Dorm-level finance total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{upcomingEvents.length}</div>
            <p className="text-xs text-muted-foreground">Scheduled events ahead</p>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cleaning Duty</CardTitle>
          </CardHeader>
          <CardContent>
            {cleaningPlanForRoom ? (
              <>
                <div className="text-sm font-semibold">{cleaningPlanForRoom.area}</div>
                <p className="text-xs text-muted-foreground">Week of {format(new Date(cleaningPlanForRoom.week_start), "MMM d")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No room assignment yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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
                <div key={announcement.id} className={`rounded-md border p-3 ${!announcement.dorm_id ? "border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10" : ""}`}>
                  <div className="flex items-center gap-2">
                    {!announcement.dorm_id && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Admin</span>}
                    <p className="text-sm font-medium">{announcement.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{announcement.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No announcements available.</p>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/occupant/home/announcements">View all announcements</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Upcoming Events
            </CardTitle>
            <CardDescription>Events in your active dorm.</CardDescription>
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
              <Link href="/occupant/events">Open events</Link>
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
          <CardDescription>Resident-facing features only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/occupant/payments">
              <Wallet className="mr-2 h-4 w-4" />
              Finance Totals
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/occupant/fines/reports">Report Fine</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/occupant/cleaning">Cleaning</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/occupant/events">Events</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/occupant/committees">
              <Users className="mr-2 h-4 w-4" />
              {viewerCommittees.length ? "My Committee" : "Committees"}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
