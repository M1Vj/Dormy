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

  // Verify the user is an admin
  const { data: adminMemberships } = await supabase
    .from("dorm_memberships")
    .select("dorm_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);

  if (!adminMemberships?.length) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have permission to manage global semesters.</div>;
  }

  // Pass null for global semester management
  const workspace = await getSemesterWorkspace(null);
  if ("error" in workspace) {
    return <div className="p-6 text-sm text-muted-foreground">{workspace.error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System-wide Semesters</h1>
        <p className="text-sm text-muted-foreground">
          Manage global semesters applicable to all dormitories. Semesters activate automatically based on their dates.
        </p>
      </div>

      <SemesterManagement
        dormId={null}
        activeSemester={workspace.activeSemester}
        semesters={workspace.semesters}
        activeOccupants={workspace.activeOccupants}
        outstandingMoney={workspace.outstandingMoney}
        hideFinance
      />
    </div>
  );
}
