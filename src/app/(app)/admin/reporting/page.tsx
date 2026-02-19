import { redirect } from "next/navigation";

import { getDashboardStats } from "@/app/actions/dashboard";
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorMap[variant]}`}>{value}</div>
        {sublabel ? (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dormId = await getActiveDormId();
  if (!dormId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No active dorm selected.
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? "";
  const isAllowed = new Set([
    "admin",
    "treasurer",
    "student_assistant",
    "adviser",
  ]).has(role);

  if (!isAllowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this dashboard.
      </div>
    );
  }

  const stats = await getDashboardStats(dormId);
  if ("error" in stats) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {stats.error}
      </div>
    );
  }

  const clearancePercentage =
    stats.totalOccupants > 0
      ? Math.round((stats.occupantsCleared / stats.totalOccupants) * 100)
      : 0;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Reporting Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Financial overview for the current semester. Ideal for projector
            presentations and end-of-sem reports.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Cash on Hand"
          value={`₱${stats.cashOnHand.toFixed(2)}`}
          sublabel="Payments - Approved Expenses"
          icon={CircleDollarSign}
          variant="success"
        />
        <StatCard
          label="Total Expenses"
          value={`-₱${stats.totalExpenses.toFixed(2)}`}
          sublabel="Approved expenditures"
          icon={BarChart3}
          variant="danger"
        />
        <StatCard
          label="Collectibles"
          value={`₱${stats.totalCollectibles.toFixed(2)}`}
          sublabel="Unpaid occupant charges"
          icon={AlertTriangle}
          variant={stats.totalCollectibles > 0 ? "warn" : "success"}
        />
        <StatCard
          label="Total Collected"
          value={`₱${stats.totalPaid.toFixed(2)}`}
          sublabel="Gross payments received"
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Fines"
          value={`${stats.totalFinesActive}`}
          sublabel={`₱${stats.totalFinesPesos.toFixed(2)} / ${stats.totalFinesPoints.toFixed(0)} pts`}
          icon={Gavel}
          variant="warn"
        />
        <StatCard
          label="Total Events"
          value={`${stats.totalEvents}`}
          sublabel="This semester"
          icon={CalendarDays}
        />
        <StatCard
          label="Occupants"
          value={`${stats.totalOccupants}`}
          sublabel={`${stats.occupantsNotCleared} not cleared`}
          icon={Users}
          variant={stats.occupantsNotCleared > 0 ? "danger" : "success"}
        />
      </div>

      {/* Ledger Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger Breakdown</CardTitle>
          <CardDescription>
            Charges and payments by category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Charged
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Maintenance</td>
                  <td className="px-3 py-2 text-right">
                    ₱{stats.maintenanceCharged.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600">
                    ₱{stats.maintenancePaid.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ₱{(stats.maintenanceCharged - stats.maintenancePaid).toFixed(2)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="px-3 py-2 font-medium">Fines</td>
                  <td className="px-3 py-2 text-right">
                    ₱{stats.finesCharged.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600">
                    ₱{stats.finesPaid.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ₱{(stats.finesCharged - stats.finesPaid).toFixed(2)}
                  </td>
                </tr>
                <tr className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">Events</td>
                  <td className="px-3 py-2 text-right">
                    ₱{stats.eventsCharged.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600">
                    ₱{stats.eventsPaid.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ₱{(stats.eventsCharged - stats.eventsPaid).toFixed(2)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t font-bold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">
                    ₱{stats.totalCharged.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-600">
                    ₱{stats.totalPaid.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    ₱{stats.totalCollectibles.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Clearance List */}
      <Card>
        <CardHeader>
          <CardTitle>Occupant Clearance Status</CardTitle>
          <CardDescription>
            {stats.occupantsCleared} of {stats.totalOccupants} occupants are
            cleared for this semester
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Mobile Cards */}
          <div className="space-y-2 md:hidden">
            {stats.clearanceList.map((item) => (
              <div
                key={item.occupant_id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{item.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.student_id ?? "No ID"}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${item.is_cleared ? "text-emerald-600" : "text-red-600"
                      }`}
                  >
                    {item.is_cleared
                      ? "Cleared"
                      : `₱${item.total_balance.toFixed(2)}`}
                  </p>
                </div>
              </div>
            ))}
            {!stats.clearanceList.length ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No occupants found.
              </div>
            ) : null}
          </div>

          {/* Desktop Table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Balance
                  </th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.clearanceList.map((item) => (
                  <tr key={item.occupant_id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {item.full_name}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.student_id ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${item.total_balance > 0
                        ? "text-red-600"
                        : "text-emerald-600"
                        }`}
                    >
                      ₱{item.total_balance.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${item.is_cleared
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                          }`}
                      >
                        {item.is_cleared ? "Cleared" : "Not Cleared"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!stats.clearanceList.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No occupants found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
