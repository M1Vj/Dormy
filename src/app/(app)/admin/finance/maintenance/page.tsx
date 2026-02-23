import Link from "next/link";
import { format } from "date-fns";

import { ChargeDialog } from "@/components/finance/charge-dialog";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { MaintenanceBulkChargeDialog } from "@/components/finance/maintenance-bulk-charge-dialog";
import { MaintenanceExpenseDialog } from "@/components/finance/maintenance-expense-dialog";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { getExpenses } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

type LedgerEntry = {
  ledger?: string | null;
  voided_at?: string | null;
  amount_pesos?: number | string | null;
};

type RoomRef = {
  code?: string | null;
};

type RoomAssignment = {
  room?: RoomRef | RoomRef[] | null;
};

type OccupantRow = {
  id: string;
  full_name?: string | null;
  room_assignments?: RoomAssignment[] | RoomAssignment | null;
  ledger_entries?: LedgerEntry[] | null;
};

type MaintenanceRow = {
  id: string;
  full_name: string;
  roomCode: string | null;
  balance: number;
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const asFirst = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params?.search)?.trim() || "";
  const statusFilter = normalizeParam(params?.status)?.trim() || "";

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

  const { data: memberships } = await supabase.from("dorm_memberships")
    .select("role")
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id)
    ;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set(["admin", "adviser", "student_assistant"]).has(r));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = roles.includes("admin");

  const [{ data: occupants, error }, dormOptions, expensesResult] = await Promise.all([
    supabase
      .from("occupants")
      .select(`
        id,
        full_name,
        room_assignments(room:rooms(code)),
        ledger_entries!left(amount_pesos, ledger, voided_at, entry_type)
      `)
      .eq("dorm_id", activeDormId)
      .eq("status", "active")
      .order("full_name"),
    getUserDorms(),
    getExpenses(activeDormId, { status: "approved" }),
  ]);

  if (error) {
    return <div className="p-6 text-sm text-destructive">Error loading occupants.</div>;
  }

  // Calculate total collected across ALL occupants (even inactive)
  const { data: allLedgers } = await supabase
    .from("ledger_entries")
    .select("amount_pesos")
    .eq("dorm_id", activeDormId)
    .eq("ledger", "maintenance_fee")
    .eq("entry_type", "payment")
    .is("voided_at", null);

  const totalCollectedMaintenance = (allLedgers ?? []).reduce(
    (sum, entry) => sum + Math.abs(Number(entry.amount_pesos ?? 0)),
    0
  );

  const approvedExpenses = "data" in expensesResult && expensesResult.data
    ? expensesResult.data.filter(e => e.category === "maintenance_fee")
    : [];

  const totalMaintenanceExpenses = approvedExpenses.reduce(
    (sum, e) => sum + Number(e.amount_pesos),
    0
  );

  const netMaintenanceFund = totalCollectedMaintenance - totalMaintenanceExpenses;

  const normalizedSearch = search.toLowerCase();

  const rows: MaintenanceRow[] = ((occupants ?? []) as OccupantRow[])
    .map((occupant) => {
      const entries = occupant.ledger_entries ?? [];
      const balance = entries.reduce((sum, entry) => {
        if (entry.ledger !== "maintenance_fee" || entry.voided_at) {
          return sum;
        }
        return sum + Number(entry.amount_pesos ?? 0);
      }, 0);

      const assignment = asFirst(occupant.room_assignments ?? null);
      const room = asFirst(assignment?.room ?? null);

      return {
        id: occupant.id,
        full_name: occupant.full_name?.trim() || "Unnamed occupant",
        roomCode: room?.code ?? null,
        balance,
      };
    })
    .filter((row) => {
      const matchesSearch =
        !normalizedSearch ||
        row.full_name.toLowerCase().includes(normalizedSearch) ||
        (row.roomCode ?? "").toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        !statusFilter ||
        (statusFilter === "outstanding" && row.balance > 0) ||
        (statusFilter === "cleared" && row.balance <= 0);

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => b.balance - a.balance);

  const totalCollectible = rows.reduce((sum, row) => sum + (row.balance > 0 ? row.balance : 0), 0);

  const primaryRole = roles.includes("admin") ? "admin" : roles[0] || "occupant";

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Track maintenance balances and collect payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportXlsxDialog
            report="maintenance-ledger"
            title="Export Maintenance Ledger"
            description="Download maintenance balances and ledger entries."
            defaultDormId={activeDormId}
            dormOptions={dormOptions}
            includeDormSelector={canFilterDorm}
          />
          <LedgerOverwriteDialog dormId={activeDormId} />
        </div>
      </div>

      {/* Search & Filter row */}
      <form method="GET" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          name="search"
          placeholder="Search occupant or room..."
          defaultValue={search}
          className="sm:max-w-xs"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-[170px]"
        >
          <option value="">All balances</option>
          <option value="outstanding">Outstanding only</option>
          <option value="cleared">Cleared only</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filter
        </Button>
        {search || statusFilter ? (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href={`/${primaryRole}/finance/maintenance`}>Reset</Link>
          </Button>
        ) : null}
      </form>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Maintenance Fund</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${netMaintenanceFund < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              ₱{netMaintenanceFund.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Collected minus expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collectible</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalCollectible.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Outstanding balances</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operations</CardTitle>
          </CardHeader>
          <CardContent>
            {roles.some(r => new Set(["admin", "adviser"]).has(r)) ? (
              <MaintenanceBulkChargeDialog dormId={activeDormId} />
            ) : (
              <Button variant="outline" disabled className="w-full">
                Only for Admin/Adviser
              </Button>
            )}
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
                    {row.roomCode ? `Room ${row.roomCode}` : "No room assigned"}
                  </p>
                </div>
                <p
                  className={`text-right text-sm font-semibold ${row.balance > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                >
                  ₱{row.balance.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChargeDialog
                  dormId={activeDormId}
                  occupantId={row.id}
                  category="maintenance_fee"
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      Charge
                    </Button>
                  }
                />
                <PaymentDialog
                  dormId={activeDormId}
                  occupantId={row.id}
                  category="maintenance_fee"
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
                <TableCell>{row.roomCode ?? "No room"}</TableCell>
                <TableCell
                  className={`text-right font-medium ${row.balance > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                >
                  ₱{row.balance.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <ChargeDialog dormId={activeDormId} occupantId={row.id} category="maintenance_fee" />
                    <PaymentDialog dormId={activeDormId} occupantId={row.id} category="maintenance_fee" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No occupants found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Maintenance Expenses</h2>
            <p className="text-sm text-muted-foreground">
              Approved expenses deducted from the maintenance fund.
            </p>
          </div>
          {roles.some(r => new Set(["admin", "adviser", "officer"]).has(r)) && (
            <MaintenanceExpenseDialog dormId={activeDormId} />
          )}
        </div>

        <div className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedExpenses.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="font-medium">{exp.title}</TableCell>
                  <TableCell>
                    {format(new Date(exp.purchased_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right font-medium text-rose-600">
                    -₱{Number(exp.amount_pesos).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                    {exp.description || "—"}
                  </TableCell>
                </TableRow>
              ))}
              {approvedExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No approved maintenance expenses found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 md:hidden">
          {approvedExpenses.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No approved maintenance expenses found.
              </CardContent>
            </Card>
          ) : (
            approvedExpenses.map((exp) => (
              <Card key={exp.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{exp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(exp.purchased_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <span className="font-semibold text-rose-600">
                      -₱{Number(exp.amount_pesos).toFixed(2)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {exp.description || "—"}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
