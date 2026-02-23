import { redirect } from "next/navigation";
import { getActiveRole } from "@/lib/roles-server";

export default async function AppIndexPage() {
  const role = await getActiveRole() || "occupant";
  redirect(`/${role}/home`);
}
