import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserRolesForDorm } from "@/lib/access";
import { getActiveDormId } from "@/lib/dorms";

const ALLOWED_ROLES = new Set(["student_assistant"]);

export default async function StudentAssistantLayout({
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
