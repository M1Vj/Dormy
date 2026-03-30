import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle, ArrowLeft, CheckCircle, XCircle } from "lucide-react";

import { getOccupants } from "@/app/actions/occupants";
import { ContributionBatchDialog } from "@/components/finance/contribution-batch-dialog";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { PublicShareDialog } from "@/components/finance/public-share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCanonicalContributionCartItems } from "@/lib/contribution-store";
import {
  getContributionChargeAmount,
  getContributionCollectedAmount,
  getContributionSettlementStatus,
  isContributionPaidElsewhere,
  isOptionalContributionDeclined,
} from "@/lib/contribution-ledger";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId, getActiveSemester } from "@/lib/semesters";
import {
  getStoreContributionPriceRange,
  normalizeStoreItems,
  type CartItem,
  type StoreItem,
} from "@/lib/store-pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = {
  id: string;
};

type SearchParams = {
  search?: string | string[];
  status?: string | string[];
};

type RoomRef = {
  code?: string | null;
};

type AssignmentRef = {
  room?: RoomRef | RoomRef[] | null;
};

type OccupantRow = {
  id: string;
  full_name?: string | null;
  student_id?: string | null;
  current_room_assignment?: AssignmentRef | null;
};

type EntryRow = {
  occupant_id?: string | null;
  entry_type?: string;
  amount_pesos?: number | string | null;
  posted_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OccupantWithStatus = OccupantRow & {
  paid: number;
  charged: number;
  status: "paid" | "partial" | "unpaid" | "declined" | "paid_elsewhere";
  deadline: string | null;
  paymentDate: string | null;
  overdue: boolean;
  cartItems: CartItem[];
  paidElsewhereLocation: string | null;
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : undefined;
  }
  return value;
};

const asFirst = <T,>(value?: T | T[] | null) => (Array.isArray(value) ? value[0] : value);

const getRoomCode = (occupant: OccupantRow) => {
  const room = asFirst(occupant.current_room_assignment?.room ?? null);
  return room?.code ?? null;
};

function StatusBadge({ status }: { status: OccupantWithStatus["status"] }) {
  if (status === "paid_elsewhere") {
    return (
      <Badge variant="outline" className="border-sky-300 text-sky-700 hover:bg-sky-50">
        <CheckCircle className="mr-1 h-3 w-3" />
        Paid Elsewhere
      </Badge>
    );
  }

  if (status === "declined") {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
        <XCircle className="mr-1 h-3 w-3" />
        Declined
      </Badge>
    );
  }

  if (status === "paid") {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle className="mr-1 h-3 w-3" />
        Paid
      </Badge>
    );
  }

  if (status === "partial") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-200">
        <AlertCircle className="mr-1 h-3 w-3" />
        Partial
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      <XCircle className="mr-1 h-3 w-3" />
      Unpaid
    </Badge>
  );
}

function parseDeadline(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function CartItemsRenderer({ items, storeItems }: { items: CartItem[]; storeItems: StoreItem[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 min-w-0 space-y-2 rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
      <div className="mb-1 border-b pb-1 font-medium text-muted-foreground">Order Details</div>
      {items.map((item, idx) => {
        const sItem = storeItems.find((s) => s.id === item.item_id);
        const itemName = sItem ? sItem.name : "Unknown Item";
        const optionsTxt =
          item.options?.length > 0
            ? `(${item.options.map((option) => `${option.name ? `${option.name}: ` : ""}${option.value}`).join(", ")})`
            : "";

        return (
          <div key={idx} className="grid min-w-0 gap-1 border-b border-border/40 pb-2 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
            <div className="min-w-0 whitespace-normal text-foreground [overflow-wrap:anywhere]">
              <span className="font-semibold">{item.quantity}x</span> {itemName} {optionsTxt}
            </div>
            <div className="text-left font-mono text-muted-foreground sm:shrink-0 sm:whitespace-nowrap sm:text-right">
              ₱{item.subtotal?.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function EventDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id: eventId }, paramValues] = await Promise.all([params, searchParams]);
  const search = normalizeParam(paramValues?.search)?.trim() || "";
  const statusFilter = normalizeParam(paramValues?.status)?.trim() || "";

  const dormId = await getActiveDormId();
  if (!dormId) {
    return <div className="p-6 text-sm text-muted-foreground">Dorm not found.</div>;
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
    .eq("dorm_id", dormId)
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

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    return (
      <div className="p-6 text-sm text-destructive">
        {semesterResult.error ?? "Failed to resolve active semester."}
      </div>
    );
  }

  const activeSemester = await getActiveSemester(dormId, supabase);

  const [{ data: event, error: eventError }, occupants, { data: entries, error: entriesError }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, starts_at, description")
        .eq("id", eventId)
        .eq("dorm_id", dormId)
        .eq("semester_id", semesterResult.semesterId)
        .maybeSingle(),
      getOccupants(dormId, { status: "active" }),
      supabase
        .from("ledger_entries")
        .select("occupant_id, entry_type, amount_pesos, posted_at, metadata")
        .eq("dorm_id", dormId)
        .eq("ledger", "contributions")
        .eq("event_id", eventId)
        .is("voided_at", null),
    ]);

  if (eventError || !event) {
    notFound();
  }

  if (entriesError) {
    return <div className="p-6 text-sm text-destructive">Error loading ledger entries.</div>;
  }

  const occupantRows = (occupants ?? []) as OccupantRow[];
  const entryRows = (entries ?? []) as EntryRow[];
  const nowIso = new Date().toISOString();
  const contributionId =
    entryRows
      .map((entry) => {
        const rawContributionId =
          entry.metadata?.contribution_id ?? entry.metadata?.payable_batch_id ?? null;
        return typeof rawContributionId === "string" && rawContributionId.trim().length > 0
          ? rawContributionId.trim()
          : null;
      })
      .find((value): value is string => Boolean(value)) ?? eventId;
  const isOptional = entryRows.map((entry) => entry.metadata?.is_optional === true).find(Boolean) ?? false;
  const isStore = entryRows.map((entry) => entry.metadata?.is_store === true).find(Boolean) ?? false;
  const storeItems = normalizeStoreItems(
    entryRows
    .map((entry) => Array.isArray(entry.metadata?.store_items) ? entry.metadata.store_items : [])
    .find((items) => items.length > 0) ?? []
  );
  const storePriceRange = isStore ? getStoreContributionPriceRange(storeItems) : null;
  const storeBaselineAmount = Number((storePriceRange?.min ?? 0).toFixed(2));

  const occupantStatus: OccupantWithStatus[] = occupantRows.map((occupant) => {
    const occupantEntries = entryRows.filter((entry) => entry.occupant_id === occupant.id);
    const chargeEntries = occupantEntries.filter((entry) => entry.entry_type !== "payment");
    const declined = occupantEntries.some((entry) => isOptionalContributionDeclined(entry.metadata));
    const paidElsewhere = occupantEntries.some((entry) => isContributionPaidElsewhere(entry.metadata));

    const paid = occupantEntries.reduce(
      (sum, entry) => sum + getContributionCollectedAmount(entry.entry_type, entry.amount_pesos),
      0
    );

    const rawCharged = occupantEntries.reduce(
      (sum, entry) => sum + getContributionChargeAmount(entry.entry_type, entry.amount_pesos),
      0
    );
    const charged =
      isStore && rawCharged <= 0 && !declined && !paidElsewhere
        ? storeBaselineAmount
        : Number(rawCharged.toFixed(2));

    const status = getContributionSettlementStatus({
      payable: charged,
      paid,
      remaining: charged - paid,
      declined,
      paidElsewhere,
    });

    const deadline = chargeEntries
      .map((entry) => parseDeadline(entry.metadata?.payable_deadline))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const paymentDateCandidates = [
      ...occupantEntries
        .filter((entry) => entry.entry_type === "payment")
        .map((entry) =>
          typeof entry.posted_at === "string" && entry.posted_at.trim().length > 0
            ? entry.posted_at
            : null
        ),
      ...occupantEntries
        .map((entry) =>
          typeof entry.metadata?.paid_elsewhere_at === "string" &&
          entry.metadata.paid_elsewhere_at.trim().length > 0
            ? entry.metadata.paid_elsewhere_at.trim()
            : null
        ),
    ].filter((value): value is string => Boolean(value));
    const paymentDate = paymentDateCandidates.sort().at(-1) ?? null;

    const overdue =
      deadline !== null &&
      deadline < nowIso &&
      charged > 0 &&
      paid < charged &&
      !declined &&
      !paidElsewhere;
    const paidElsewhereLocation =
      occupantEntries
        .map((entry) =>
          typeof entry.metadata?.paid_elsewhere_location === "string" &&
          entry.metadata.paid_elsewhere_location.trim().length > 0
            ? entry.metadata.paid_elsewhere_location.trim()
            : null
        )
        .find((value): value is string => Boolean(value && value.trim().length > 0)) ?? null;

    const cartItems = getCanonicalContributionCartItems(
      occupantEntries.map((entry) => ({
        entryType: entry.entry_type ?? null,
        cartItems: entry.metadata?.cart_items,
        amountPesos: entry.amount_pesos,
      })),
      storeItems
    );

    return {
      ...occupant,
      paid,
      charged,
      status,
      deadline,
      paymentDate,
      overdue,
      cartItems,
      paidElsewhereLocation,
    };
  });

  const normalizedSearch = search.toLowerCase();
  const filteredOccupants = occupantStatus.filter((occupant) => {
    const matchesSearch =
      !normalizedSearch ||
      (occupant.full_name ?? "").toLowerCase().includes(normalizedSearch) ||
      (occupant.student_id ?? "").toLowerCase().includes(normalizedSearch);

    const matchesStatus = !statusFilter || occupant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCollected = occupantStatus.reduce((acc, curr) => acc + curr.paid, 0);
  const totalExpected = occupantStatus.reduce((acc, curr) => acc + curr.charged, 0);
  const payersCount = occupantStatus.filter((occupant) => occupant.paid > 0).length;
  const participationRate = occupantRows.length > 0 ? (payersCount / occupantRows.length) * 100 : 0;
  const overdueCount = occupantStatus.filter((occupant) => occupant.overdue).length;
  const eventDeadline =
    entryRows
      .map((entry) => parseDeadline(entry.metadata?.payable_deadline))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/officer/contributions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
            <p className="text-sm text-muted-foreground">
              {event.starts_at ? format(new Date(event.starts_at), "MMMM d, yyyy") : "No date"}
            </p>
            {activeSemester ? (
              <p className="text-xs text-muted-foreground">{activeSemester.label}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LedgerOverwriteDialog dormId={dormId} />
          <PublicShareDialog
            dormId={dormId}
            entityId={eventId}
            entityType="event"
            title={event.title}
          />
          <ContributionBatchDialog
            dormId={dormId}
            eventId={eventId}
            trigger={<Button>Create contribution</Button>}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalExpected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Participation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{participationRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">{payersCount} payers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Visible Occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{filteredOccupants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payable Deadline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">
              {eventDeadline ? format(new Date(eventDeadline), "MMM d, yyyy h:mm a") : "Not set"}
            </div>
            <p className="text-xs text-muted-foreground">
              {overdueCount} overdue occupant{overdueCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Occupant payments</CardTitle>
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_180px_auto]" method="GET">
            <Input
              name="search"
              placeholder="Search occupant or ID"
              defaultValue={search}
              className="w-full"
            />
            <select
              name="status"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={statusFilter}
            >
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="paid_elsewhere">Paid Elsewhere</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="declined">Declined</option>
            </select>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm" className="w-full">
                Filter
              </Button>
              {search || statusFilter ? (
                <Button asChild type="button" variant="ghost" size="sm" className="w-full">
                  <Link href={`/officer/contributions/${eventId}`}>Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {filteredOccupants.length === 0 ? (
              <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                No occupants found.
              </div>
            ) : (
              filteredOccupants.map((occupant) => {
                const roomCode = getRoomCode(occupant);

                return (
                  <div key={occupant.id} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{occupant.full_name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">
                          {roomCode ? `Room ${roomCode}` : "No room"}
                          {occupant.student_id ? ` · ${occupant.student_id}` : ""}
                        </p>
                        {isStore && occupant.cartItems?.length > 0 && (
                          <CartItemsRenderer items={occupant.cartItems} storeItems={storeItems} />
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={occupant.status} />
                        {occupant.status === "paid_elsewhere" && occupant.paidElsewhereLocation ? (
                          <p className="max-w-[10rem] text-right text-[10px] text-sky-700 [overflow-wrap:anywhere]">
                            {occupant.paidElsewhereLocation}
                          </p>
                        ) : null}
                        {occupant.overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Overdue
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Charged</span>
                      <span className="font-mono">
                        {occupant.charged > 0 ? `₱${occupant.charged.toFixed(2)}` : "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="font-mono">{occupant.paid > 0 ? `₱${occupant.paid.toFixed(2)}` : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Payment date</span>
                      <span>
                        {occupant.paymentDate
                          ? format(new Date(occupant.paymentDate), "MMM d, yyyy h:mm a")
                          : "Not paid"}
                      </span>
                    </div>
                    {occupant.status === "paid_elsewhere" && occupant.paidElsewhereLocation ? (
                      <p className="text-xs text-sky-700">
                        Paid elsewhere: {occupant.paidElsewhereLocation}
                      </p>
                    ) : null}
                    <PaymentDialog
                      dormId={dormId}
                      occupantId={occupant.id}
                      category="contributions"
                      eventId={eventId}
                      eventTitle={event.title}
                      metadata={{
                        contribution_id: contributionId,
                        is_optional: isOptional,
                        is_store: isStore,
                        store_items: storeItems,
                        remaining_balance: Number((occupant.charged - occupant.paid).toFixed(2)),
                      }}
                      trigger={
                        <Button size="sm" variant="outline" className="w-full">
                          Record Payment
                        </Button>
                      }
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Occupant</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Payment Date</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOccupants.map((occupant) => (
                  <TableRow key={occupant.id} className="border-border/50 hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-medium">{occupant.full_name}</div>
                      <div className="text-xs text-muted-foreground">{occupant.student_id ?? "-"}</div>
                      {isStore && occupant.cartItems?.length > 0 && (
                        <div className="mt-2 w-full min-w-0 max-w-[32rem] xl:max-w-[40rem]">
                          <CartItemsRenderer items={occupant.cartItems} storeItems={storeItems} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">{getRoomCode(occupant) ?? <span className="italic text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-right font-mono align-top">
                      {occupant.charged > 0 ? `₱${occupant.charged.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono align-top">
                      {occupant.paid > 0 ? `₱${occupant.paid.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right text-xs align-top">
                      {occupant.paymentDate
                        ? format(new Date(occupant.paymentDate), "MMM d, yyyy h:mm a")
                        : "Not paid"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={occupant.status} />
                        {occupant.status === "paid_elsewhere" && occupant.paidElsewhereLocation ? (
                          <p className="max-w-[12rem] text-center text-[10px] text-sky-700 [overflow-wrap:anywhere]">
                            {occupant.paidElsewhereLocation}
                          </p>
                        ) : null}
                        {occupant.overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Overdue
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <PaymentDialog
                        dormId={dormId}
                        occupantId={occupant.id}
                        category="contributions"
                        eventId={eventId}
                        eventTitle={event.title}
                        metadata={{
                          contribution_id: contributionId,
                          is_optional: isOptional,
                          is_store: isStore,
                          store_items: storeItems,
                          remaining_balance: Number((occupant.charged - occupant.paid).toFixed(2)),
                        }}
                        trigger={
                          <Button size="sm" variant="outline">
                            Record Pay
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOccupants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No occupants found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
