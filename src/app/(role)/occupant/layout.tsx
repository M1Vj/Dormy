import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesForDorm } from "@/lib/access";
import { getActiveDormId } from "@/lib/dorms";

export default async function OccupantLayout({
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
  const hasAccess = roles.includes("occupant");

  if (!hasAccess) {
    redirect("/"); // Middleware will handle redirecting to their actual home
  }

  return <>{children}</>;
}
