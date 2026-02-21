import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesAllDorms } from "@/lib/access";

const ALLOWED_ROLES = new Set(["adviser", "admin"]);

export default async function AdviserLayout({
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

  const memberships = await getUserRolesAllDorms(supabase, user.id);
  const hasAccess = memberships.some((m) => ALLOWED_ROLES.has(m.role));

  if (!hasAccess) {
    redirect("/settings");
  }

  return <>{children}</>;
}
