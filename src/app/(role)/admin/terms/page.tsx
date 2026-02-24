import { redirect } from "next/navigation";

import { getSemesterWorkspace } from "@/app/actions/semesters";
import { SemesterManagement } from "@/components/admin/semester-management";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminTermsPage() {
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

  // Get the admin's first managed dorm for semester scoping
  const { data: adminMemberships } = await supabase
    .from("dorm_memberships")
    .select("dorm_id, dorms(name)")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  const firstMembership = adminMemberships?.[0];
  if (!firstMembership?.dorm_id) {
    return <div className="p-6 text-sm text-muted-foreground">No managed dormitory found.</div>;
  }

  const dormId = firstMembership.dorm_id;
  const dormName = (firstMembership.dorms as any)?.name ?? "Dormitory";

  const workspace = await getSemesterWorkspace(dormId);
  if ("error" in workspace) {
    return <div className="p-6 text-sm text-muted-foreground">{workspace.error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Semester management</h1>
        <p className="text-sm text-muted-foreground">
          Manage semesters for <span className="font-medium">{dormName}</span>. Semesters activate automatically based on their dates.
        </p>
      </div>

      <SemesterManagement
        dormId={dormId}
        activeSemester={workspace.activeSemester}
        semesters={workspace.semesters}
        activeOccupants={workspace.activeOccupants}
        outstandingMoney={workspace.outstandingMoney}
        hideFinance
      />
    </div>
  );
}
