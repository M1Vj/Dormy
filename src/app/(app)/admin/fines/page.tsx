import { redirect } from "next/navigation";

import { getFineRules, getFines } from "@/app/actions/fines";
import { getOccupants } from "@/app/actions/occupants";
import { FinesLedger } from "@/components/admin/fines/fines-ledger";
import { RulesTable } from "@/components/admin/fines/rules-table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getActiveDormId } from "@/lib/dorms";
import { createClient } from "@/lib/supabase/server";

export default async function AdminFinesPage() {
  const supabase = await createClient();
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

  if (!activeMembership || activeMembership.role !== "admin") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const [rules, fines, occupants] = await Promise.all([
    getFineRules(activeMembership.dorm_id),
    getFines(activeMembership.dorm_id),
    getOccupants(activeMembership.dorm_id, { status: "active" }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fines</h1>
        <p className="text-sm text-muted-foreground">
          Track violations, issue fines, and maintain rules.
        </p>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <FinesLedger
            dormId={activeMembership.dorm_id}
            fines={fines}
            rules={rules}
            occupants={occupants}
          />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTable dormId={activeMembership.dorm_id} rules={rules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
