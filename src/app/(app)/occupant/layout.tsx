import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesAllDorms } from "@/lib/access";

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

  // Any dorm membership grants access to occupant pages
  const memberships = await getUserRolesAllDorms(supabase, user.id);
  if (memberships.length === 0) {
    redirect("/settings");
  }

  return <>{children}</>;
}
