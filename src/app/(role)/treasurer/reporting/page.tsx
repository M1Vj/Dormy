import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/stats";
import { getCommittee, getCommitteeFinanceSummary, type CommitteeDetail, type CommitteeFinanceSummaryRow } from "@/app/actions/committees";
import { getExpenses } from "@/app/actions/expenses";
import { getCommitteeDashboardData } from "@/app/actions/committees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reporting/stat-card";
import { CommitteeReportView } from "@/components/reporting/committee-report-view";
import { PrintReportButton } from "@/components/reporting/print-report-button";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Wallet,
  Receipt,
  PiggyBank,
  ArrowDownRight,
  Users,
} from "lucide-react";

export default async function TreasurerReportingPage() {
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

  // Check if user is a committee head (fallback for non-staff)
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
          You do not have the required roles or committee assignments to view financial reports.
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

  // --- RENDER COMMITTEE HEAD VIEW ---
  if (!isDormStaff && committeeData) {
    return (
      <CommitteeReportView
        committeeData={committeeData}
        committeeFinances={committeeFinances}
        currentDate={currentDate}
      />
    );
  }

  // --- TREASURER-FOCUSED REPORTING ---
  const [statsRes, expensesRes, committeesRes] = await Promise.all([
    getDashboardStats(dormId),
    getExpenses(dormId, { status: "pending" }),
    getCommitteeDashboardData(dormId)
  ]);

  if ("error" in statsRes) return <div className="p-6 text-sm text-destructive">{statsRes.error}</div>;
  const stats = statsRes;
  const pendingExpenses = "data" in expensesRes ? (expensesRes.data ?? []) : [];
  const committees = "data" in committeesRes ? (committeesRes.data ?? []) : [];

  const collectionRate = stats.eventsCharged > 0 ? (stats.eventsPaid / stats.eventsCharged) * 100 : 0;
  const overallCollectionRate = stats.totalCharged > 0 ? (stats.totalPaid / stats.totalCharged) * 100 : 0;
  const pendingExpenseTotal = pendingExpenses.reduce((s: number, e: any) => s + Number(e.amount_pesos), 0);

  return (
    <div className="space-y-8 print:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 print:mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Finance Report</h1>
          <PrintReportButton />
        </div>
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {currentDate}
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider font-semibold">Treasurer</span>
        </p>
      </div>

      {/* Primary Financial KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cash on Hand"
          value={`₱${stats.cashOnHand.toFixed(2)}`}
          sublabel="All-time collections minus expenses"
          icon={Wallet}
          variant="success"
        />
        <StatCard
          label="Total Collections"
          value={`₱${stats.totalPaid.toFixed(2)}`}
          sublabel="Gross payments this semester"
          icon={PiggyBank}
          variant="success"
        />
        <StatCard
          label="Outstanding Collectibles"
          value={`₱${stats.totalCollectibles.toFixed(2)}`}
          sublabel={`${overallCollectionRate.toFixed(0)}% collected`}
          icon={AlertTriangle}
          variant={stats.totalCollectibles > 0 ? "warn" : "success"}
        />
        <StatCard
          label="Total Expenses"
          value={`₱${stats.totalExpenses.toFixed(2)}`}
          sublabel="Approved this semester"
          icon={ArrowDownRight}
          variant="danger"
        />
      </div>

      {/* Collection Rates + Pending Expenses */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Collection Rate Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Collection Rates
            </CardTitle>
            <CardDescription>Payment progress across all ledger categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {/* Contributions */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span>Event Contributions</span>
                  <span>{collectionRate.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${collectionRate}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>₱{stats.eventsPaid.toFixed(2)} collected</span>
                  <span>₱{stats.eventsCharged.toFixed(2)} charged</span>
                </div>
              </div>
              {/* Maintenance */}
              {(() => {
                const maintRate = stats.maintenanceCharged > 0 ? (stats.maintenancePaid / stats.maintenanceCharged) * 100 : 0;
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Maintenance Fees</span>
                      <span>{maintRate.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-sky-500 transition-all" style={{ width: `${maintRate}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>₱{stats.maintenancePaid.toFixed(2)} collected</span>
                      <span>₱{stats.maintenanceCharged.toFixed(2)} charged</span>
                    </div>
                  </div>
                );
              })()}
              {/* Fines */}
              {(() => {
                const fineRate = stats.finesCharged > 0 ? (stats.finesPaid / stats.finesCharged) * 100 : 0;
                return (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>SA Fines</span>
                      <span>{fineRate.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${fineRate}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>₱{stats.finesPaid.toFixed(2)} collected</span>
                      <span>₱{stats.finesCharged.toFixed(2)} charged</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Pending Expenses */}
        <Card className={pendingExpenses.length > 0 ? "border-l-4 border-l-amber-500" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-500" />
              Pending Expenses
              {pendingExpenses.length > 0 && (
                <span className="ml-auto text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                  {pendingExpenses.length} awaiting review
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {pendingExpenses.length > 0
                ? `Total pending: ₱${pendingExpenseTotal.toFixed(2)}`
                : "All expenses have been reviewed"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingExpenses.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  No pending expenses to review.
                </div>
              )}
              {pendingExpenses.slice(0, 8).map((exp: any) => (
                <div key={exp.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{exp.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(exp.purchased_at).toLocaleDateString()} · {exp.category.replace("_", " ")}
                    </p>
                  </div>
                  <p className="font-semibold text-sm text-red-600 dark:text-red-400">
                    ₱{Number(exp.amount_pesos).toFixed(2)}
                  </p>
                </div>
              ))}
              {pendingExpenses.length > 8 && (
                <p className="text-xs text-center text-muted-foreground">
                  And {pendingExpenses.length - 8} more...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Committee Fund Health */}
      <Card>
        <CardHeader>
          <CardTitle>Committee Fund Health</CardTitle>
          <CardDescription>Collection rates and balances across active committees</CardDescription>
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
                {(!committees || committees.length === 0) && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No committee data available.</td></tr>
                )}
                {committees?.map((c: any) => {
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

      {/* Ledger Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger Summary</CardTitle>
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
                  <td className="px-3 py-3 font-medium">Event Contributions</td>
                  <td className="px-3 py-3 text-right">₱{stats.eventsCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.eventsPaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.eventsCharged - stats.eventsPaid).toFixed(2)}</td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-3 font-medium">Maintenance Fees</td>
                  <td className="px-3 py-3 text-right">₱{stats.maintenanceCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.maintenancePaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.maintenanceCharged - stats.maintenancePaid).toFixed(2)}</td>
                </tr>
                <tr className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">SA Fines</td>
                  <td className="px-3 py-3 text-right">₱{stats.finesCharged.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.finesPaid.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-medium">₱{(stats.finesCharged - stats.finesPaid).toFixed(2)}</td>
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

      {/* Top Delinquent Occupants */}
      {(() => {
        const delinquents = stats.clearanceList
          .filter(o => o.total_balance > 0)
          .sort((a, b) => b.total_balance - a.total_balance)
          .slice(0, 10);
        return delinquents.length > 0 ? (
          <Card className="border-l-4 border-l-red-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-red-500" />
                Top Delinquent Occupants
              </CardTitle>
              <CardDescription>Occupants with the highest outstanding balances</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Student ID</th>
                      <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delinquents.map((occ, idx) => (
                      <tr key={occ.occupant_id} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium">{occ.full_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{occ.student_id ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400">
                          ₱{occ.total_balance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null;
      })()}
    </div>
  );
}
