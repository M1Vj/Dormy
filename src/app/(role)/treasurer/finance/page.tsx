import Link from "next/link";
import { format } from "date-fns";

import { TreasurerFinanceEntryDialog } from "@/components/finance/treasurer-finance-entry-dialog";
import { Badge } from "@/components/ui/badge";
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
import { getTreasurerSemesterSnapshots } from "@/lib/finance/treasurer-semester-balance";
import { getActiveDormId } from "@/lib/dorms";
import { ensureActiveSemesterId, getActiveSemester } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  search?: string | string[];
  semester?: string | string[];
};

type SemesterRef = {
  id: string;
  label: string;
};

type LedgerEntryRow = {
  id: string;
  semester_id: string | null;
  event_id: string | null;
  entry_type: string;
  amount_pesos: number | string | null;
  posted_at: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
};

type ExpenseRow = {
  id: string;
  semester_id: string;
  title: string;
  amount_pesos: number | string;
  purchased_at: string;
  status: "pending" | "approved" | "rejected";
  expense_group_title: string | null;
  contribution_reference_title: string | null;
  transparency_notes: string | null;
};

type EventRef = {
  id: string;
  title: string;
};

type ContributionGroup = {
  id: string;
  actionContributionId: string | null;
  title: string;
  eventTitle: string | null;
  collected: number;
  charged: number;
  remaining: number;
  latestPostedAt: string;
  semesterLabels: string[];
};

type ExpenseGroup = {
  key: string;
  title: string;
  linkedContribution: string | null;
  approvedAmount: number;
  pendingAmount: number;
  latestPurchasedAt: string;
  semesterLabels: string[];
};

type ManualInflow = {
  id: string;
  title: string;
  amount: number;
  postedAt: string;
  counterparty: string | null;
  note: string | null;
  semesterLabels: string[];
};

type ManualExpense = {
  id: string;
  title: string;
  amount: number;
  purchasedAt: string;
  counterparty: string | null;
  note: string | null;
  semesterLabels: string[];
};

type FinanceStreamRow = {
  id: string;
  kind: "inflow" | "expense";
  source: "contribution" | "contribution_expense" | "manual_inflow" | "manual_expense" | "handover";
  title: string;
  subtitle: string | null;
  detail: string | null;
  amount: number;
  happenedAt: string;
  actionHref: string | null;
  semesterLabels: string[];
};

const MANUAL_EXPENSE_MARKER = "[treasurer_finance_manual]";

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

const normalizeArrayParam = (value?: string | string[]) => {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeContributionTitle(value: string) {
  return value
    .replace(/\s*:\s*(cash|gcash|bank(?:\s*transfer)?|online)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContributionMetadata(row: LedgerEntryRow, eventTitleFallback: string | null) {
  const metadata = asMetadataRecord(row.metadata);
  const contributionIdRaw = metadata.contribution_id ?? metadata.payable_batch_id ?? null;
  const contributionTitleRaw =
    metadata.contribution_title ?? metadata.payable_label ?? row.note ?? eventTitleFallback ?? "Contribution";
  const eventTitleRaw = metadata.contribution_event_title;

  const actionContributionId =
    typeof contributionIdRaw === "string" && contributionIdRaw.trim().length > 0
      ? contributionIdRaw
      : null;

  const titleRaw =
    typeof contributionTitleRaw === "string" && contributionTitleRaw.trim().length > 0
      ? contributionTitleRaw.trim()
      : "Contribution";
  const title = normalizeContributionTitle(titleRaw);

  const eventTitle =
    typeof eventTitleRaw === "string" && eventTitleRaw.trim().length > 0
      ? eventTitleRaw.trim()
      : eventTitleFallback;

  const groupKey =
    actionContributionId ??
    `legacy:${row.semester_id ?? "no-semester"}:${title.toLowerCase()}::${(eventTitle ?? "").toLowerCase()}`;

  return { groupKey, actionContributionId, title, eventTitle, metadata };
}

function isManualInflow(row: LedgerEntryRow) {
  const metadata = asMetadataRecord(row.metadata);
  return metadata.finance_manual_inflow === true;
}

function isLegacyImportedContributionRow(row: LedgerEntryRow) {
  const metadata = asMetadataRecord(row.metadata);
  const hasContributionId =
    (typeof metadata.contribution_id === "string" && metadata.contribution_id.trim().length > 0) ||
    (typeof metadata.payable_batch_id === "string" && metadata.payable_batch_id.trim().length > 0);

  if (hasContributionId) {
    return false;
  }

  const importSource =
    typeof metadata.import_source === "string" && metadata.import_source.trim().length > 0
      ? metadata.import_source.trim().toLowerCase()
      : "";

  return importSource.startsWith("gdrive_");
}

function parseManualInflow(row: LedgerEntryRow): Omit<ManualInflow, "semesterLabels"> {
  const metadata = asMetadataRecord(row.metadata);
  const counterparty =
    typeof metadata.finance_counterparty === "string" && metadata.finance_counterparty.trim().length > 0
      ? metadata.finance_counterparty.trim()
      : null;
  const note =
    typeof metadata.finance_note === "string" && metadata.finance_note.trim().length > 0
      ? metadata.finance_note.trim()
      : null;

  return {
    id: row.id,
    title: row.note?.trim() || "Manual inflow",
    amount: Math.abs(Number(row.amount_pesos ?? 0)),
    postedAt: row.posted_at,
    counterparty,
    note,
  };
}

function parseManualExpenseNote(value: string | null) {
  if (!value) return null;
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const filtered = lines.filter((line) => line !== MANUAL_EXPENSE_MARKER);
  if (!filtered.length) return null;
  return filtered.join(" ");
}

function sourceLabel(source: FinanceStreamRow["source"]) {
  if (source === "contribution") return "Contribution";
  if (source === "contribution_expense") return "Contribution Expense";
  if (source === "manual_inflow") return "Manual Inflow";
  if (source === "handover") return "Semester Handover";
  return "Manual Expense";
}

export default async function TreasurerFinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = normalizeParam(params.search).trim();
  const semesterIdsFromParams = normalizeArrayParam(params.semester);

  const activeDormId = await getActiveDormId();
  if (!activeDormId) {
    return <div className="p-6 text-sm text-muted-foreground">No active dorm selected.</div>;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <div className="p-6 text-sm text-muted-foreground">Supabase is not configured.</div>;
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
    .eq("dorm_id", activeDormId)
    .eq("user_id", user.id);

  const roles = memberships?.map((membership) => membership.role) ?? [];
  if (!roles.includes("treasurer")) {
    return <div className="p-6 text-sm text-muted-foreground">This page is only available to the dorm treasurer.</div>;
  }

  const semesterResult = await ensureActiveSemesterId(activeDormId, supabase);
  if ("error" in semesterResult) {
    return <div className="p-6 text-sm text-destructive">{semesterResult.error ?? "No active semester."}</div>;
  }
  const activeSemesterId = semesterResult.semesterId;

  const [activeSemester, { data: semesterRows }, { data: dormConfig }, semesterSnapshots] = await Promise.all([
    getActiveSemester(activeDormId, supabase),
    supabase
      .from("dorm_semesters")
      .select("id, label")
      .is("dorm_id", null)
      .order("starts_on", { ascending: false }),
    supabase
      .from("dorms")
      .select("attributes")
      .eq("id", activeDormId)
      .maybeSingle(),
    getTreasurerSemesterSnapshots(activeDormId, supabase),
  ]);

  const semesters = (semesterRows ?? []) as SemesterRef[];
  const validSemesterIds = new Set(semesters.map((semester) => semester.id));
  const selectedSemesterIdsRaw =
    semesterIdsFromParams.length > 0
      ? semesterIdsFromParams.filter((id) => validSemesterIds.has(id))
      : [activeSemesterId];
  const selectedSemesterIds =
    selectedSemesterIdsRaw.length > 0 ? selectedSemesterIdsRaw : [activeSemesterId];

  const dormAttributes =
    typeof dormConfig?.attributes === "object" && dormConfig.attributes !== null
      ? (dormConfig.attributes as Record<string, unknown>)
      : {};
  const allowHistoricalEdit = dormAttributes.finance_non_current_semester_override === true;
  const isReadOnlyView = !selectedSemesterIds.includes(activeSemesterId) && !allowHistoricalEdit;

  const [{ data: contributionRowsRaw, error: contributionError }, { data: expenseRowsRaw, error: expenseError }] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select("id, semester_id, event_id, entry_type, amount_pesos, posted_at, note, metadata")
        .eq("dorm_id", activeDormId)
        .eq("ledger", "contributions")
        .in("semester_id", selectedSemesterIds)
        .is("voided_at", null)
        .order("posted_at", { ascending: false }),
      supabase
        .from("expenses")
        .select(
          "id, semester_id, title, amount_pesos, purchased_at, status, expense_group_title, contribution_reference_title, transparency_notes"
        )
        .eq("dorm_id", activeDormId)
        .eq("category", "contributions")
        .in("semester_id", selectedSemesterIds)
        .order("purchased_at", { ascending: false }),
    ]);

  if (contributionError) {
    return <div className="p-6 text-sm text-destructive">Failed to load contribution entries.</div>;
  }

  if (expenseError) {
    return <div className="p-6 text-sm text-destructive">Failed to load expense entries.</div>;
  }

  const contributionRows = (contributionRowsRaw ?? []) as LedgerEntryRow[];
  const expenseRows = (expenseRowsRaw ?? []) as ExpenseRow[];

  const eventIds = Array.from(
    new Set(
      contributionRows
        .map((row) => row.event_id)
        .filter((eventId): eventId is string => Boolean(eventId))
    )
  );

  let eventTitleById = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, title")
      .eq("dorm_id", activeDormId)
      .in("id", eventIds);

    eventTitleById = new Map(((events ?? []) as EventRef[]).map((event) => [event.id, event.title]));
  }

  const semesterLabelById = new Map(semesters.map((semester) => [semester.id, semester.label]));
  const semesterSnapshotById = new Map(
    semesterSnapshots.map((snapshot, index) => [
      snapshot.semesterId,
      {
        ...snapshot,
        order: index,
        previousSemesterLabel: index > 0 ? semesterSnapshots[index - 1]?.semesterLabel ?? null : null,
      },
    ])
  );

  const manualInflowRows = contributionRows.filter((row) => isManualInflow(row));
  const contributionRowsForGroups = contributionRows.filter(
    (row) => !isManualInflow(row) && !isLegacyImportedContributionRow(row)
  );

  const contributionGroupMap = new Map<
    string,
    ContributionGroup & {
      semesterIds: Set<string>;
    }
  >();

  for (const row of contributionRowsForGroups) {
    const eventTitleFallback = row.event_id ? eventTitleById.get(row.event_id) ?? null : null;
    const parsed = parseContributionMetadata(row, eventTitleFallback);
    const amount = Number(row.amount_pesos ?? 0);

    const existing =
      contributionGroupMap.get(parsed.groupKey) ?? {
        id: parsed.groupKey,
        actionContributionId: parsed.actionContributionId,
        title: parsed.title,
        eventTitle: parsed.eventTitle,
        collected: 0,
        charged: 0,
        remaining: 0,
        latestPostedAt: row.posted_at,
        semesterLabels: [],
        semesterIds: new Set<string>(),
      };

    if (amount < 0 || row.entry_type === "payment") {
      existing.collected += Math.abs(amount);
    } else {
      existing.charged += amount;
    }
    existing.remaining += amount;

    if (!existing.eventTitle && parsed.eventTitle) {
      existing.eventTitle = parsed.eventTitle;
    }
    if (!existing.actionContributionId && parsed.actionContributionId) {
      existing.actionContributionId = parsed.actionContributionId;
    }
    if (row.posted_at > existing.latestPostedAt) {
      existing.latestPostedAt = row.posted_at;
    }
    if (row.semester_id) {
      existing.semesterIds.add(row.semester_id);
    }

    contributionGroupMap.set(parsed.groupKey, existing);
  }

  const contributionGroups = Array.from(contributionGroupMap.values()).map((group) => ({
    id: group.id,
    actionContributionId: group.actionContributionId,
    title: group.title,
    eventTitle: group.eventTitle,
    collected: Number(group.collected.toFixed(2)),
    charged: Number(group.charged.toFixed(2)),
    remaining: Number(group.remaining.toFixed(2)),
    latestPostedAt: group.latestPostedAt,
    semesterLabels: Array.from(group.semesterIds)
      .map((id) => semesterLabelById.get(id) ?? "Unknown semester")
      .filter(Boolean),
  }));

  const manualInflows: ManualInflow[] = manualInflowRows.map((row) => {
    const parsed = parseManualInflow(row);
    const labels = row.semester_id ? [semesterLabelById.get(row.semester_id) ?? "Unknown semester"] : [];
    return {
      ...parsed,
      semesterLabels: labels,
    };
  });

  const manualExpenseRows = expenseRows.filter((row) =>
    (row.transparency_notes ?? "").includes(MANUAL_EXPENSE_MARKER)
  );
  const contributionExpenseRows = expenseRows.filter(
    (row) => !(row.transparency_notes ?? "").includes(MANUAL_EXPENSE_MARKER)
  );

  const expenseGroupMap = new Map<
    string,
    ExpenseGroup & {
      semesterIds: Set<string>;
    }
  >();

  for (const row of contributionExpenseRows) {
    const key = row.expense_group_title?.trim() || row.title;
    const amount = Number(row.amount_pesos ?? 0);
    const existing =
      expenseGroupMap.get(key) ?? {
        key,
        title: key,
        linkedContribution: row.contribution_reference_title?.trim() || null,
        approvedAmount: 0,
        pendingAmount: 0,
        latestPurchasedAt: row.purchased_at,
        semesterLabels: [],
        semesterIds: new Set<string>(),
      };

    if (row.status === "approved") {
      existing.approvedAmount += amount;
    }
    if (row.status === "pending") {
      existing.pendingAmount += amount;
    }
    if (row.purchased_at > existing.latestPurchasedAt) {
      existing.latestPurchasedAt = row.purchased_at;
    }
    if (!existing.linkedContribution && row.contribution_reference_title?.trim()) {
      existing.linkedContribution = row.contribution_reference_title.trim();
    }
    existing.semesterIds.add(row.semester_id);
    expenseGroupMap.set(key, existing);
  }

  const expenseGroups = Array.from(expenseGroupMap.values()).map((group) => ({
    key: group.key,
    title: group.title,
    linkedContribution: group.linkedContribution,
    approvedAmount: Number(group.approvedAmount.toFixed(2)),
    pendingAmount: Number(group.pendingAmount.toFixed(2)),
    latestPurchasedAt: group.latestPurchasedAt,
    semesterLabels: Array.from(group.semesterIds)
      .map((id) => semesterLabelById.get(id) ?? "Unknown semester")
      .filter(Boolean),
  }));

  const manualExpenses: ManualExpense[] = manualExpenseRows.map((row) => ({
    id: row.id,
    title: row.title,
    amount: Number(Number(row.amount_pesos ?? 0).toFixed(2)),
    purchasedAt: row.purchased_at,
    counterparty: null,
    note: parseManualExpenseNote(row.transparency_notes),
    semesterLabels: [semesterLabelById.get(row.semester_id) ?? "Unknown semester"],
  }));

  const contributionInflowRows: FinanceStreamRow[] = contributionGroups.map((group) => ({
    id: `contribution-${group.id}`,
    kind: "inflow",
    source: "contribution",
    title: group.title,
    subtitle: group.eventTitle,
    detail: `Collected ₱${group.collected.toFixed(2)} · Remaining ₱${Math.max(0, group.remaining).toFixed(2)}`,
    amount: group.collected,
    happenedAt: group.latestPostedAt,
    actionHref: group.actionContributionId ? `/treasurer/contributions/${group.actionContributionId}` : null,
    semesterLabels: group.semesterLabels,
  }));

  const contributionExpenseRowsForStream: FinanceStreamRow[] = expenseGroups.map((group) => ({
    id: `contribution-expense-${group.key}`,
    kind: "expense",
    source: "contribution_expense",
    title: group.title,
    subtitle: group.linkedContribution,
    detail:
      group.pendingAmount > 0
        ? `Approved ₱${group.approvedAmount.toFixed(2)} · Pending ₱${group.pendingAmount.toFixed(2)}`
        : `Approved ₱${group.approvedAmount.toFixed(2)}`,
    amount: group.approvedAmount,
    happenedAt: `${group.latestPurchasedAt}T12:00:00.000Z`,
    actionHref: `/treasurer/contribution-expenses/${encodeURIComponent(group.key)}`,
    semesterLabels: group.semesterLabels,
  }));

  const manualInflowRowsForStream: FinanceStreamRow[] = manualInflows.map((entry) => ({
    id: `manual-inflow-${entry.id}`,
    kind: "inflow",
    source: "manual_inflow",
    title: entry.title,
    subtitle: entry.counterparty,
    detail: entry.note,
    amount: entry.amount,
    happenedAt: entry.postedAt,
    actionHref: null,
    semesterLabels: entry.semesterLabels,
  }));

  const manualExpenseRowsForStream: FinanceStreamRow[] = manualExpenses.map((entry) => ({
    id: `manual-expense-${entry.id}`,
    kind: "expense",
    source: "manual_expense",
    title: entry.title,
    subtitle: entry.counterparty,
    detail: entry.note,
    amount: entry.amount,
    happenedAt: `${entry.purchasedAt}T12:00:00.000Z`,
    actionHref: null,
    semesterLabels: entry.semesterLabels,
  }));

  const handoverRowsForStream: FinanceStreamRow[] = selectedSemesterIds.flatMap((semesterId) => {
    const snapshot = semesterSnapshotById.get(semesterId);
    if (!snapshot || snapshot.order === 0) {
      return [];
    }

    const handoverAmount = Number(snapshot.handoverIn.toFixed(2));
    const amount = Math.abs(handoverAmount);
    const happenedAt = snapshot.startsOn
      ? `${snapshot.startsOn}T00:00:00.000Z`
      : `${new Date().toISOString().split("T")[0]}T00:00:00.000Z`;

    return [
      {
        id: `semester-handover-${snapshot.semesterId}`,
        kind: handoverAmount < 0 ? "expense" : "inflow",
        source: "handover",
        title: "Semester Handover",
        subtitle: snapshot.previousSemesterLabel ? `From ${snapshot.previousSemesterLabel}` : null,
        detail: `Carry-over balance ₱${amount.toFixed(2)}`,
        amount,
        happenedAt,
        actionHref: null,
        semesterLabels: [snapshot.semesterLabel],
      },
    ];
  });

  const normalizedSearch = search.toLowerCase();
  const stream = [
    ...handoverRowsForStream,
    ...contributionInflowRows,
    ...contributionExpenseRowsForStream,
    ...manualInflowRowsForStream,
    ...manualExpenseRowsForStream,
  ]
    .filter((row) => {
      if (!normalizedSearch) return true;
      return (
        row.title.toLowerCase().includes(normalizedSearch) ||
        (row.subtitle ?? "").toLowerCase().includes(normalizedSearch) ||
        sourceLabel(row.source).toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => (a.happenedAt < b.happenedAt ? 1 : -1));

  const totalInflow = stream
    .filter((row) => row.kind === "inflow")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = stream
    .filter((row) => row.kind === "expense")
    .reduce((sum, row) => sum + row.amount, 0);
  const netFlow = totalInflow - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Treasurer Finance</h1>
          <p className="text-sm text-muted-foreground">
            Unified inflow and expense stream from contributions, contribution expenses, and manual finance entries.
          </p>
          {activeSemester ? (
            <p className="mt-1 text-xs text-muted-foreground">Active semester: {activeSemester.label}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">

          {isReadOnlyView ? (
            <Badge variant="outline">Selected semesters are view-only</Badge>
          ) : (
            <TreasurerFinanceEntryDialog dormId={activeDormId} />
          )}
        </div>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" method="GET">
        <Input
          name="search"
          placeholder="Search title, source, or related details..."
          defaultValue={search}
          className="sm:max-w-xs"
        />
        <select
          name="semester"
          defaultValue={selectedSemesterIds[0]}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm sm:w-[240px]"
        >
          {semesters.map((semester) => (
            <option key={semester.id} value={semester.id}>
              {semester.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
        {search || semesterIdsFromParams.length > 0 ? (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/treasurer/finance">Reset</Link>
          </Button>
        ) : null}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Visible Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{stream.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Inflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">₱{totalInflow.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expense</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">₱{totalExpense.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${netFlow < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              ₱{netFlow.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {stream.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No finance entries found.
            </CardContent>
          </Card>
        ) : (
          stream.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(row.happenedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant={row.kind === "inflow" ? "secondary" : "destructive"}>
                    {row.kind === "inflow" ? "Inflow" : "Expense"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{sourceLabel(row.source)}</p>
                {row.subtitle ? <p className="text-xs text-muted-foreground">{row.subtitle}</p> : null}
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-semibold ${row.kind === "inflow" ? "text-emerald-600" : "text-rose-600"}`}>
                    ₱{row.amount.toFixed(2)}
                  </p>
                  {row.actionHref ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={row.actionHref}>Open</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stream.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{format(new Date(row.happenedAt), "MMM d, yyyy")}</TableCell>
                <TableCell>
                  <Badge variant={row.kind === "inflow" ? "secondary" : "destructive"}>
                    {row.kind === "inflow" ? "Inflow" : "Expense"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{sourceLabel(row.source)}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.title}</div>
                  {row.subtitle ? <div className="text-xs text-muted-foreground">{row.subtitle}</div> : null}
                </TableCell>
                <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                  {row.detail || "—"}
                </TableCell>
                <TableCell className={`text-right font-medium ${row.kind === "inflow" ? "text-emerald-600" : "text-rose-600"}`}>
                  ₱{row.amount.toFixed(2)}
                </TableCell>
                <TableCell>
                  {row.semesterLabels.length ? row.semesterLabels.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {row.actionHref ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={row.actionHref}>Open</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {stream.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No finance entries found.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
