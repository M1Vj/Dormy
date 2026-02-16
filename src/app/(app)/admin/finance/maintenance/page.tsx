import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";

export default async function MaintenancePage() {
  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

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

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = membership?.role ?? null;
  if (!role || !new Set(["admin", "adviser", "assistant_adviser"]).has(role)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = role === "admin";


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
      room_assignments(room:rooms(code)),
      ledger_entries!left(amount_pesos, ledger, voided_at)
    `)
    .eq("dorm_id", activeDormId)
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

    // Room code - room_assignments is an array with nested room object
    const roomAssignments = occ.room_assignments as unknown;
    const roomCode = (roomAssignments as Array<{ room: { code: string } }>)?.[0]?.room?.code || "No Room";

    return {
      ...occ,
      roomCode,
      balance
    };
  });

  // Sort by balance desc (debtors first)
  rows.sort((a, b) => b.balance - a.balance);

  const totalCollectible = rows.reduce((sum, r) => sum + (r.balance > 0 ? r.balance : 0), 0);
  const dormOptions = await getUserDorms();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-medium">Maintenance Ledger</h3>
        <div className="flex flex-wrap gap-2">
          <ExportXlsxDialog
            report="maintenance-ledger"
            title="Export Maintenance Ledger"
            description="Download maintenance balances and ledger entries."
            defaultDormId={activeDormId}
            dormOptions={dormOptions}
            includeDormSelector={canFilterDorm}
          />
          <Button variant="outline" disabled className="w-full sm:w-auto">Bulk Charge (Soon)</Button>
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

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.roomCode === "No Room" ? "No room assigned" : `Room ${row.roomCode}`}
                  </p>
                </div>
                <p
                  className={`text-right text-sm font-semibold ${
                    row.balance > 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  ₱{row.balance.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChargeDialog
                  dormId={activeDormId}
                  occupantId={row.id}
                  category="adviser_maintenance"
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      Charge
                    </Button>
                  }
                />
                <PaymentDialog
                  dormId={activeDormId}
                  occupantId={row.id}
                  category="adviser_maintenance"
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      Pay
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No occupants found.
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="hidden rounded-md border md:block">
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
                      dormId={activeDormId}
                      occupantId={row.id}
                      category="adviser_maintenance"
                    />
                    <PaymentDialog
                      dormId={activeDormId}
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
