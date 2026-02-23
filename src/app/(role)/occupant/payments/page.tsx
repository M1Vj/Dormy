import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Building2, CalendarDays, Users, Wallet } from "lucide-react";

import { getDormFinanceOverview } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formatPesos(value: number) {
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OccupantFinanceOverviewPage() {
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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership?.id) {
    redirect("/join");
  }

  const overview = await getDormFinanceOverview(dormId);
  if ("error" in overview) {
    return <div className="p-6 text-sm text-destructive">{overview.error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dorm Finance Overview</h1>
        <p className="text-sm text-muted-foreground">
          This view shows dorm-level totals only. Individual balances and payment histories are intentionally hidden.
        </p>
      </div>

      <Card className="border-l-4 border-l-amber-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Overall Finance Snapshot
          </CardTitle>
          <CardDescription>Combined total for contributions and maintenance fee ledgers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total Charged</p>
            <p className="mt-1 text-xl font-semibold">{formatPesos(overview.totals.charged)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Total Collected</p>
            <p className="mt-1 text-xl font-semibold text-emerald-600">{formatPesos(overview.totals.collected)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Approved Expenses</p>
            <p className="mt-1 text-xl font-semibold">{formatPesos(overview.totals.approved_expenses)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={`mt-1 text-xl font-semibold ${overview.totals.outstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {formatPesos(overview.totals.outstanding)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Contributions
            </CardTitle>
            <CardDescription>Treasurer-managed contribution flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Charged: <span className="font-medium">{formatPesos(overview.contributions.charged)}</span></p>
            <p>Collected: <span className="font-medium text-emerald-600">{formatPesos(overview.contributions.collected)}</span></p>
            <p>Outstanding: <span className="font-medium">{formatPesos(overview.contributions.outstanding)}</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Maintenance Fee
            </CardTitle>
            <CardDescription>Adviser and SA maintenance ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Charged: <span className="font-medium">{formatPesos(overview.maintenance_fee.charged)}</span></p>
            <p>Collected: <span className="font-medium text-emerald-600">{formatPesos(overview.maintenance_fee.collected)}</span></p>
            <p>Outstanding: <span className="font-medium">{formatPesos(overview.maintenance_fee.outstanding)}</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Committee Funds
            </CardTitle>
            <CardDescription>Committee-level operating expenses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Committees tracked: <span className="font-medium">{overview.committee_funds.committee_count}</span></p>
            <p>Approved expenses: <span className="font-medium">{formatPesos(overview.committee_funds.approved_expenses)}</span></p>
            <p>Pending expenses: <span className="font-medium text-amber-600">{formatPesos(overview.committee_funds.pending_expenses)}</span></p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4" />
            Related Pages
          </CardTitle>
          <CardDescription>Open the modules connected to this overview.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/occupant/fines/reports">Fine Reports</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/occupant/committees">My Committee</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/occupant/events">Events</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/occupant/cleaning">Cleaning Schedule</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
