import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/stats";
import { getCommittee, getCommitteeFinanceSummary, getCommitteeDashboardData, type CommitteeDetail, type CommitteeFinanceSummaryRow } from "@/app/actions/committees";
import { getDormApplicationsForActiveDorm } from "@/app/actions/join";
import { getExpenses } from "@/app/actions/expenses";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reporting/stat-card";
import { CommitteeReportView } from "@/components/reporting/committee-report-view";
import { PrintReportButton } from "@/components/reporting/print-report-button";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  AlertTriangle,
  Gavel,
  CalendarDays,
  CircleDollarSign,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export default async function AdviserReportingPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map(m => m.role) ?? ["occupant"];

  let committeeData: CommitteeDetail | null = null;
  let committeeFinances: CommitteeFinanceSummaryRow[] = [];

  const { data: userCommitteeRoles } = await supabase
    .from("committee_members")
    .select("committee_id, role")
    .eq("user_id", user.id)
    .in("role", ["head", "co-head"])
    .limit(1);

  const userCommitteeRole = userCommitteeRoles?.[0] || null;

  if (userCommitteeRole) {
    const cRes = await getCommittee(userCommitteeRole.committee_id);
    const fRes = await getCommitteeFinanceSummary(userCommitteeRole.committee_id);
    if (cRes.data && cRes.data.dorm_id === dormId) {
      committeeData = cRes.data;
      if (fRes.data) committeeFinances = fRes.data;
    }
  }

  const isDormStaff = roles.some(r => new Set(["admin", "adviser", "student_assistant", "treasurer", "officer"]).has(r));

  if (!isDormStaff && !committeeData) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
        <BarChart3 className="h-12 w-12 text-muted" />
        <h2 className="text-xl font-semibold">No Reports Available</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          You do not have the required roles or committee assignments to view reports.
        </p>
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (!isDormStaff && committeeData) {
    return (
      <CommitteeReportView
        committeeData={committeeData}
        committeeFinances={committeeFinances}
        currentDate={currentDate}
      />
    );
  }

  const [statsRes, appsRes, expensesRes, committeesRes] = await Promise.all([
    getDashboardStats(dormId),
    getDormApplicationsForActiveDorm(dormId, "pending"),
    getExpenses(dormId, { status: "pending" }),
    getCommitteeDashboardData(dormId),
  ]);

  if ("error" in statsRes) return <div className="p-6 text-sm text-destructive">{statsRes.error}</div>;
  const stats = statsRes;
  const pendingApps = appsRes;
  const pendingExpenses = "data" in expensesRes ? (expensesRes.data ?? []) : [];
  const committees = "data" in committeesRes ? (committeesRes.data ?? []) : [];

  const clearancePercentage = stats.totalOccupants > 0 ? (stats.occupantsCleared / stats.totalOccupants) * 100 : 0;
  const overallCollectionRate = stats.totalCharged > 0 ? (stats.totalPaid / stats.totalCharged) * 100 : 0;
  const pendingExpenseTotal = pendingExpenses.reduce((s: number, e: any) => s + Number(e.amount_pesos), 0);

  const alertCount = (pendingApps.length > 0 ? 1 : 0) + (pendingExpenses.length > 0 ? 1 : 0) + (stats.totalCollectibles > 5000 ? 1 : 0);

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex flex-col gap-2 print:mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Adviser Oversight Report</h1>
          <PrintReportButton />
        </div>
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {currentDate}
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs uppercase tracking-wider font-semibold">Adviser</span>
        </p>
      </div>

      <Card className={alertCount > 0 ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-emerald-500"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {alertCount > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            )}
            Critical Alerts
            {alertCount > 0 && (
              <span className="ml-auto text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                {alertCount} item{alertCount !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          <CardDescription>Items requiring immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingApps.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                <div>
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{pendingApps.length} Pending Application{pendingApps.length !== 1 ? "s" : ""}</span>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Users waiting for dorm membership approval</p>
                </div>
                <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full font-medium">Action Required</span>
              </div>
            )}
            {pendingExpenses.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                <div>
                  <span className="text-sm font-medium text-red-800 dark:text-red-300">{pendingExpenses.length} Pending Expense{pendingExpenses.length !== 1 ? "s" : ""}</span>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">Total: ₱{pendingExpenseTotal.toFixed(2)} awaiting review</p>
                </div>
                <span className="text-xs bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-200 px-2 py-0.5 rounded-full font-medium">Review Needed</span>
              </div>
            )}
            {stats.totalCollectibles > 5000 && (
              <div className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg border border-rose-200 dark:border-rose-900">
                <div>
                  <span className="text-sm font-medium text-rose-800 dark:text-rose-300">High Outstanding Collectibles</span>
                  <p className="text-xs text-rose-600 dark:text-rose-500 mt-0.5">₱{stats.totalCollectibles.toFixed(2)} unpaid across occupants</p>
                </div>
                <span className="text-xs bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-200 px-2 py-0.5 rounded-full font-medium">Financial Risk</span>
              </div>
            )}
            {alertCount === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                All clear — no critical alerts at this time.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cash on Hand"
          value={`₱${stats.cashOnHand.toFixed(2)}`}
          sublabel="Net: collections − expenses"
          icon={CircleDollarSign}
          variant="success"
        />
        <StatCard
          label="Collection Rate"
          value={`${overallCollectionRate.toFixed(0)}%`}
          sublabel={`₱${stats.totalPaid.toFixed(2)} of ₱${stats.totalCharged.toFixed(2)}`}
          icon={TrendingUp}
          variant={overallCollectionRate >= 80 ? "success" : overallCollectionRate >= 50 ? "warn" : "danger"}
        />
        <StatCard
          label="Active Fines"
          value={`${stats.totalFinesActive}`}
          sublabel={`₱${stats.totalFinesPesos.toFixed(2)} · ${stats.totalFinesPoints.toFixed(0)} pts`}
          icon={Gavel}
          variant="warn"
        />
        <StatCard
          label="Events This Sem"
          value={`${stats.totalEvents}`}
          sublabel="Total organized"
          icon={CalendarDays}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dorm Health Overview</CardTitle>
          <CardDescription>Key operational metrics at a glance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span>Occupant Clearance</span>
                  <span>{clearancePercentage.toFixed(0)}% ({stats.occupantsCleared}/{stats.totalOccupants})</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${clearancePercentage}%` }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span>Overall Collection Rate</span>
                  <span>{overallCollectionRate.toFixed(0)}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${overallCollectionRate}%` }} />
                </div>
              </div>
              {(() => {
                const maintRate = stats.maintenanceCharged > 0 ? (stats.maintenancePaid / stats.maintenanceCharged) * 100 : 0;
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Maintenance Collection</span>
                      <span>{maintRate.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${maintRate}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats.totalOccupants}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Occupants</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats.totalEvents}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Events Held</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-amber-600">{stats.totalFinesActive}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Active Fines</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-red-600">₱{stats.totalExpenses.toFixed(0)}</p>
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Expenses</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Full Ledger Breakdown</CardTitle>
          <CardDescription>Charges and payments by category for the active semester</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 text-right font-medium">Charged</th>
                  <th className="px-3 py-3 text-right font-medium">Paid</th>
                  <th className="px-3 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-3 font-medium">Maintenance Fees</td>
                  <td className="px-3 py-3 text-right">₱{stats.maintenanceCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.maintenancePaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.maintenanceCharged - stats.maintenancePaid).toFixed(2)}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-3 font-medium">SA Fines</td>
                  <td className="px-3 py-3 text-right">₱{stats.finesCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.finesPaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.finesCharged - stats.finesPaid).toFixed(2)}</td>
                </tr>
                <tr className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">Event Contributions</td>
                  <td className="px-3 py-3 text-right">₱{stats.eventsCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.eventsPaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.eventsCharged - stats.eventsPaid).toFixed(2)}</td>
                </tr>
                <tr className="bg-muted/30">
                  <td className="px-3 py-3 font-bold">Total</td>
                  <td className="px-3 py-3 text-right font-bold">₱{stats.totalCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">₱{stats.totalPaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-bold">₱{(stats.totalCharged - stats.totalPaid).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {committees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Committee Fund Overview</CardTitle>
            <CardDescription>Collection performance across active committees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Committee</th>
                    <th className="px-3 py-2 text-right font-medium">Charged</th>
                    <th className="px-3 py-2 text-right font-medium">Collected</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {committees.map((c: any) => {
                    const income = c.finance?.reduce((s: number, f: any) => s + Number(f.collected_pesos), 0) ?? 0;
                    const charged = c.finance?.reduce((s: number, f: any) => s + Number(f.charged_pesos), 0) ?? 0;
                    const rate = charged > 0 ? (income / charged) * 100 : 0;
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-medium">{c.name}</td>
                        <td className="px-3 py-3 text-right">₱{charged.toFixed(2)}</td>
                        <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{income.toFixed(2)}</td>
                        <td className="px-3 py-3 text-right text-amber-600">₱{(charged - income).toFixed(2)}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${rate > 80 ? "bg-emerald-500" : rate > 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{rate.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <CardTitle>Occupant Clearance Status</CardTitle>
              <CardDescription>{stats.occupantsCleared} of {stats.totalOccupants} occupants cleared</CardDescription>
            </div>
            <div className="w-1/3 bg-muted rounded-full h-2.5 overflow-hidden border">
              <div className="bg-emerald-500 h-2.5" style={{ width: `${clearancePercentage}%` }} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.clearanceList.map((item) => (
                  <tr key={item.occupant_id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{item.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.student_id ?? "—"}</td>
                    <td className={`px-3 py-2 text-right font-medium ${item.total_balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      ₱{item.total_balance.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${item.is_cleared ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700" : "border-red-500/20 bg-red-500/10 text-red-700"}`}>
                        {item.is_cleared ? "Cleared" : "Ongoing"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!stats.clearanceList.length && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No occupants found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
