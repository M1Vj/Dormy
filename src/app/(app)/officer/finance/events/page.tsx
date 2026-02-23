import Link from "next/link";
import { format } from "date-fns";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveDormId, getUserDorms } from "@/lib/dorms";
import { ensureActiveSemesterId, getActiveSemester } from "@/lib/semesters";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { ContributionBatchDialog } from "@/components/finance/contribution-batch-dialog";
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
import { Input } from "@/components/ui/input";

type SearchParams = {
  search?: string | string[];
};

type EventRow = {
  id: string;
  title: string;
  starts_at?: string | null;
  is_competition?: boolean | null;
};

type LedgerEntry = {
  event_id?: string | null;
  amount_pesos?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const parseDeadline = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

export default async function EventsFinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params?.search)?.trim() || "";

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
  const hasAccess = roles.some(r => new Set(["admin", "treasurer"]).has(r));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const canFilterDorm = roles.includes("admin");
  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  if ("error" in semesterResult) {
    return (
      <div className="p-6 text-sm text-destructive">
        {semesterResult.error ?? "Failed to resolve active semester."}
      </div>
    );
  }

  const activeSemester = await getActiveSemester(activeDormId, supabase);

  const [{ data: events, error: eventsError }, { data: entries, error: entriesError }, dormOptions] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, starts_at, is_competition")
        .eq("dorm_id", activeDormId)
        .eq("semester_id", semesterResult.semesterId)
        .order("starts_at", { ascending: false }),
      supabase
        .from("ledger_entries")
        .select("id, event_id, amount_pesos, ledger, voided_at, metadata")
        .eq("dorm_id", activeDormId)
        .eq("ledger", "contributions")
        .is("voided_at", null),
      getUserDorms(),
    ]);

  if (eventsError) {
    return <div className="p-6 text-sm text-destructive">Error loading events.</div>;
  }

  if (entriesError) {
    return <div className="p-6 text-sm text-destructive">Error loading ledger.</div>;
  }

  const normalizedSearch = search.toLowerCase();
  const typedEvents = (events ?? []) as EventRow[];
  const typedEntries = (entries ?? []) as LedgerEntry[];

  const eventStats = typedEvents
    .map((event) => {
      const eventEntries = typedEntries.filter((entry) => entry.event_id === event.id);
      const collected = eventEntries.reduce((sum, entry) => {
        const amount = Number(entry.amount_pesos ?? 0);
        return amount < 0 ? sum + Math.abs(amount) : sum;
      }, 0);
      const charged = eventEntries.reduce((sum, entry) => {
        const amount = Number(entry.amount_pesos ?? 0);
        return amount > 0 ? sum + amount : sum;
      }, 0);
      const deadline =
        eventEntries
          .map((entry) => parseDeadline(entry.metadata?.payable_deadline))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

      return {
        ...event,
        collected,
        charged,
        balance: charged - collected,
        deadline,
      };
    })
    .filter((event) => {
      if (!normalizedSearch) {
        return true;
      }
      return event.title.toLowerCase().includes(normalizedSearch);
    });

  const totalCollected = eventStats.reduce((acc, curr) => acc + curr.collected, 0);
  const totalPending = eventStats.reduce((acc, curr) => acc + curr.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contributions</h1>
          <p className="text-sm text-muted-foreground">
            Track contribution charges, collections, and remaining balances.
          </p>
          {activeSemester ? (
            <p className="text-xs text-muted-foreground">Active semester: {activeSemester.label}</p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <form className="flex w-full gap-2" method="GET">
            <Input
              name="search"
              placeholder="Search event"
              defaultValue={search}
              className="w-full sm:w-52"
            />
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
            {search ? (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link href="/officer/finance/events">Reset</Link>
              </Button>
            ) : null}
          </form>
          <ExportXlsxDialog
            report="event-contributions"
            title="Export Event Contributions"
            description="Download per-event contribution summary and detailed entries."
            defaultDormId={activeDormId}
            dormOptions={dormOptions}
            includeDormSelector={canFilterDorm}
          />
          <LedgerOverwriteDialog dormId={activeDormId} />
          <ContributionBatchDialog
            dormId={activeDormId}
            events={typedEvents}
            trigger={<Button>Add Contribution</Button>}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{eventStats.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">₱{totalPending.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {eventStats.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No events found.
            </CardContent>
          </Card>
        ) : (
          eventStats.map((event) => (
            <Card key={event.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.starts_at ? format(new Date(event.starts_at), "MMM d, yyyy") : "No date"}
                    </p>
                  </div>
                  {event.is_competition ? (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      Competition
                    </span>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Charged</p>
                    <p className="font-medium">₱{event.charged.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Collected</p>
                    <p className="font-medium text-emerald-600">₱{event.collected.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Balance</p>
                    <p className={`font-medium ${event.balance > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                      ₱{event.balance.toFixed(2)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Deadline:{" "}
                  {event.deadline ? format(new Date(event.deadline), "MMM d, yyyy h:mm a") : "Not set"}
                </p>
                <Button asChild size="sm" className="w-full">
                  <Link href={`/officer/finance/events/${event.id}`}>Manage</Link>
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Deadline</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventStats.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">{event.title}</TableCell>
                <TableCell>
                  {event.starts_at ? format(new Date(event.starts_at), "MMM d, yyyy") : "-"}
                </TableCell>
                <TableCell className="text-right">₱{event.charged.toFixed(2)}</TableCell>
                <TableCell className="text-right text-emerald-600">₱{event.collected.toFixed(2)}</TableCell>
                <TableCell
                  className={`text-right font-medium ${event.balance > 0 ? "text-rose-600" : "text-muted-foreground"
                    }`}
                >
                  ₱{event.balance.toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {event.deadline ? format(new Date(event.deadline), "MMM d, yyyy h:mm a") : "Not set"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/officer/finance/events/${event.id}`}>Manage</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {eventStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No events found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
