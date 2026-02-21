import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId } from "@/lib/dorms";
import { createOccupant } from "@/app/actions/occupants";
import { CreateOccupantForm } from "@/components/admin/occupants/create-occupant-form";
import { TreasurerMaintenanceToggle } from "@/components/admin/treasurer-maintenance-toggle";

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "adviser"]).has(r));

  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const activeDormId = await getActiveDormId();
  const createOccupantAction = activeDormId
    ? createOccupant.bind(null, activeDormId)
    : undefined;

  let dormAttributes: Record<string, unknown> = {};
  if (activeDormId) {
    const { data } = await supabase.from("dorms").select("treasurer_maintenance_access").eq("id", activeDormId).single();
    dormAttributes = data || {};
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/admin/occupants">Manage occupants</Link>
            </Button>
            {createOccupantAction && (
              <CreateOccupantForm action={createOccupantAction} />
            )}
          </div>
        </CardContent>
      </Card>
      {roles.includes("admin") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dorms</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/admin/dorms">Manage dorms</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/dorms/add">Add new dorm</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {roles.includes("admin") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit logs</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/audit">Open audit trail</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {activeDormId && hasAccess ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dorm settings</CardTitle>
          </CardHeader>
          <CardContent>
            <TreasurerMaintenanceToggle
              dormId={activeDormId}
              initialState={dormAttributes?.treasurer_maintenance_access === true}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semesters and turnover</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Group events, fines, cleaning, and evaluations by semester while keeping occupants and money persistent.
          </p>
          <Button asChild>
            <Link href="/admin/terms">Open semester management</Link>
          </Button>
        </CardContent>
      </Card>
      {roles.includes("admin") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overrides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Handle exceptional corrections across occupants, fines, payments, cleaning, events, and evaluation with required reasons.
            </p>
            <Button asChild>
              <Link href="/admin/overrides">Open override center</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
