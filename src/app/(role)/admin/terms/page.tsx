import { redirect } from "next/navigation";

import { getSemesterWorkspace } from "@/app/actions/semesters";
import { SemesterManagement } from "@/components/admin/semester-management";
import { getActiveDormId } from "@/lib/dorms";
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

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const workspace = await getSemesterWorkspace(activeDormId);
  if ("error" in workspace) {
    return <div className="p-6 text-sm text-muted-foreground">{workspace.error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Semester management</h1>
        <p className="text-sm text-muted-foreground">
          Group dorm workflows by semester, archive history, and manage new-school-year turnover.
        </p>
      </div>

      <SemesterManagement
        dormId={activeDormId}
        activeSemester={workspace.activeSemester}
        semesters={workspace.semesters}
        activeOccupants={workspace.activeOccupants}
        outstandingMoney={workspace.outstandingMoney}
      />
    </div>
  );
}
