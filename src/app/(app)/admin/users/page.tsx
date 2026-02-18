import { redirect } from "next/navigation";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./create-user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeDormId = await getActiveDormId();
  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id);

  const activeMembership =
    memberships?.find((membership) => membership.dorm_id === activeDormId) ??
    memberships?.[0];

  if (
    !activeMembership ||
    !new Set(["admin", "adviser"]).has(activeMembership.role)
  ) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const { data: dorms } = await supabase
    .from("dorms")
    .select("id, name")
    .eq("id", activeMembership.dorm_id);

  const { data: members } = await supabase
    .from("dorm_memberships")
    .select("user_id, role, profiles(display_name)")
    .eq("dorm_id", activeMembership.dorm_id)
    .order("role", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">User management</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts and assign roles for this dorm.
          </p>
        </div>
        <CreateUserForm
          dorms={dorms ?? []}
          provisionerRole={activeMembership.role as "admin" | "adviser"}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dorm members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {(members ?? []).map((member) => {
              const profile = Array.isArray(member.profiles)
                ? member.profiles[0]
                : member.profiles

              return (
                <div key={member.user_id} className="rounded-lg border p-3">
                  <p className="font-medium">{profile?.display_name ?? "Unassigned"}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {member.role.replace(/_/g, " ")}
                  </p>
                </div>
              )
            })}
            {!(members ?? []).length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No members yet.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((member) => {
                  const profile = Array.isArray(member.profiles)
                    ? member.profiles[0]
                    : member.profiles

                  return (
                    <tr key={member.user_id} className="border-b">
                      <td className="px-3 py-2">
                        {profile?.display_name ?? "Unassigned"}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {member.role.replace(/_/g, " ")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
