import { redirect } from "next/navigation";

import {
  getDormDirectory,
  getMyDormApplications,
  getMyDormInvites,
} from "@/app/actions/join";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JoinDorm } from "@/components/join/join-dorm";

export default async function JoinPage() {
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

  const { data: existingMembership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (existingMembership?.length) {
    redirect("/occupant/home");
  }

  const [dorms, applications, invites] = await Promise.all([
    getDormDirectory(),
    getMyDormApplications(),
    getMyDormInvites(),
  ]);

  return <JoinDorm dorms={dorms} applications={applications} invites={invites} />;
}

