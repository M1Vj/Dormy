import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getCommittees } from "@/app/actions/committees";
import { CreateCommitteeSlot } from "@/components/admin/committees/create-committee-slot";
import { CommitteeCardSlot } from "@/components/admin/committees/committee-card-slot";
import { getActiveDormId } from "@/lib/dorms";
import { getActiveRole } from "@/lib/roles-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function CommitteesPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dormId = await getActiveDormId();
  if (!dormId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No active dorm selected.
      </div>
    );
  }

  const cookieStore = await cookies();
  const occupantModeCookie = cookieStore.get("dormy_occupant_mode")?.value ?? "0";
  const isOccupantMode = occupantModeCookie === "1";

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const canCreate = Boolean(
    !isOccupantMode &&
    membership && new Set(["admin", "adviser", "student_assistant"]).has(membership.role)
  );

  const { data: committees, error } = await getCommittees(dormId);
  const activeRole = await getActiveRole();
  const rolePrefix =
    activeRole === "admin"
      ? "/admin/committees"
      : activeRole === "student_assistant"
        ? "/student_assistant/committees"
        : "/adviser/committees";

  if (error) {
    return <div className="p-6 text-destructive">Error loading committees: {error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Committees</h1>
          <p className="text-sm text-muted-foreground">
            Manage student committees, their members, and finances.
          </p>
        </div>
        {canCreate ? <CreateCommitteeSlot dormId={dormId} /> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {committees?.map((committee) => (
          <CommitteeCardSlot
            key={committee.id}
            committee={committee}
            canManage={canCreate}
            detailHrefPrefix={rolePrefix}
          />
        ))}
        {committees?.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed py-12 text-center text-muted-foreground">
            No committees found. Create one to get started.
          </div>
        ) : null}
      </div>
    </div>
  );
}
