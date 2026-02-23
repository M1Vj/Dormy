import { redirect } from "next/navigation";
import { getOccupantReportingData } from "@/app/actions/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import {
  Wallet,
  Receipt,
  Gavel,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  History,
  ArrowRight
} from "lucide-react";
import Link from "next/link";

export default async function OccupantReportingPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <div>Supabase not configured.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dormId = await getActiveDormId();
  if (!dormId) return <div>No active dorm.</div>;

  // Find the occupant linked to this user
  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, full_name, classification")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!occupant) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted" />
        <h2 className="text-xl font-semibold">Profile Not Linked</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Your account is not linked to an occupant profile. Personal reports are unavailable.
        </p>
      </div>
    );
  }

  const dataRes = await getOccupantReportingData(dormId, occupant.id);
  if ("error" in dataRes) return <div>Error: {dataRes.error}</div>;
  const data = dataRes;

  const isCleared = data.balance.total <= 0;
  const formatPesos = (val: number) => `₱${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Personal Report</h1>
        <p className="text-sm text-muted-foreground">
          Resident: <span className="font-medium text-foreground">{occupant.full_name}</span> · {occupant.classification}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={!isCleared ? "border-amber-500/50 bg-amber-500/5" : "border-emerald-500/50 bg-emerald-500/5"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${!isCleared ? "text-amber-600" : "text-emerald-600"}`}>
              {formatPesos(data.balance.total)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isCleared ? "Fully cleared" : "Action required"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demerit Points</CardTitle>
            <Gavel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{data.totalPoints} pts</div>
            <p className="text-xs text-muted-foreground mt-1">
              From {data.totalFines} recorded violations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Event Participation</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600">{data.totalEventsAttended}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Events attended this semester
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clearance Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isCleared ? "Cleared" : "Ongoing"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              For active semester
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Ledger Activity
            </CardTitle>
            <CardDescription>Your last 10 financial transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.recentEntries.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.event?.title || entry.fine?.rule?.title || entry.note || "Transaction"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.posted_at), "MMM d, yyyy")} · {entry.ledger.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className={`text-sm font-semibold ${Number(entry.amount_pesos) < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {Number(entry.amount_pesos) < 0 ? "+" : "-"}{formatPesos(Math.abs(Number(entry.amount_pesos)))}
                  </div>
                </div>
              ))}
              {!data.recentEntries.length && (
                <p className="text-sm text-muted-foreground italic text-center py-4">No recent activity found.</p>
              )}
            </div>
            <Button asChild variant="ghost" className="w-full mt-4 text-xs">
              <Link href="/occupant/payments">
                View Full History
                <ArrowRight className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ledger Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Maintenance Fees</span>
                  <span className="font-medium">{formatPesos(data.balance.maintenance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Disciplinary Fines</span>
                  <span className="font-medium text-rose-600">{formatPesos(data.balance.fines)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Event Contributions</span>
                  <span className="font-medium">{formatPesos(data.balance.events)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900">
            <CardHeader>
              <CardTitle className="text-base text-sky-800 dark:text-sky-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Clearance Note
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-sky-700 dark:text-sky-400">
              To be fully cleared for the semester, all categories must have a zero or negative balance. 
              Overpayments in one category (e.g., Maintenance) do not offset balances in others (e.g., Fines).
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
