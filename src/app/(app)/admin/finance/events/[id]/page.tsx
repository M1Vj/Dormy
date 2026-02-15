import { notFound } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId } from "@/lib/dorms";
import { getOccupants } from "@/app/actions/occupants";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const dormId = await getActiveDormId();

  if (!dormId) {
    return <div>Dorm not found</div>;
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
    .eq("dorm_id", dormId)
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


  // 1. Fetch Event Details
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, starts_at, description") // Added description just in case
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    console.error(eventError);
    notFound();
  }

  // 2. Fetch All Occupants
  // We want all active occupants to show who hasn't paid.
  // Assuming 'active' status is what we want.
  const occupants = await getOccupants(dormId, { status: "active" });

  // 3. Fetch Ledger Entries for this Event
  const { data: entries, error: entriesError } = await supabase
    .from("ledger_entries")
    .select("occupant_id, amount_pesos, entry_type, voided_at")
    .eq("dorm_id", dormId)
    .eq("ledger", "treasurer_events")
    .eq("event_id", eventId)
    .is("voided_at", null);

  if (entriesError) {
    console.error(entriesError);
    return <div>Error loading ledger entries</div>;
  }

  // 4. Process Data
  const occupantStatus = occupants.map((occupant) => {
    // Find entries for this occupant
    const occupantEntries = entries.filter((e) => e.occupant_id === occupant.id);

    const paid = occupantEntries.reduce((sum, e) => {
      // Payments are negative, usually.
      // Or we can check entry_type === 'payment'
      if (e.amount_pesos < 0) {
        return sum + Math.abs(e.amount_pesos);
      }
      return sum;
    }, 0);

    const charged = occupantEntries.reduce((sum, e) => {
      // Charges are positive
      if (e.amount_pesos > 0) {
        return sum + e.amount_pesos;
      }
      return sum;
    }, 0);

    // Determine status
    // If charged > 0, then paid >= charged?
    // If no charge, maybe just check if paid > 0?
    // For now:
    // - If charged > 0: PAID if paid >= charged, else PENDING
    // - If charged == 0: PAID if paid > 0, else ... UNPAID? Or just "-" if no charge?
    // Let's assume if they paid anything, they are "Paid" or "Participating"
    // If there is a charge, strict check.
    
    let status: 'paid' | 'unpaid' | 'partial' = 'unpaid';
    if (charged > 0) {
        if (paid >= charged) status = 'paid';
        else if (paid > 0) status = 'partial';
        else status = 'unpaid';
    } else {
        // No explicit charge recorded.
        if (paid > 0) status = 'paid';
        else status = 'unpaid';
    }

    return {
      ...occupant,
      paid,
      charged,
      status,
    };
  });

  // Calculate Aggregates
  const totalCollected = occupantStatus.reduce((acc, curr) => acc + curr.paid, 0);
  // Expected: Sum of charges. If no charges exist globally, maybe this is 0.
  const totalExpected = occupantStatus.reduce((acc, curr) => acc + curr.charged, 0);
  
  const payersCount = occupantStatus.filter(o => o.paid > 0).length;
  const participationRate = occupants.length > 0 
    ? (payersCount / occupants.length) * 100 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/finance/events">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{event.title}</h2>
          <p className="text-muted-foreground">
            {event.starts_at ? format(new Date(event.starts_at), "MMMM d, yyyy") : "No date"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₱{totalCollected.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{totalExpected.toFixed(2)}
            </div>
            {totalExpected === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No charges recorded</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Participation Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {participationRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {payersCount} / {occupants.length} occupants
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Occupant Payments</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Occupant</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {occupantStatus.map((occ) => (
                    <TableRow key={occ.id}>
                    <TableCell>
                        <div className="font-medium">{occ.full_name}</div>
                        <div className="text-xs text-muted-foreground">{occ.student_id}</div>
                    </TableCell>
                    <TableCell>
                        {occ.current_room_assignment?.room 
                            ? (Array.isArray(occ.current_room_assignment.room) 
                                ? occ.current_room_assignment.room[0].code 
                                : occ.current_room_assignment.room.code)
                            : <span className="text-muted-foreground italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-center">
                        {occ.status === 'paid' && (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                                <CheckCircle className="mr-1 h-3 w-3" /> Paid
                            </Badge>
                        )}
                        {occ.status === 'partial' && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
                                <AlertCircle className="mr-1 h-3 w-3" /> Partial
                            </Badge>
                        )}
                        {occ.status === 'unpaid' && (
                             <Badge variant="outline" className="text-muted-foreground">
                                <XCircle className="mr-1 h-3 w-3" /> Unpaid
                            </Badge>
                        )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                        {occ.paid > 0 ? `₱${occ.paid.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                        <PaymentDialog
                            dormId={dormId}
                            occupantId={occ.id}
                            category="treasurer_events"
                            eventId={eventId}
                            trigger={
                                <Button size="sm" variant="outline">
                                    Record Pay
                                </Button>
                            }
                        />
                    </TableCell>
                    </TableRow>
                ))}
                 {occupantStatus.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                            No occupants found.
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
