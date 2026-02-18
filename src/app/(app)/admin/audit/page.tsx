import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuditActors, getAuditEvents } from "@/lib/audit/log";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Search = {
  dorm_id?: string;
  actor_user_id?: string;
  entity_type?: string;
  start?: string;
  end?: string;
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;

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

  const activeDormId = await getActiveDormId();
  const dormOptions = await getUserDorms();
  const requestedDormId = params.dorm_id;

  const selectedDormId =
    dormOptions.find((dorm) => dorm.id === requestedDormId)?.id ??
    dormOptions.find((dorm) => dorm.id === activeDormId)?.id ??
    dormOptions[0]?.id ??
    null;

  if (!selectedDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No dorm membership found.</div>;
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", selectedDormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to audit logs.</div>;
  }

  const [actors, events] = await Promise.all([
    getAuditActors(selectedDormId),
    getAuditEvents(selectedDormId, {
      actor_user_id: params.actor_user_id ?? null,
      entity_type: params.entity_type ?? null,
      start: params.start ?? null,
      end: params.end ?? null,
    }),
  ]);

  const entityTypes = [...new Set(events.map((event) => event.entity_type))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Immutable trail of sensitive operations across money, roles, evaluations, and scores.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5" method="get">
            <div className="space-y-1">
              <label htmlFor="dorm_id" className="text-xs text-muted-foreground">Dorm</label>
              <select
                id="dorm_id"
                name="dorm_id"
                defaultValue={selectedDormId}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {dormOptions.map((dorm) => (
                  <option key={dorm.id} value={dorm.id}>
                    {dorm.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="actor_user_id" className="text-xs text-muted-foreground">Actor</label>
              <select
                id="actor_user_id"
                name="actor_user_id"
                defaultValue={params.actor_user_id ?? ""}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">All actors</option>
                {actors.map((actor) => (
                  <option key={actor.user_id} value={actor.user_id}>
                    {actor.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="entity_type" className="text-xs text-muted-foreground">Entity type</label>
              <select
                id="entity_type"
                name="entity_type"
                defaultValue={params.entity_type ?? ""}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">All entities</option>
                {entityTypes.map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {entityType}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="start" className="text-xs text-muted-foreground">Start date</label>
              <input
                id="start"
                name="start"
                type="date"
                defaultValue={params.start ?? ""}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="end" className="text-xs text-muted-foreground">End date</label>
              <input
                id="end"
                name="end"
                type="date"
                defaultValue={params.end ?? ""}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </div>

            <div className="md:col-span-5 flex items-center gap-2">
              <Button type="submit" size="sm">Apply filters</Button>
              <Button asChild type="button" size="sm" variant="ghost">
                <Link href="/admin/audit">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Events ({events.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Timestamp</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Metadata</th>
                  <th className="px-3 py-2 font-medium text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(event.actor as { display_name: string | null } | null)?.display_name ?? event.actor_user_id ?? "System"}
                    </td>
                    <td className="px-3 py-2">{event.action}</td>
                    <td className="px-3 py-2">
                      <div>{event.entity_type}</div>
                      <div className="text-xs text-muted-foreground break-all">{event.entity_id ?? "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {JSON.stringify(event.metadata).slice(0, 160)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/audit/${event.id}?dorm_id=${selectedDormId}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
                {!events.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No audit events matched your filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
