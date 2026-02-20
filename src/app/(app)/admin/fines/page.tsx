import { redirect } from "next/navigation";

import { getFineRules, getFines } from "@/app/actions/fines";
import { getFineReports } from "@/app/actions/fine-reports";
import { getOccupants } from "@/app/actions/occupants";
import { FinesLedger } from "@/components/admin/fines/fines-ledger";
import { FineReportsTable, type FineReportRow } from "@/components/admin/fines/fine-reports-table";
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

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

export default async function AdminFinesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params?.search)?.trim() || "";
  const status = normalizeParam(params?.status)?.trim() || "";

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

  const activeMemberships = memberships?.filter(m => m.dorm_id === activeDormId!) ?? [];
  const hasAccess = activeMemberships.some(m => new Set(["admin", "student_assistant"]).has(m.role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const [rules, fines, occupants] = await Promise.all([
    getFineRules(activeDormId!),
    getFines(activeDormId!, {
      search: search || undefined,
      status: status || undefined,
    }),
    getOccupants(activeDormId!, { status: "active" }),
  ]);
  const reportsResult = await getFineReports(activeDormId!);
  const reports = ("data" in reportsResult ? (reportsResult.data ?? []) : []) as FineReportRow[];
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
          defaultDormId={activeDormId!}
          dormOptions={dormOptions}
          includeDormSelector
        />
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <FinesLedger
            dormId={activeDormId!}
            fines={fines}
            rules={rules}
            occupants={occupants}
            filters={{
              search,
              status,
            }}
          />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTable dormId={activeDormId!} rules={rules} />
        </TabsContent>
        <TabsContent value="reports">
          <FineReportsTable reports={reports} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
