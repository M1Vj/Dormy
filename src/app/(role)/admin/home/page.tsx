import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ShieldCheck, UserPlus } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getGlobalAdminStats } from "@/app/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminHomePage() {
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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (!membership?.length) {
    redirect("/occupant/home");
  }

  const [stats, { announcements }] = await Promise.all([
    getGlobalAdminStats(),
    getDormAnnouncements(null, { limit: 5 }), // Fetch global announcements (dormId is null)
  ]);

  const totalOccupants = "error" in stats ? 0 : stats.totalOccupants;
  const totalApplications = "error" in stats ? 0 : stats.totalApplications;
  const totalCapacity = "error" in stats ? 0 : stats.totalCapacity;
  const totalCleared = "error" in stats ? 0 : stats.totalCleared;
  const totalDorms = "error" in stats ? 0 : stats.totalDorms;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">System Overview</h1>
        <p className="text-sm text-muted-foreground">
          Global statistics across all managed dormitories
        </p>
      </div>

      <Card className="border-l-4 border-l-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardHeader>
          <CardTitle className="text-base">Global Statistics</CardTitle>
          <CardDescription>
            Aggregated data across all dormitories in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-md border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Occupants</p>
            <p className="mt-1 text-2xl font-bold">{totalOccupants}</p>
          </div>
          <div className="rounded-md border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Apps</p>
            <p className="mt-1 text-2xl font-bold">{totalApplications}</p>
          </div>
          <div className="rounded-md border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cleared Status</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{totalCleared}</p>
          </div>
          <div className="rounded-md border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Capacity</p>
            <p className="mt-1 text-2xl font-bold">{totalCapacity}</p>
          </div>
          <div className="rounded-md border bg-card p-3 shadow-sm transition-all hover:shadow-md">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Managed Dorms</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{totalDorms}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Global Management
            </CardTitle>
            <CardDescription>Manage system-wide settings and semesters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/terms">Semester management</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/dorms">Manage dormitories</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Recent Announcements
            </CardTitle>
            <CardDescription>Latest global announcements.</CardDescription>
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
              <p className="text-sm text-muted-foreground">No announcements posted yet.</p>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/announcements">
                <UserPlus className="mr-2 h-4 w-4" />
                Manage announcements
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
