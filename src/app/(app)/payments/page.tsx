import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLedgerBalance, getLedgerEntries } from "@/app/actions/finance";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wallet, AlertCircle, CheckCircle } from "lucide-react";

export default async function PaymentsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Supabase is not configured for this environment.
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <div>Unauthorized</div>;

  const { data: occupant } = await supabase
    .from("occupants")
    .select("id, dorm_id")
    .eq("user_id", user.id)
    .single();

  if (!occupant) return <div className="p-6">Occupant record not found. Are you assigned to a room?</div>;

  const balance = await getLedgerBalance(occupant.dorm_id, occupant.id);
  const entries = await getLedgerEntries(occupant.dorm_id, occupant.id);

  if (!balance) return <div className="p-6">Error loading finances.</div>;

  const isCleared = balance.total <= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Payments & Clearance</h1>
        {isCleared ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full font-medium border border-green-200">
            <CheckCircle className="h-5 w-5" />
            <span>Cleared</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-full font-medium border border-red-200">
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
            <div className={`text-2xl font-bold ${balance.total > 0 ? 'text-red-600' : 'text-green-600'}`}>
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
          <div className="rounded-md border overflow-hidden">
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
                    desc = ruleTitle ? `Fine: ${ruleTitle}` : (entry.note || "Fine Violation");
                  }
                  if (entry.event) {
                    desc = `Event: ${entry.event.title}`;
                  }

                  return (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="p-3">{new Date(entry.posted_at).toLocaleDateString()}</td>
                      <td className="p-3">{desc}</td>
                      <td className="p-3 capitalize text-muted-foreground">{entry.ledger.replace('adviser_', '').replace('sa_', '').replace('treasurer_', '')}</td>
                      <td className={`p-3 text-right font-medium ${isPayment || entry.amount_pesos < 0 ? 'text-green-600' : ''}`}>
                        {Number(entry.amount_pesos).toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
                {(!entries || entries.length === 0) && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">No transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
