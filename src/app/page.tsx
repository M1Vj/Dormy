import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
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

  const cookieStore = await cookies();
  let targetRole = cookieStore.get("dormy_active_role")?.value;

  if (!targetRole) {
    const { data: memberships } = await supabase
      .from("dorm_memberships")
      .select("role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    targetRole = memberships?.role || "occupant";
  }

  redirect(`/${targetRole}/home`);
}
