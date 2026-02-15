import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AuditEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dorm_id?: string }>;
}) {
  const { id } = await params;
  const { dorm_id: dormId } = await searchParams;

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

  if (!dormId) {
    notFound();
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to this audit event.</div>;
  }

  const { data: event } = await supabase
    .from("audit_events")
    .select(
      "id, action, entity_type, entity_id, metadata, actor_user_id, created_at, actor:profiles!audit_events_actor_user_id_fkey(display_name)"
    )
    .eq("id", id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const actor = Array.isArray(event.actor) ? event.actor[0] : event.actor;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Event Detail</h1>
        <Button asChild variant="outline">
          <Link href={`/admin/audit?dorm_id=${dormId}`}>Back to audit log</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Timestamp:</span>{" "}
            {new Date(event.created_at).toLocaleString()}
          </div>
          <div>
            <span className="text-muted-foreground">Actor:</span>{" "}
            {actor?.display_name ?? event.actor_user_id ?? "System"}
          </div>
          <div>
            <span className="text-muted-foreground">Action:</span> {event.action}
          </div>
          <div>
            <span className="text-muted-foreground">Entity type:</span> {event.entity_type}
          </div>
          <div>
            <span className="text-muted-foreground">Entity id:</span> {event.entity_id ?? "-"}
          </div>
          <div>
            <p className="text-muted-foreground">Metadata payload</p>
            <pre className="mt-2 overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
