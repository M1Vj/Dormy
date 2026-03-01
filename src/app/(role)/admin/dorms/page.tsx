import Link from "next/link";
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
                  <th className="px-3 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {dorms.map((dorm) => (
                  <tr key={dorm.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/dorms/${dorm.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {dorm.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dorm.slug}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${dorm.sex === "male" ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : dorm.sex === "female" ? "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300"
                            : "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300"
                        }`}>
                        {dorm.sex === "male" ? "Male only" : dorm.sex === "female" ? "Female only" : "Coed"}
                      </span>
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
