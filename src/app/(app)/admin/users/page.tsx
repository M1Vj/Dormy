import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./create-user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const { data: dorms } = await supabase
    .from("dorms")
    .select("id, name")
    .eq("id", membership.dorm_id);

  const { data: members } = await supabase
    .from("dorm_memberships")
    .select("user_id, role, profiles(display_name)")
    .eq("dorm_id", membership.dorm_id)
    .order("role", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">User management</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts and assign roles for this dorm.
          </p>
        </div>
        <CreateUserForm dorms={dorms ?? []} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dorm members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
