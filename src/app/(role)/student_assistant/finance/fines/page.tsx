import Link from "next/link";
import { ChargeDialog } from "@/components/finance/charge-dialog";
import { CollectionFilters } from "@/components/finance/collection-filters";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type FinesRow = {
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

export default async function FinesCollectionPage({
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
    .eq("user_id", user.id);
  const roles = memberships?.map(m => m.role) ?? [];

  const hasAccess = roles.some(r => new Set(["admin", "student_assistant"]).has(r));

  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = roles.includes("admin");

  const [{ data: occupants, error }, dormOptions] = await Promise.all([
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
  ]);

  if (error) {
    return <div className="p-6 text-sm text-destructive">Error loading occupants.</div>;
  }

  // Calculate total collected across ALL occupants (even inactive)
  const { data: allLedgers } = await supabase
    .from("ledger_entries")
    .select("amount_pesos, entry_type")
    .eq("dorm_id", activeDormId)
    .eq("ledger", "sa_fines")
    .is("voided_at", null);

  const totalCollectedFines = (allLedgers ?? [])
    .filter(entry => entry.entry_type === "payment" || Number(entry.amount_pesos) < 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount_pesos ?? 0)), 0);

  const totalFinesIssued = (allLedgers ?? [])
    .filter(entry => entry.entry_type === "charge" || Number(entry.amount_pesos) > 0)
    .reduce((sum, entry) => sum + Math.abs(Number(entry.amount_pesos ?? 0)), 0);

  const normalizedSearch = search.toLowerCase();

  const rows: FinesRow[] = ((occupants ?? []) as OccupantRow[])
    .map((occupant) => {
      const entries = occupant.ledger_entries ?? [];
      const balance = entries.reduce((sum, entry) => {
        if (entry.ledger !== "sa_fines" || entry.voided_at) {
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
      // Only show occupants who have/had fines, or if they match a search query.
      if (!search && !statusFilter && row.balance === 0) {
        return false;
      }

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

  const activeRole = roles.includes("admin") ? "admin" : roles[0] || "occupant";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fines Collection</h1>
          <p className="text-sm text-muted-foreground">
            Collect fine payments, issue receipts, and manage manual fines. For issuing infraction fines, use the <Link href="/student_assistant/fines" className="underline underline-offset-4 pointer-events-auto">Fines Ledger</Link>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportXlsxDialog
            report="fines-ledger"
            title="Export Fines Ledger"
            description="Download fines balances and ledger entries."
            defaultDormId={activeDormId}
            dormOptions={dormOptions}
            includeDormSelector={canFilterDorm}
          />
          <LedgerOverwriteDialog dormId={activeDormId} />
        </div>
      </div>

      {/* Search & Filter row */}
      <CollectionFilters
        key={`${search}:${statusFilter}`}
        basePath={`/${activeRole}/finance/fines`}
        search={search}
        status={statusFilter}
        placeholder="Search occupant or room..."
        allLabel="All tracked balances"
      />

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Occupants with Fines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Issued Fines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">₱{totalFinesIssued.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Cumulative charges</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalCollectedFines.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Cumulative payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalCollectible.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Pending collection</p>
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
                  category="sa_fines"
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      Charge
                    </Button>
                  }
                />
                <PaymentDialog
                  dormId={activeDormId}
                  occupantId={row.id}
                  category="sa_fines"
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
              No matching occupants found.
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
                    <ChargeDialog dormId={activeDormId} occupantId={row.id} category="sa_fines" />
                    <PaymentDialog dormId={activeDormId} occupantId={row.id} category="sa_fines" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No matching occupants found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
