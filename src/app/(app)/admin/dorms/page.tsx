import { redirect } from "next/navigation";

import { getAllDorms } from "@/app/actions/dorm";
import { CreateDormDialog } from "./create-dorm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminDormsPage() {
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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!membership?.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const dorms = await getAllDorms();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dorms</h1>
          <p className="text-sm text-muted-foreground">
            Manage dorms and assign members.
          </p>
        </div>
        <CreateDormDialog />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All dorms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {dorms.map((dorm) => (
                  <tr key={dorm.id} className="border-b">
                    <td className="px-3 py-2">{dorm.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dorm.slug}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
