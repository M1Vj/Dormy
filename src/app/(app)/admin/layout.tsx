import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["admin", "adviser", "student_assistant", "treasurer", "officer"]);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <>{children}</>;

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
    .in("role", Array.from(ALLOWED_ROLES))
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // strict check failed, redirect them to settings where they can see their roles
    redirect("/settings");
  }

  return <>{children}</>;
}
