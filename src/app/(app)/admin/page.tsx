import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !new Set(["admin", "adviser"]).has(membership.role)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User management</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/admin/users">Manage users</Link>
          </Button>
        </CardContent>
      </Card>
      {membership.role === "admin" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dorms</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/dorms">Manage dorms</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {membership.role === "admin" ? (
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
      {membership.role === "admin" ? (
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
