import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarClock, ShieldCheck, UserPlus, Users } from "lucide-react";

import { getDormAnnouncements } from "@/app/actions/announcements";
import { getDormApplicationsForActiveDorm } from "@/app/actions/join";
import { createOccupant } from "@/app/actions/occupants";
import { getDashboardStats } from "@/app/actions/stats";
import { CreateOccupantForm } from "@/components/admin/occupants/create-occupant-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
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

  const dormId = await getActiveDormId();
  if (!dormId) {
    redirect("/join");
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "admin") {
    redirect("/occupant/home");
  }

  const [{ data: dorm }, semester, stats, applications, { announcements }] = await Promise.all([
    supabase.from("dorms").select("name, capacity").eq("id", dormId).maybeSingle(),
    getActiveSemester(dormId, supabase),
    getDashboardStats(dormId),
    getDormApplicationsForActiveDorm(dormId, "pending"),
    getDormAnnouncements(dormId, { limit: 3 }),
  ]);

  const createOccupantAction = createOccupant.bind(null, dormId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Home</h1>
        <p className="text-sm text-muted-foreground">
          {dorm?.name ?? "Dorm"}
          {semester ? ` · ${semester.label}` : ""}
        </p>
      </div>

      <Card className="border-l-4 border-l-indigo-500">
        <CardHeader>
          <CardTitle className="text-base">Administrative Control</CardTitle>
          <CardDescription>
            Admin access is limited to dorm setup, occupant management, role delegation to adviser/SA, clearance, and semester controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Active Occupants</p>
            <p className="mt-1 text-2xl font-semibold">
              {"error" in stats ? "--" : stats.totalOccupants}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Pending Applications</p>
            <p className="mt-1 text-2xl font-semibold">{applications.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Cleared Occupants</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">
              {"error" in stats ? "--" : stats.occupantsCleared}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Dorm Capacity</p>
            <p className="mt-1 text-2xl font-semibold">{dorm?.capacity ?? "--"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Occupants and Staff Delegation
            </CardTitle>
            <CardDescription>
              Add or update occupants, and assign non-admin staff roles (adviser, assistant adviser, student assistant, and other non-admin roles).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="default" size="sm">
              <Link href="/admin/occupants">Manage occupants</Link>
            </Button>
            <CreateOccupantForm action={createOccupantAction} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Clearance and Semester
            </CardTitle>
            <CardDescription>Track clearance status and manage semester dates.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/clearance">Open clearance</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/terms">Semester management</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Dormitory Setup
            </CardTitle>
            <CardDescription>Create and maintain dormitory records.</CardDescription>
          </CardHeader>
          <CardContent>
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
            <CardDescription>Latest dorm-wide posts.</CardDescription>
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
              <Link href="/admin/home/announcements">
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
