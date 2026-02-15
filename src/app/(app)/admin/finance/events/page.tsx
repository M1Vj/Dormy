import Link from "next/link";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
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

export default async function EventsFinancePage() {
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
  if (!role || !new Set(["admin", "treasurer"]).has(role)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = role === "admin";


  // Fetch events with ledger summary
  // We want to know: Total Charged vs Total Collected per event.
  // This is complex.
  // Strategy: Get all events. Get all 'treasurer_events' ledger entries.
  // Aggregate in code.

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, starts_at, is_competition")
    .eq("dorm_id", activeDormId)
    .order("starts_at", { ascending: false });

  if (eventsError) return <div>Error loading events</div>;

  const { data: entries, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("id, event_id, amount_pesos, ledger, entry_type, voided_at")
    .eq("dorm_id", activeDormId)
    .eq("ledger", "treasurer_events")
    .is("voided_at", null);

  if (entriesError) return <div>Error loading ledger</div>;

  interface LedgerEntry {
    event_id: string | null;
    amount_pesos: number;
    ledger: string;
    entry_type: string;
    voided_at: string | null;
  }

  const eventStats = events.map(event => {
    const eventEntries = (entries as LedgerEntry[]).filter((e) => e.event_id === event.id);
    const collected = eventEntries.reduce((sum: number, e) =>
      e.amount_pesos < 0 ? sum + Math.abs(e.amount_pesos) : sum, 0);
    const charged = eventEntries.reduce((sum: number, e) =>
      e.amount_pesos > 0 ? sum + e.amount_pesos : sum, 0);

    return {
      ...event,
      collected,
      charged,
      balance: charged - collected // collectible
    };
  });

  // Calculate totals
  const totalCollected = eventStats.reduce((acc, curr) => acc + curr.collected, 0);
  const totalPending = eventStats.reduce((acc, curr) => acc + (curr.charged - curr.collected), 0);
  const dormOptions = await getUserDorms();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-medium">Events Ledger</h3>
        <ExportXlsxDialog
          report="event-contributions"
          title="Export Event Contributions"
          description="Download per-event contribution summary and detailed entries."
          defaultDormId={activeDormId}
          dormOptions={dormOptions}
          includeDormSelector={canFilterDorm}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₱{totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₱{totalPending.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventStats.map((ev) => (
              <TableRow key={ev.id}>
                <TableCell className="font-medium">{ev.title}</TableCell>
                <TableCell>{ev.starts_at ? format(new Date(ev.starts_at), "MMM d, yyyy") : "-"}</TableCell>
                <TableCell className="text-right">₱{ev.charged.toFixed(2)}</TableCell>
                <TableCell className="text-right text-green-600">₱{ev.collected.toFixed(2)}</TableCell>
                <TableCell className={`text-right font-medium ${ev.balance > 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  ₱{ev.balance.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/finance/events/${ev.id}`}>Manage</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {eventStats.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">No events found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
