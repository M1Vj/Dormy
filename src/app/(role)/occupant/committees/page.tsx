import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { getCommittees } from "@/app/actions/committees";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatCommitteeRole(role: string) {
  if (role === "co-head") return "Co-head";
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

export default async function OccupantCommitteesPage() {
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

  const committeesResult = await getCommittees(dormId);
  if (committeesResult.error) {
    return <div className="p-6 text-sm text-destructive">Error loading committees: {committeesResult.error}</div>;
  }

  const myCommittees = (committeesResult.data ?? [])
    .map((committee) => {
      const myRole = committee.members.find((member) => member.user_id === user.id)?.role ?? null;
      if (!myRole) return null;
      return {
        ...committee,
        myRole,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Committee</h1>
        <p className="text-sm text-muted-foreground">
          Occupants can only view committees they are assigned to.
        </p>
      </div>

      {myCommittees.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {myCommittees.map((committee) => (
            <Link key={committee.id} href={`/occupant/committees/${committee.id}`} className="block">
              <Card className="h-full transition-colors hover:bg-muted/30">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-lg">{committee.name}</CardTitle>
                    <Badge variant="secondary">{formatCommitteeRole(committee.myRole)}</Badge>
                  </div>
                  <CardDescription>{committee.description || "No description provided."}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {committee.members.length} member{committee.members.length === 1 ? "" : "s"}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You are not assigned to any committee yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
