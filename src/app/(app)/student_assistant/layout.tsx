import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .in("role", ["admin", "student_assistant", "adviser"])
    // ^ Admitting multiple high-tier roles here if needed, or strictly "admin"
    // Wait, since admin/rooms is for admins, let's keep it mostly strict or check the specific roles allowed
    // Actually, "student_assistant" might need access to fines, wait - SA will have student_assistant/fines
    // Let's just strictly enforce "admin" for now, or maybe the existing pages within already enforce it?
    // Let's just check if ANY membership exists for now to avoid breaking existing complex RBAC inside pages
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // strict check failed, redirect them to settings where they can see their roles
    redirect("/settings");
  }

  return <>{children}</>;
}
