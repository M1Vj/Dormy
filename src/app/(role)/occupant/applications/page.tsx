import { redirect } from "next/navigation";

import { getDormApplicationsForActiveDorm } from "@/app/actions/join";
import { ApplicationsReview } from "@/components/applications/applications-review";
import type { DormApplicationRow } from "@/components/applications/applications-review";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/roles";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
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

  const dorms = await getUserDorms();
  if (dorms.length === 0) {
    redirect("/join");
  }

  const activeDormId = await getActiveDormId();
  const dormId =
    dorms.find((dorm) => dorm.id === activeDormId)?.id ?? dorms[0]?.id ?? null;

  if (!dormId) {
    redirect("/join");
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (membership?.role as AppRole) ?? null;
  if (!role || !new Set(["admin", "adviser", "student_assistant"]).has(role)) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const applications = await getDormApplicationsForActiveDorm(
    dormId,
    searchParams?.status ?? null
  );

  const dormName = dorms.find((dorm) => dorm.id === dormId)?.name ?? "Dorm";

  return (
    <ApplicationsReview
      dormName={dormName}
      currentRole={role}
      applications={applications as unknown as DormApplicationRow[]}
    />
  );
}
