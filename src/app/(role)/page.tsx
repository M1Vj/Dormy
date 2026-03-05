import { redirect } from "next/navigation";
import { getActiveRole } from "@/lib/roles-server";
import { getRoleRoute } from "@/lib/roles";

export default async function AppIndexPage() {
  const role = getRoleRoute(await getActiveRole() || "occupant");
  redirect(`/${role}/home`);
  return <div className="hidden" aria-hidden="true" />;
}
