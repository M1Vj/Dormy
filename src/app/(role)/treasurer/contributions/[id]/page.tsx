import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle, ArrowLeft, CheckCircle, XCircle } from "lucide-react";

import { getOccupants } from "@/app/actions/occupants";
import { ExportXlsxDialog } from "@/components/export/export-xlsx-dialog";
import { ContributionDetailsFilters } from "@/components/finance/contribution-details-filters";
import { ContributionPayableOverrideDialog } from "@/components/finance/contribution-payable-override-dialog";
import { LedgerOverwriteDialog } from "@/components/finance/ledger-overwrite-dialog";
import { PaymentDialog } from "@/components/finance/payment-dialog";
import { Badge } from "@/components/ui/badge";
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
import { getActiveDormId } from "@/lib/dorms";
import { getActiveSemester } from "@/lib/semesters";
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
  status?: "active" | "left" | "removed";
};

type EntryRow = {
  id: string;
  semester_id?: string | null;
  occupant_id?: string | null;
  entry_type: string;
  amount_pesos?: number | string | null;
  event_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OccupantWithStatus = OccupantRow & {
  payable: number;
  paid: number;
  remaining: number;
  paymentStatus: "paid" | "partial" | "unpaid";
  deadline: string | null;
  overdue: boolean;
  cartItems: any[];
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

function StatusBadge({ status }: { status: OccupantWithStatus["paymentStatus"] }) {
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

function CartItemsRenderer({ items, storeItems }: { items: any[]; storeItems: any[] }) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  const validItems = items.filter(Boolean);
  if (validItems.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-2 text-xs">
      <div className="font-medium text-muted-foreground mb-1 border-b pb-1">Order Details</div>
      {validItems.map((item, idx) => {
        const sItem = storeItems.find((s) => s.id === item.item_id);
        const itemName = sItem ? sItem.name : "Unknown Item";
        const optionsTxt =
          Array.isArray(item.options) && item.options.length > 0
            ? `(${item.options.map((o: any) => `${o?.name ? `${o.name}: ` : ""}${o?.value}`).join(", ")})`
            : "";

        return (
          <div key={idx} className="flex justify-between items-start gap-2">
            <div>
              <span className="font-semibold">{item.quantity || 1}x</span> {itemName} {optionsTxt}
            </div>
            <div className="font-mono text-muted-foreground">₱{(item.subtotal || 0).toFixed(2)}</div>
          </div>
        );
      })}
    </div>
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

function parseContributionMetadata(entry: EntryRow) {
  const metadata = entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const contributionIdRaw = metadata.contribution_id ?? metadata.payable_batch_id ?? entry.event_id ?? null;
  const contributionId =
    typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
      ? contributionIdRaw
      : entry.id;

  return {
    contributionId,
    title:
      typeof metadata.contribution_title === "string" && metadata.contribution_title.trim().length > 0
        ? metadata.contribution_title.trim()
        : typeof metadata.payable_label === "string" && metadata.payable_label.trim().length > 0
          ? metadata.payable_label.trim()
          : null,
    details:
      typeof metadata.contribution_details === "string" && metadata.contribution_details.trim().length > 0
        ? metadata.contribution_details.trim()
        : null,
    eventTitle:
      typeof metadata.contribution_event_title === "string" && metadata.contribution_event_title.trim().length > 0
        ? metadata.contribution_event_title.trim()
        : null,
    deadline: parseDeadline(metadata.payable_deadline),
    receiptSignature:
      typeof metadata.contribution_receipt_signature === "string" &&
        metadata.contribution_receipt_signature.trim().length > 0
        ? metadata.contribution_receipt_signature.trim()
        : null,
    receiptSubject:
      typeof metadata.contribution_receipt_subject === "string" &&
        metadata.contribution_receipt_subject.trim().length > 0
        ? metadata.contribution_receipt_subject.trim()
        : null,
    receiptMessage:
      typeof metadata.contribution_receipt_message === "string" &&
        metadata.contribution_receipt_message.trim().length > 0
        ? metadata.contribution_receipt_message.trim()
        : null,
    receiptLogoUrl:
      typeof metadata.contribution_receipt_logo_url === "string" &&
        metadata.contribution_receipt_logo_url.trim().length > 0
        ? metadata.contribution_receipt_logo_url.trim()
        : null,
    isStore: metadata.is_store === true,
    storeItems: Array.isArray(metadata.store_items) ? metadata.store_items : [],
    cartItems: Array.isArray(metadata.cart_items) ? metadata.cart_items : [],
  };
}

export default async function EventDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id: contributionId }, paramValues] = await Promise.all([params, searchParams]);

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

  const { data: memberships } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  const hasAccess = roles.some((role) => new Set(["admin", "treasurer"]).has(role));
  if (!hasAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const activeSemester = await getActiveSemester(dormId, supabase);

  const [{ data: rawEntries, error: entriesError }, occupants, { data: dormConfig }] = await Promise.all([
    supabase
      .from("ledger_entries")
      .select("id, semester_id, occupant_id, event_id, entry_type, amount_pesos, metadata")
      .eq("dorm_id", dormId)
      .eq("ledger", "contributions")
      .is("voided_at", null)
      .or(`id.eq.${contributionId},event_id.eq.${contributionId},metadata->>contribution_id.eq.${contributionId},metadata->>payable_batch_id.eq.${contributionId}`),
    getOccupants(dormId, { status: "active" }),
    supabase
      .from("dorms")
      .select("attributes")
      .eq("id", dormId)
      .maybeSingle(),
  ]);

  if (entriesError) {
    return <div className="p-6 text-sm text-destructive">Error loading contribution entries.</div>;
  }

  const entryRows = ((rawEntries ?? []) as EntryRow[]).filter((entry) => {
    const metadata = parseContributionMetadata(entry);
    return metadata.contributionId === contributionId;
  });

  if (!entryRows.length) {
    notFound();
  }

  const dormAttributes =
    typeof dormConfig?.attributes === "object" && dormConfig.attributes !== null
      ? (dormConfig.attributes as Record<string, unknown>)
      : {};
  const allowHistoricalEdit = dormAttributes.finance_non_current_semester_override === true;
  const activeSemesterId = activeSemester?.id ?? null;
  const includesActiveSemester = activeSemesterId
    ? entryRows.some((entry) => entry.semester_id === activeSemesterId)
    : false;
  const isReadOnlyView = !includesActiveSemester && !allowHistoricalEdit;

  const contributionTitle =
    entryRows
      .map((entry) => parseContributionMetadata(entry).title)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ?? "Contribution";

  const contributionDetails =
    entryRows
      .map((entry) => parseContributionMetadata(entry).details)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ?? null;

  const linkedEventTitle =
    entryRows
      .map((entry) => parseContributionMetadata(entry).eventTitle)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ?? null;

  const contributionDeadline =
    entryRows
      .map((entry) => parseContributionMetadata(entry).deadline)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  const contributionReceiptSignature =
    entryRows
      .map((entry) => parseContributionMetadata(entry).receiptSignature)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ??
    "";
  const contributionReceiptSubject =
    entryRows
      .map((entry) => parseContributionMetadata(entry).receiptSubject)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ??
    "";
  const contributionReceiptMessage =
    entryRows
      .map((entry) => parseContributionMetadata(entry).receiptMessage)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ??
    "";
  const contributionReceiptLogoUrl =
    entryRows
      .map((entry) => parseContributionMetadata(entry).receiptLogoUrl)
      .find((value): value is string => Boolean(value && value.trim().length > 0)) ??
    "";
  const isStore =
    entryRows.map((entry) => parseContributionMetadata(entry).isStore).find(Boolean) ?? false;
  const storeItems =
    entryRows
      .map((entry) => parseContributionMetadata(entry).storeItems)
      .find((items) => items.length > 0) ?? [];

  const occupantRows = (occupants ?? []) as OccupantRow[];
  const nowIso = new Date().toISOString();

  const occupantStatus: OccupantWithStatus[] = occupantRows.map((occupant) => {
    const occupantEntries = entryRows.filter((entry) => entry.occupant_id === occupant.id);

    const payable = occupantEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount_pesos ?? 0);
      if (entry.entry_type === "payment") {
        return sum;
      }
      return sum + amount;
    }, 0);

    const paid = occupantEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount_pesos ?? 0);
      if (entry.entry_type === "payment" || amount < 0) {
        return sum + Math.abs(amount);
      }
      return sum;
    }, 0);

    const remaining = payable - paid;

    let paymentStatus: OccupantWithStatus["paymentStatus"] = "unpaid";
    if (paid > 0 && remaining > 0) {
      paymentStatus = "partial";
    }
    if (remaining <= 0 && (payable > 0 || paid > 0)) {
      paymentStatus = "paid";
    }

    const deadline =
      occupantEntries
        .map((entry) => parseContributionMetadata(entry).deadline)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? contributionDeadline;

    const overdue = deadline !== null && deadline < nowIso && remaining > 0;

    const cartItems = occupantEntries
      .map((entry) => parseContributionMetadata(entry).cartItems)
      .filter((items) => items.length > 0)
      .flat();

    return {
      ...occupant,
      payable,
      paid,
      remaining,
      paymentStatus,
      deadline,
      overdue,
      cartItems,
    };
  });

  const normalizedSearch = search.toLowerCase();
  const filteredOccupants = occupantStatus.filter((occupant) => {
    const matchesSearch =
      !normalizedSearch ||
      (occupant.full_name ?? "").toLowerCase().includes(normalizedSearch) ||
      (occupant.student_id ?? "").toLowerCase().includes(normalizedSearch);

    const matchesStatus = !statusFilter || occupant.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCollected = occupantStatus.reduce((sum, occupant) => sum + occupant.paid, 0);
  const totalPayable = occupantStatus.reduce((sum, occupant) => sum + occupant.payable, 0);
  const totalRemaining = occupantStatus.reduce((sum, occupant) => sum + Math.max(0, occupant.remaining), 0);
  const overdueCount = occupantStatus.filter((occupant) => occupant.overdue).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/treasurer/contributions">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{contributionTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {linkedEventTitle ? `Linked event: ${linkedEventTitle}` : "No linked event"}
            </p>
            {activeSemester ? (
              <p className="text-xs text-muted-foreground">{activeSemester.label}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
          {!isReadOnlyView ? <LedgerOverwriteDialog dormId={dormId} /> : (
            <Badge variant="outline">View-only semester</Badge>
          )}
          <ExportXlsxDialog
            report="event-contributions"
            title="Export Contribution Report"
            description="Download this contribution with participant balances and payment entries."
            triggerLabel="Export Contribution"
            defaultDormId={dormId}
            defaultParams={{ contribution_id: contributionId }}
          />
        </div>
      </div>

      {contributionDetails ? (
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-sm border-muted">
          <CardContent className="pt-6 text-sm text-muted-foreground">{contributionDetails}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₱{totalPayable.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalCollected.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">₱{totalRemaining.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Occupants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{occupantRows.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md hover:shadow-lg transition-all duration-200 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payable Deadline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-semibold">
              {contributionDeadline ? format(new Date(contributionDeadline), "MMM d, yyyy h:mm a") : "Not set"}
            </div>
            <p className="text-xs text-muted-foreground">
              {overdueCount} overdue occupant{overdueCount === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/90 dark:bg-card/90 backdrop-blur-md shadow-md border-muted">
        <CardHeader className="space-y-4">
          <CardTitle>Occupant payments</CardTitle>
          <ContributionDetailsFilters
            contributionId={contributionId}
            initialSearch={search}
            initialStatus={statusFilter}
          />
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
                  <div key={occupant.id} className="space-y-3 rounded-lg border border-border/50 bg-background/50 p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{occupant.full_name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">
                          {roomCode ? `Room ${roomCode}` : "No room"}
                          {occupant.student_id ? ` · ${occupant.student_id}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={occupant.paymentStatus} />
                        {occupant.overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Overdue
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Payable</p>
                        <p className="font-medium">₱{occupant.payable.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid</p>
                        <p className="font-medium text-emerald-600">₱{occupant.paid.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining</p>
                        <p className={`font-medium ${occupant.remaining > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                          ₱{occupant.remaining.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {isStore && occupant.cartItems?.length > 0 && (
                      <CartItemsRenderer items={occupant.cartItems} storeItems={storeItems} />
                    )}

                    <p className="text-xs text-muted-foreground">
                      Deadline: {occupant.deadline ? format(new Date(occupant.deadline), "MMM d, yyyy h:mm a") : "Not set"}
                    </p>

                    <div className="flex flex-col gap-2">
                      {!isReadOnlyView ? (
                        <>
                          <div>
                            <ContributionPayableOverrideDialog
                              key={`mobile-override-${occupant.id}`}
                              dormId={dormId}
                              contributionId={contributionId}
                              occupantId={occupant.id}
                              currentPayable={occupant.payable}
                              variant="secondary"
                              className="w-full"
                            />
                          </div>
                          <div>
                            <PaymentDialog
                              key={`mobile-pay-${occupant.id}`}
                              dormId={dormId}
                              occupantId={occupant.id}
                              category="contributions"
                              eventTitle={contributionTitle}
                              metadata={{
                                contribution_id: contributionId,
                                contribution_title: contributionTitle,
                                contribution_details: contributionDetails,
                                contribution_event_title: linkedEventTitle,
                                payable_deadline: occupant.deadline,
                                has_contribution_receipt_signature: Boolean(contributionReceiptSignature),
                                has_contribution_receipt_subject: Boolean(contributionReceiptSubject),
                                has_contribution_receipt_message: Boolean(contributionReceiptMessage),
                                has_contribution_receipt_logo_url: Boolean(contributionReceiptLogoUrl),
                                is_store: isStore,
                                store_items: storeItems,
                                remaining_balance: occupant.remaining,
                              }}
                              triggerText="Record Payment"
                              triggerVariant="outline"
                              triggerClassName="w-full"
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-muted bg-white/90 dark:bg-card/90 backdrop-blur-md md:block shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="font-semibold text-foreground">Occupant</TableHead>
                  <TableHead className="font-semibold text-foreground">Room</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Payable</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Paid</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Remaining</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Deadline</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">Status</TableHead>
                  <TableHead className="text-right font-semibold text-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOccupants.map((occupant) => (
                  <TableRow key={occupant.id} className="border-border/50 hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-medium">{occupant.full_name ?? "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{occupant.student_id ?? "-"}</div>
                      {isStore && occupant.cartItems?.length > 0 && (
                        <div className="mt-2 w-full max-w-[200px]">
                          <CartItemsRenderer items={occupant.cartItems} storeItems={storeItems} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">{getRoomCode(occupant) ?? <span className="italic text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="text-right font-mono align-top">₱{occupant.payable.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 align-top">₱{occupant.paid.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-mono align-top ${occupant.remaining > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                      ₱{occupant.remaining.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-xs align-top">
                      {occupant.deadline ? format(new Date(occupant.deadline), "MMM d, yyyy h:mm a") : "Not set"}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge status={occupant.paymentStatus} />
                        {occupant.overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Overdue
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isReadOnlyView ? (
                        <div className="flex items-center justify-end gap-2">
                          <div>
                            <ContributionPayableOverrideDialog
                              key={`desktop-override-${occupant.id}`}
                              dormId={dormId}
                              contributionId={contributionId}
                              occupantId={occupant.id}
                              currentPayable={occupant.payable}
                              variant="secondary"
                            />
                          </div>
                          <div>
                            <PaymentDialog
                              key={`desktop-pay-${occupant.id}`}
                              dormId={dormId}
                              occupantId={occupant.id}
                              category="contributions"
                              eventTitle={contributionTitle}
                              metadata={{
                                contribution_id: contributionId,
                                contribution_title: contributionTitle,
                                contribution_details: contributionDetails,
                                contribution_event_title: linkedEventTitle,
                                payable_deadline: occupant.deadline,
                                has_contribution_receipt_signature: Boolean(contributionReceiptSignature),
                                has_contribution_receipt_subject: Boolean(contributionReceiptSubject),
                                has_contribution_receipt_message: Boolean(contributionReceiptMessage),
                                has_contribution_receipt_logo_url: Boolean(contributionReceiptLogoUrl),
                                is_store: isStore,
                                store_items: storeItems,
                              }}
                              triggerText="Record Pay"
                              triggerVariant="outline"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">View only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOccupants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
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
