import { redirect } from "next/navigation";
import { format } from "date-fns";

import { getCommittee, getCommitteeFinanceSummary } from "@/app/actions/committees";
import { getCommitteeAnnouncements } from "@/app/actions/announcements";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getRoleLabel(role: string) {
  if (role === "co-head") return "Co-head";
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

export default async function OccupantCommitteeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.id) {
    redirect("/join");
  }

  const committeeResult = await getCommittee(id);
  if (committeeResult.error || !committeeResult.data || committeeResult.data.dorm_id !== dormId) {
    return <div className="p-6 text-sm text-destructive">Committee not found.</div>;
  }

  const committee = committeeResult.data;
  const myRole = committee.members.find((member) => member.user_id === user.id)?.role ?? null;
  if (!myRole) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You can only view committees where you are a member.
      </div>
    );
  }

  const [{ announcements }, financeSummaryResult] = await Promise.all([
    getCommitteeAnnouncements(dormId, committee.id, { limit: 10 }),
    getCommitteeFinanceSummary(committee.id),
  ]);

  const financeSummary = financeSummaryResult.data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{committee.name}</h1>
          <Badge variant="secondary">{getRoleLabel(myRole)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{committee.description || "No description provided."}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Committee roster</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {committee.members.length ? (
              committee.members.map((member) => {
                const name = member.display_name ?? "Unknown member";
                return (
                  <div key={member.user_id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm font-medium">{name}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {getRoleLabel(member.role)}
                    </Badge>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No members assigned yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>Recent committee updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length ? (
              announcements.map((announcement) => (
                <div key={announcement.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{announcement.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {announcement.starts_at
                      ? format(new Date(announcement.starts_at), "MMM d, yyyy h:mm a")
                      : "Published"}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm">{announcement.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No announcements posted yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Committee Finance Summary</CardTitle>
          <CardDescription>Event income totals for this committee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {financeSummary.length ? (
            financeSummary.map((row) => (
              <div key={row.event_id} className="flex items-start justify-between rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{row.event_title}</p>
                  <p className="text-xs text-muted-foreground">
                    Charged ₱{row.charged_pesos.toFixed(2)} · Collected ₱{row.collected_pesos.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="font-semibold">₱{row.balance_pesos.toFixed(2)}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No finance records available yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
