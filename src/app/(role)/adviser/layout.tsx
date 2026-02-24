import { redirect } from "next/navigation";
import { getActiveRole } from "@/lib/roles-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesForDorm } from "@/lib/access";
import { getActiveDormId } from "@/lib/dorms";

const ALLOWED_ROLES = new Set(["adviser", "assistant_adviser"]);

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

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    redirect("/");
  }

  const roles = await getUserRolesForDorm(supabase, user.id, activeDormId);
  const hasAccess = roles.some((r) => ALLOWED_ROLES.has(r));

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}
