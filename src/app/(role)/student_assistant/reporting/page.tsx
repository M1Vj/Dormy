import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/stats";
import { getCommittee, getCommitteeFinanceSummary, type CommitteeDetail, type CommitteeFinanceSummaryRow } from "@/app/actions/committees";
import { getCleaningSnapshot } from "@/app/actions/cleaning";
import { getFines } from "@/app/actions/fines";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reporting/stat-card";
import { CommitteeReportView } from "@/components/reporting/committee-report-view";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  CheckCircle2,
  Gavel,
  Users,
  ShieldAlert,
  SprayCan,
  ClipboardList,
} from "lucide-react";

export default async function StudentAssistantReportingPage() {
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

  const [statsRes, cleaningRes, activeFines] = await Promise.all([
    getDashboardStats(dormId),
    getCleaningSnapshot(),
    getFines(dormId, { status: "active" }),
  ]);

  if ("error" in statsRes) return <div className="p-6 text-sm text-destructive">{statsRes.error}</div>;
  const stats = statsRes;
  const cleaning = "error" in cleaningRes ? null : cleaningRes;

  const clearancePercentage = stats.totalOccupants > 0 ? (stats.occupantsCleared / stats.totalOccupants) * 100 : 0;
  const fineCollectionRate = stats.finesCharged > 0 ? (stats.finesPaid / stats.finesCharged) * 100 : 0;

  const severityCounts = activeFines.reduce((acc: Record<string, number>, f: any) => {
    const severity = f.rule?.severity ?? "unknown";
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalAssignments = cleaning?.assignments?.length ?? 0;

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">SA Operations Report</h1>
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {currentDate}
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs uppercase tracking-wider font-semibold">Student Assistant</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Fines"
          value={`${stats.totalFinesActive}`}
          sublabel={`₱${stats.totalFinesPesos.toFixed(2)} · ${stats.totalFinesPoints.toFixed(0)} pts`}
          icon={Gavel}
          variant="warn"
        />
        <StatCard
          label="Fine Collection"
          value={`₱${stats.finesPaid.toFixed(2)}`}
          sublabel={`${fineCollectionRate.toFixed(0)}% of ₱${stats.finesCharged.toFixed(2)} charged`}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard
          label="Clearance Rate"
          value={`${clearancePercentage.toFixed(0)}%`}
          sublabel={`${stats.occupantsCleared} / ${stats.totalOccupants} cleared`}
          icon={Users}
          variant={clearancePercentage < 100 ? "warn" : "success"}
        />
        <StatCard
          label="Cleaning Assignments"
          value={`${totalAssignments}`}
          sublabel="This week"
          icon={SprayCan}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className={activeFines.length > 0 ? "border-l-4 border-l-amber-500" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Fines by Severity
            </CardTitle>
            <CardDescription>Breakdown of {activeFines.length} active fines</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(severityCounts).length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No active fines — all clear.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(severityCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([severity, count]) => {
                    const pct = activeFines.length > 0 ? (count / activeFines.length) * 100 : 0;
                    const colorClass =
                      severity === "major" ? "bg-red-500" :
                        severity === "minor" ? "bg-amber-500" :
                          "bg-slate-400";
                    return (
                      <div key={severity} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="capitalize">{severity}</span>
                          <span>{count} fine{count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${colorClass} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-sky-500" />
              Cleaning Schedule
            </CardTitle>
            <CardDescription>
              {cleaning ? `Week of ${cleaning.selected_week_start}` : "Current week assignments"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!cleaning || totalAssignments === 0 ? (
              <p className="text-sm text-muted-foreground italic">No cleaning assignments for this week.</p>
            ) : (
              <div className="space-y-3">
                {cleaning.assignments.slice(0, 8).map((asg: any) => (
                  <div key={asg.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">Room {asg.room_code}</p>
                      <p className="text-xs text-muted-foreground">{asg.area_name}</p>
                    </div>
                    <span className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full uppercase font-medium">
                      Assigned
                    </span>
                  </div>
                ))}
                {totalAssignments > 8 && (
                  <p className="text-xs text-center text-muted-foreground">
                    And {totalAssignments - 8} more assignments...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-500" />
            Recent Active Fines
          </CardTitle>
          <CardDescription>Latest unpaid penalties across all occupants</CardDescription>
        </CardHeader>
        <CardContent>
          {activeFines.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              No active fines to display.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Occupant</th>
                    <th className="px-3 py-2 font-medium">Violation</th>
                    <th className="px-3 py-2 font-medium text-center">Severity</th>
                    <th className="px-3 py-2 text-right font-medium">Pesos</th>
                    <th className="px-3 py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {activeFines.slice(0, 15).map((fine: any) => (
                    <tr key={fine.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{fine.occupant?.full_name ?? "Unknown"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fine.rule?.title ?? "Fine"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize ${fine.rule?.severity === "major"
                            ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                            : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          }`}>
                          {fine.rule?.severity ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-amber-600">₱{Number(fine.pesos).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{fine.points} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {activeFines.length > 15 && (
                <p className="text-xs text-center text-muted-foreground py-2">
                  Showing 15 of {activeFines.length} active fines.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
