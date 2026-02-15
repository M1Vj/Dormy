import { redirect } from "next/navigation";

import { getFineRules, getFines } from "@/app/actions/fines";
import { getOccupants } from "@/app/actions/occupants";
import { FinesLedger } from "@/components/admin/fines/fines-ledger";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { RulesTable } from "@/components/admin/fines/rules-table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminFinesPage() {
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
    !new Set(["admin", "student_assistant"]).has(activeMembership.role)
  ) {
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
  const dormOptions = await getUserDorms();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fines</h1>
          <p className="text-sm text-muted-foreground">
            Track violations, issue fines, and maintain rules.
          </p>
        </div>
        <ExportXlsxDialog
          report="fines-ledger"
          title="Export Fines Ledger"
          description="Download fines data with current date-range and dorm filters."
          defaultDormId={activeMembership.dorm_id}
          dormOptions={dormOptions}
          includeDormSelector
        />
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
