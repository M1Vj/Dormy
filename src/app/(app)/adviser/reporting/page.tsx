import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/stats";
import { getCommittee, getCommitteeFinanceSummary, type CommitteeDetail, type CommitteeFinanceSummaryRow } from "@/app/actions/committees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  AlertTriangle,
  Users,
  Gavel,
  CalendarDays,
  Wallet,
  Receipt
} from "lucide-react";

function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "danger" | "warn";
}) {
  const colorMap = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-red-600 dark:text-red-400",
    warn: "text-amber-600 dark:text-amber-400",
  };

  return (
    <Card className="shadow-sm border-muted">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl tracking-tight font-bold ${colorMap[variant]}`}>{value}</div>
        {sublabel ? (
          <p className="text-xs font-medium text-muted-foreground mt-1">{sublabel}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function ReportingDashboardPage() {
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
  const primaryRole = roles.includes("admin") ? "admin" : roles.includes("adviser") ? "adviser" : roles[0] ?? "occupant";

  // Check if occupant is a committee head
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
    const incomeCharged = committeeFinances.reduce((s, r) => s + r.charged_pesos, 0);
    const incomeCollected = committeeFinances.reduce((s, r) => s + r.collected_pesos, 0);
    const incomeOutstanding = incomeCharged - incomeCollected;
    const totalApprovedExp = committeeData.expenses
      .filter((e) => e.status === "approved")
      .reduce((s, e) => s + Number(e.amount_pesos), 0);
    const balance = incomeCollected - totalApprovedExp;

    return (
      <div className="space-y-8 print:space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Committee Report: {committeeData.name}</h1>
          <p className="text-sm text-muted-foreground">{currentDate} · Confidential Committee Finances</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Available Balance" value={`₱${balance.toFixed(2)}`} icon={Wallet} variant={balance >= 0 ? "success" : "danger"} />
          <StatCard label="Event Income Collected" value={`₱${incomeCollected.toFixed(2)}`} icon={CircleDollarSign} variant="success" />
          <StatCard label="Approved Expenses" value={`-₱${totalApprovedExp.toFixed(2)}`} icon={Receipt} variant="danger" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contribution Breakdown</CardTitle>
            <CardDescription>Income generated per event under your committee</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Event Title</th>
                    <th className="px-3 py-2 text-right font-medium">Charged</th>
                    <th className="px-3 py-2 text-right font-medium">Collected</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {committeeFinances.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No events recorded.</td></tr>
                  )}
                  {committeeFinances.map(row => (
                    <tr key={row.event_id} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{row.event_title}</td>
                      <td className="px-3 py-3 text-right">₱{row.charged_pesos.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-emerald-600 font-semibold">₱{row.collected_pesos.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-amber-600">₱{row.balance_pesos.toFixed(2)}</td>
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

  // --- RENDER DORM STAFF VIEW ---
  const statsRes = await getDashboardStats(dormId);
  if ("error" in statsRes) return <div className="p-6 text-sm text-destructive">{statsRes.error}</div>;
  const stats = statsRes;

  const showOverallFinance = roles.some(r => new Set(["admin", "adviser"]).has(r));
  const showFinesAndMaintenance = roles.some(r => new Set(["admin", "adviser", "student_assistant"]).has(r));
  const showContributions = roles.some(r => new Set(["admin", "adviser", "treasurer"]).has(r));

  const clearancePercentage = stats.totalOccupants > 0 ? (stats.occupantsCleared / stats.totalOccupants) * 100 : 0;

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Reporting Dashboard</h1>
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {currentDate}
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs uppercase tracking-wider">{primaryRole.replace("_", " ")}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showOverallFinance && (
          <>
            <StatCard label="Cash on Hand" value={`₱${stats.cashOnHand.toFixed(2)}`} sublabel="Payments vs Expenses" icon={CircleDollarSign} variant="success" />
            <StatCard label="Total Expenses" value={`-₱${stats.totalExpenses.toFixed(2)}`} sublabel="Approved sem expenditures" icon={BarChart3} variant="danger" />
            <StatCard label="Collectibles" value={`₱${stats.totalCollectibles.toFixed(2)}`} sublabel="Unpaid occupant charges" icon={AlertTriangle} variant={stats.totalCollectibles > 0 ? "warn" : "success"} />
            <StatCard label="Total Collected" value={`₱${stats.totalPaid.toFixed(2)}`} sublabel="Gross payments received" icon={CheckCircle2} variant="success" />
          </>
        )}

        {!showOverallFinance && showContributions && (
          <StatCard label="Total Contributions" value={`₱${stats.eventsPaid.toFixed(2)}`} sublabel="Received so far" icon={CircleDollarSign} variant="success" />
        )}

        {!showOverallFinance && showFinesAndMaintenance && (
          <StatCard label="Maintenance Collected" value={`₱${stats.maintenancePaid.toFixed(2)}`} icon={Wallet} variant="success" />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {showFinesAndMaintenance && (
          <StatCard
            label="Active Fines"
            value={`${stats.totalFinesActive}`}
            sublabel={`₱${stats.totalFinesPesos.toFixed(2)} / ${stats.totalFinesPoints.toFixed(0)} pts`}
            icon={Gavel}
            variant="warn"
          />
        )}
        <StatCard
          label="Total Events"
          value={`${stats.totalEvents}`}
          sublabel="Organized this semester"
          icon={CalendarDays}
        />
        {showFinesAndMaintenance && (
          <StatCard
            label="Clearance Status"
            value={`${clearancePercentage.toFixed(0)}%`}
            sublabel={`${stats.occupantsCleared} / ${stats.totalOccupants} cleared`}
            icon={Users}
            variant={clearancePercentage < 100 ? "warn" : "success"}
          />
        )}
      </div>

      {showOverallFinance && (
        <Card>
          <CardHeader>
            <CardTitle>Ledger Breakdown</CardTitle>
            <CardDescription>Fiscal charges and payments separated natively by category</CardDescription>
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
                    <td className="px-3 py-3 font-medium">Maintenance</td>
                    <td className="px-3 py-3 text-right">₱{stats.maintenanceCharged.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.maintenancePaid.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-medium">₱{(stats.maintenanceCharged - stats.maintenancePaid).toFixed(2)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-3 font-medium">Fines</td>
                    <td className="px-3 py-3 text-right">₱{stats.finesCharged.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.finesPaid.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-medium">₱{(stats.finesCharged - stats.finesPaid).toFixed(2)}</td>
                  </tr>
                  <tr className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">Contributions</td>
                    <td className="px-3 py-3 text-right">₱{stats.eventsCharged.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-emerald-600 font-medium">₱{stats.eventsPaid.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-medium">₱{(stats.eventsCharged - stats.eventsPaid).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showFinesAndMaintenance && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <CardTitle>Occupant Clearance Status</CardTitle>
                <CardDescription>{stats.occupantsCleared} of {stats.totalOccupants} occupants cleared</CardDescription>
              </div>
              <div className="w-1/3 bg-muted rounded-full h-2.5 overflow-hidden border">
                <div className="bg-emerald-500 h-2.5" style={{ width: `${clearancePercentage}%` }}></div>
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
      )}
    </div>
  );
}
