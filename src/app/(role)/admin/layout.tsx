import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesForDorm } from "@/lib/access";
import { getActiveDormId } from "@/lib/dorms";

const ALLOWED_ROLES = new Set(["admin"]);

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

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    redirect("/join");
  }

  const roles = await getUserRolesForDorm(supabase, user.id, activeDormId);
  const hasAccess = roles.includes("admin");

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}
