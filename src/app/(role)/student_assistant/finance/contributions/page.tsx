import { redirect } from "next/navigation";

import { getDormFinanceOverview } from "@/app/actions/finance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function StudentAssistantContributionFinancePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured for this environment.</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const overview = await getDormFinanceOverview(dormId);
  if ("error" in overview) {
    return <div className="p-6 text-sm text-destructive">{overview.error}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contributions</h1>
        <p className="text-sm text-muted-foreground">Dorm-wide contribution ledger totals.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Charged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPesos(overview.contributions.charged)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">{formatPesos(overview.contributions.collected)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-600">{formatPesos(overview.contributions.outstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contribution Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPesos(overview.contributions.approved_expenses)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Note</CardTitle>
          <CardDescription>
            Student assistants can monitor contribution totals here while focusing management work on fines, maintenance fee, and committee operations.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
