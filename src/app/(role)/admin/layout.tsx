import { redirect } from "next/navigation";
import { getActiveDormId } from "@/lib/dorms";
import { getCachedRolesForDorm, getCachedUser } from "@/lib/auth-cache";

export default async function AdminLayout({
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
    redirect("/join");
  }

  const roles = await getCachedRolesForDorm(activeDormId);
  const hasAccess = roles.includes("admin");

  if (!hasAccess) {
    redirect("/");
  }

  return <>{children}</>;
}
