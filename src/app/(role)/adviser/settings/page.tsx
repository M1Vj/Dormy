import { AccountSettings } from "@/components/account/account-settings";
import { TreasurerMaintenanceToggle } from "@/components/admin/treasurer-maintenance-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const dormId = await getActiveDormId();
  const supabase = await createSupabaseServerClient();

  let canManageDormFinance = false;
  let treasurerMaintenanceAccess = false;

  if (dormId && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const [{ data: membership }, { data: dorm }] = await Promise.all([
        supabase
          .from("dorm_memberships")
          .select("role")
          .eq("dorm_id", dormId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("dorms")
          .select("treasurer_maintenance_access")
          .eq("id", dormId)
          .maybeSingle(),
      ]);

      canManageDormFinance = Boolean(
        membership?.role && new Set(["admin", "adviser"]).has(membership.role)
      );
      treasurerMaintenanceAccess = Boolean(dorm?.treasurer_maintenance_access);
    }
  }

  return (
    <div className="space-y-6">
      <AccountSettings />

      {dormId && canManageDormFinance ? (
        <Card>
          <CardHeader>
            <CardTitle>Finance Role Access</CardTitle>
            <CardDescription>
              Control whether treasurer-level users can access maintenance finance workflows. Contribution access remains independent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TreasurerMaintenanceToggle dormId={dormId} initialState={treasurerMaintenanceAccess} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
