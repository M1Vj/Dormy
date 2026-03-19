import { redirect } from "next/navigation";
import { getActiveDormId } from "@/lib/dorms";
import { getCachedRolesForDorm, getCachedUser } from "@/lib/auth-cache";

const ALLOWED_ROLES = new Set(["adviser", "assistant_adviser"]);

export default async function AdviserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    redirect("/");
  }

  const roles = await getCachedRolesForDorm(activeDormId);
  const hasAccess = roles.some((r) => ALLOWED_ROLES.has(r));

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}
