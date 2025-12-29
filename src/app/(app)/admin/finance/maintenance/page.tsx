import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { ChargeDialog } from "@/components/finance/charge-dialog";

export default async function MaintenancePage() {
  const supabase = await createClient();

  // Fetch occupants and their maintenance balances
  // We can do this efficiently with a query or by fetching all occupants and then aggregate ledger.
  // For V1, getting all occupants + summing ledger in code or SQL is fine.
  // SQL View would be better: `occupant_balances`.

  // Let's query ledger entries for 'adviser_maintenance' and group by occupant.
  // But we need to show ALL active occupants, even with 0 balance.

  const { data: occupants, error } = await supabase
    .from("occupants")
    .select(`
      id,
      dorm_id,
      full_name,
      room_assignments(room(code)),
      ledger_entries!left(amount_pesos, ledger, voided_at)
    `)
    .eq("status", "active")
    .order("full_name");

  if (error) {
    console.error(error);
    return <div>Error loading occupants</div>;
  }

  // Calculate balances
  const rows = occupants.map(occ => {
    let balance = 0;
    // Filter for maintenance ledger and active entries
    const entries = occ.ledger_entries as { ledger: string; voided_at: string | null; amount_pesos: number }[] || [];
    entries.forEach((entry) => {
      if (entry.ledger === 'adviser_maintenance' && !entry.voided_at) {
        balance += Number(entry.amount_pesos);
      }
    });

    // Room code
    const roomCode = occ.room_assignments?.[0]?.room?.code || "No Room";

    return {
      ...occ,
      roomCode,
      balance
    };
  });

  // Sort by balance desc (debtors first)
  rows.sort((a, b) => b.balance - a.balance);

  const totalCollectible = rows.reduce((sum, r) => sum + (r.balance > 0 ? r.balance : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-medium">Maintenance Ledger</h3>
        <div className="flex gap-2">
          <Button variant="outline" disabled>Bulk Charge (Soon)</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collectible</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalCollectible.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Outstanding maintenance fees</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Occupant</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.full_name}</TableCell>
                <TableCell>{row.roomCode}</TableCell>
                <TableCell className={`text-right font-medium ${row.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₱{row.balance.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <ChargeDialog
                      dormId={occupants[0]?.dorm_id || ""} // Fallback if list empty
                      occupantId={row.id}
                      category="adviser_maintenance"
                    />
                    <PaymentDialog
                      dormId={occupants[0]?.dorm_id || ""}
                      occupantId={row.id}
                      category="adviser_maintenance"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">No occupants found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
