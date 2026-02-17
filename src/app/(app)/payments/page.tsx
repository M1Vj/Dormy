import Link from "next/link";

import { getLedgerBalance, getLedgerEntries } from "@/app/actions/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId } from "@/lib/dorms";
import { AlertCircle, CheckCircle, Wallet } from "lucide-react";

function StaffFinanceHub({ role }: { role: string }) {
  const canManageEvents = new Set(["admin", "treasurer"]).has(role);
  const canManageMaintenance = new Set(["admin", "adviser", "assistant_adviser"]).has(role);
  const canManageFines = new Set(["admin", "student_assistant"]).has(role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Your role does not have an occupant payment profile. Use staff ledgers below.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {canManageEvents ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Contributions</CardTitle>
              <CardDescription>Track event charges and collections.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/finance/events">Open events ledger</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canManageMaintenance ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maintenance Ledger</CardTitle>
              <CardDescription>Manage adviser maintenance entries.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/finance/maintenance">Open maintenance ledger</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canManageFines ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fines Ledger</CardTitle>
              <CardDescription>Issue fines and maintain fine rules.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/fines">Open fines ledger</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canManageEvents || role === "officer" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Operating Expenses</CardTitle>
              <CardDescription>
                {role === "officer"
                  ? "Submit purchase receipts for approval."
                  : "Review and track logic purchases."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/admin/finance/expenses">Open expenses ledger</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {!canManageEvents && !canManageMaintenance && !canManageFines ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No finance ledgers are assigned to your current role.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default async function PaymentsPage() {
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
    return <div className="p-6 text-sm text-muted-foreground">Unauthorized.</div>;
  }

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? "occupant";

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, dorm_id")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!occupant) {
    return <StaffFinanceHub role={role} />;
  }

  const balance = await getLedgerBalance(occupant.dorm_id, occupant.id);
  const entries = await getLedgerEntries(occupant.dorm_id, occupant.id);

  if (!balance) {
    return <div className="p-6">Error loading finances.</div>;
  }

  const isCleared = balance.total <= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payments & Clearance</h1>
        {isCleared ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-green-200 bg-green-100 px-4 py-2 font-medium text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span>Cleared</span>
          </div>
        ) : (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-200 bg-red-100 px-4 py-2 font-medium text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>Not Cleared</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance.total > 0 ? "text-red-600" : "text-green-600"}`}>
              ₱{balance.total.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Across all ledgers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{balance.maintenance.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{balance.fines.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{balance.events.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>All transactions recorded for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {entries?.map((entry) => {
              const isPayment = Number(entry.amount_pesos) < 0;
              let desc = entry.note || entry.entry_type;
              if (entry.fine) {
                const ruleTitle = entry.fine.rule?.title;
                desc = ruleTitle ? `Fine: ${ruleTitle}` : entry.note || "Fine Violation";
              }
              if (entry.event) {
                desc = `Event: ${entry.event.title}`;
              }

              return (
                <div key={entry.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{desc}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.posted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${isPayment || entry.amount_pesos < 0 ? "text-green-600" : "text-foreground"
                        }`}
                    >
                      ₱{Number(entry.amount_pesos).toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs capitalize text-muted-foreground">
                    {entry.ledger
                      .replace("adviser_", "")
                      .replace("sa_", "")
                      .replace("treasurer_", "")}
                  </p>
                </div>
              );
            })}
            {!entries || entries.length === 0 ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No transactions found.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-hidden rounded-md border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="p-3 text-left font-medium">Date</th>
                  <th className="p-3 text-left font-medium">Description</th>
                  <th className="p-3 text-left font-medium">Category</th>
                  <th className="p-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries?.map((entry) => {
                  const isPayment = Number(entry.amount_pesos) < 0;

                  let desc = entry.note || entry.entry_type;
                  if (entry.fine) {
                    const ruleTitle = entry.fine.rule?.title;
                    desc = ruleTitle ? `Fine: ${ruleTitle}` : entry.note || "Fine Violation";
                  }
                  if (entry.event) {
                    desc = `Event: ${entry.event.title}`;
                  }

                  return (
                    <tr key={entry.id} className="border-b last:border-0 transition-colors hover:bg-muted/10">
                      <td className="p-3">{new Date(entry.posted_at).toLocaleDateString()}</td>
                      <td className="p-3">{desc}</td>
                      <td className="p-3 capitalize text-muted-foreground">
                        {entry.ledger
                          .replace("adviser_", "")
                          .replace("sa_", "")
                          .replace("treasurer_", "")}
                      </td>
                      <td
                        className={`p-3 text-right font-medium ${isPayment || entry.amount_pesos < 0 ? "text-green-600" : ""
                          }`}
                      >
                        ₱{Number(entry.amount_pesos).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {!entries || entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No transactions found.
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
