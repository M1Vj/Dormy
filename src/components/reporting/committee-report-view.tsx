import type { CommitteeDetail, CommitteeFinanceSummaryRow } from "@/app/actions/committees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reporting/stat-card";
import { CircleDollarSign, Receipt, Wallet } from "lucide-react";

export function CommitteeReportView({
  committeeData,
  committeeFinances,
  currentDate,
}: {
  committeeData: CommitteeDetail;
  committeeFinances: CommitteeFinanceSummaryRow[];
  currentDate: string;
}) {
  const incomeCharged = committeeFinances.reduce((s, r) => s + r.charged_pesos, 0);
  const incomeCollected = committeeFinances.reduce((s, r) => s + r.collected_pesos, 0);
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
