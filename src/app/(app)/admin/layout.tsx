import { getActiveRole } from "@/lib/roles-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesAllDorms } from "@/lib/access";

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

  // Check across ALL dorms — the middleware and pages handle active-dorm scoping.
  // Never redirect to /join here — middleware already handles dorm_id cookie setup.
  const memberships = await getUserRolesAllDorms(supabase, user.id);
  const hasAccess = memberships.some((m) => ALLOWED_ROLES.has(m.role));

  if (!hasAccess) {
    const role = await getActiveRole() || "occupant";
    redirect(`/${role}/home`);
  }

  return <>{children}</>;
}
