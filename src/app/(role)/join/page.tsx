import { redirect } from "next/navigation";

import {
  getDormDirectory,
  getMyDormApplications,
  getMyDormInvites,
} from "@/app/actions/join";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JoinDorm } from "@/components/join/join-dorm";
import { getActiveRole } from "@/lib/roles-server";

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

  const role = await getActiveRole();
  if (role) {
    redirect(`/${role}/home`);
  }

  const [dorms, applications, invites] = await Promise.all([
    getDormDirectory(),
    getMyDormApplications(),
    getMyDormInvites(),
  ]);

  return <JoinDorm dorms={dorms} applications={applications} invites={invites} />;
}

