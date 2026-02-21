import { NextRequest, NextResponse } from "next/server";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DormRole } from "@/lib/types/events";
import {
  appendMetadataSheet,
  appendSheet,
  buildWorkbook,
  formatTimestamp,
  normalizeFilePart,
  toIsoDate,
  workbookToBuffer,
} from "@/lib/export/xlsx";

type ReportKey =
  | "fines-ledger"
  | "occupant-statement"
  | "maintenance-ledger"
  | "event-contributions"
  | "evaluation-rankings";

const REPORTS = new Set<ReportKey>([
  "fines-ledger",
  "occupant-statement",
  "maintenance-ledger",
  "event-contributions",
  "evaluation-rankings",
]);

const ALLOWED_ROLES: Record<ReportKey, DormRole[]> = {
  "fines-ledger": ["admin", "student_assistant", "adviser"],
  "occupant-statement": [
    "admin",
    "student_assistant",
    "treasurer",
    "adviser",
  ],
  "maintenance-ledger": ["admin", "adviser"],
  "event-contributions": ["admin", "treasurer"],
  "evaluation-rankings": ["admin"],
};

type JoinValue<T> = T | T[] | null;

type DormJoin = {
  id: string;
  name: string;
  slug: string;
};

type MembershipRow = {
  dorm_id: string;
  role: DormRole;
  dorm: JoinValue<DormJoin>;
};

type ExportContext = {
  report: ReportKey;
  request: NextRequest;
  searchParams: URLSearchParams;
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  dormId: string;
  dormName: string;
  dormSlug: string;
  role: DormRole;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
  rangeStartRaw: string | null;
  rangeEndRaw: string | null;
};

type ExportPayload = {
  fileName: string;
  buffer: Buffer;
};

function firstJoin<T>(value: JoinValue<T>): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toStartBoundary(value: string | null) {
  if (!value) {
    return null;
  }
  return toIsoDate(`${value}T00:00:00.000Z`);
}

function toEndBoundary(value: string | null) {
  if (!value) {
    return null;
  }
  return toIsoDate(`${value}T23:59:59.999Z`);
}

function applyTimestampRange<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  column: string,
  startIso: string | null,
  endIso: string | null
) {
  let rangedQuery = query;
  if (startIso) {
    rangedQuery = rangedQuery.gte(column, startIso);
  }
  if (endIso) {
    rangedQuery = rangedQuery.lte(column, endIso);
  }
  return rangedQuery;
}

function todaySuffix() {
  return new Date().toISOString().slice(0, 10);
}

function formatPeso(value: number) {
  return Number(value.toFixed(2));
}

async function resolveContext(report: ReportKey, request: NextRequest): Promise<ExportContext | NextResponse> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured for this environment." },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("dorm_id, role, dorm:dorms(id, name, slug)")
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return NextResponse.json(
      { error: "No dorm membership found for this account." },
      { status: 403 }
    );
  }

  const rows = memberships as MembershipRow[];
  const searchParams = request.nextUrl.searchParams;
  const requestedDormId = searchParams.get("dorm_id");
  const activeDormId = await getActiveDormId();

  const selectedMembership = requestedDormId
    ? rows.find((item) => item.dorm_id === requestedDormId)
    : rows.find((item) => item.dorm_id === activeDormId) ?? rows[0];

  if (!selectedMembership) {
    return NextResponse.json(
      { error: "Requested dorm is not available for this account." },
      { status: 403 }
    );
  }

  if (requestedDormId && selectedMembership.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can export using a custom dorm filter." },
      { status: 403 }
    );
  }

  const allowedRoles = ALLOWED_ROLES[report];
  if (!allowedRoles.includes(selectedMembership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to export this report." },
      { status: 403 }
    );
  }

  const dorm = firstJoin(selectedMembership.dorm);
  const dormName = dorm?.name ?? "Dorm";
  const dormSlug = normalizeFilePart(dorm?.slug ?? selectedMembership.dorm_id);
  const rangeStartRaw = searchParams.get("start");
  const rangeEndRaw = searchParams.get("end");

  return {
    report,
    request,
    searchParams,
    supabase,
    userId: user.id,
    dormId: selectedMembership.dorm_id,
    dormName,
    dormSlug,
    role: selectedMembership.role,
    rangeStartIso: toStartBoundary(rangeStartRaw),
    rangeEndIso: toEndBoundary(rangeEndRaw),
    rangeStartRaw,
    rangeEndRaw,
  };
}

async function buildFinesLedgerExport(context: ExportContext): Promise<ExportPayload> {
  type FineRow = {
    id: string;
    issued_at: string;
    pesos: number;
    points: number;
    note: string | null;
    voided_at: string | null;
    void_reason: string | null;
    occupant: JoinValue<{ full_name: string | null; student_id: string | null }>;
    rule: JoinValue<{ title: string | null; severity: string | null }>;
    issuer: JoinValue<{ display_name: string | null }>;
  };

  let query = context.supabase
    .from("fines")
    .select(
      "id, issued_at, pesos, points, note, voided_at, void_reason, occupant:occupants(full_name, student_id), rule:fine_rules(title, severity), issuer:issued_by(display_name)"
    )
    .eq("dorm_id", context.dormId)
    .order("issued_at", { ascending: false });

  query = applyTimestampRange(
    query,
    "issued_at",
    context.rangeStartIso,
    context.rangeEndIso
  );

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as FineRow[]).map((entry) => {
    const occupant = firstJoin(entry.occupant);
    const rule = firstJoin(entry.rule);
    const issuer = firstJoin(entry.issuer);

    return {
      "Date": formatTimestamp(entry.issued_at),
      "Occupant": occupant?.full_name ?? "",
      "Student ID": occupant?.student_id ?? "",
      "Violation": rule?.title ?? "",
      "Severity": rule?.severity ?? "",
      "Amount (₱)": formatPeso(Number(entry.pesos)),
      "Points": Number(entry.points),
      "Note": entry.note ?? "",
      "Status": entry.voided_at ? "voided" : "active",
      "Voided At": formatTimestamp(entry.voided_at),
      "Void Reason": entry.void_reason ?? "",
      "Issued By": issuer?.display_name ?? "",
    };
  });

  const workbook = buildWorkbook();
  appendSheet(workbook, "Fines Ledger", rows, [
    "Date",
    "Occupant",
    "Student ID",
    "Violation",
    "Severity",
    "Amount (₱)",
    "Points",
    "Note",
    "Status",
    "Voided At",
    "Void Reason",
    "Issued By",
  ]);
  appendMetadataSheet(workbook, [
    { key: "Report", value: "Fines Ledger" },
    { key: "Dorm", value: context.dormName },
    { key: "Date start", value: context.rangeStartRaw ?? "(none)" },
    { key: "Date end", value: context.rangeEndRaw ?? "(none)" },
    { key: "Generated at", value: new Date().toISOString() },
  ]);

  return {
    fileName: `fines-ledger-${context.dormSlug}-${todaySuffix()}.xlsx`,
    buffer: workbookToBuffer(workbook),
  };
}

async function buildOccupantStatementExport(context: ExportContext): Promise<ExportPayload> {
  type OccupantRow = {
    id: string;
    full_name: string;
    student_id: string | null;
    course: string | null;
    status: string;
  };

  type LedgerRow = {
    id: string;
    occupant_id: string | null;
    posted_at: string;
    ledger: string;
    entry_type: string;
    amount_pesos: number;
    method: string | null;
    note: string | null;
    event: JoinValue<{ title: string | null }>;
    occupant: JoinValue<{ full_name: string | null; student_id: string | null }>;
    fine: JoinValue<{ rule: JoinValue<{ title: string | null }> }>;
  };

  const requestedOccupantId = context.searchParams.get("occupant_id");

  let occupantQuery = context.supabase
    .from("occupants")
    .select("id, full_name, student_id, course:classification, status")
    .eq("dorm_id", context.dormId)
    .order("full_name", { ascending: true });

  if (requestedOccupantId) {
    occupantQuery = occupantQuery.eq("id", requestedOccupantId);
  }

  const { data: occupantsData, error: occupantsError } = await occupantQuery;
  if (occupantsError) {
    throw new Error(occupantsError.message);
  }

  const occupants = (occupantsData ?? []) as OccupantRow[];
  if (!occupants.length) {
    throw new Error("No occupants found for this statement export.");
  }

  const occupantIdSet = new Set(occupants.map((occupant) => occupant.id));

  let ledgerQuery = context.supabase
    .from("ledger_entries")
    .select(
      "id, occupant_id, posted_at, ledger, entry_type, amount_pesos, method, note, event:events(title), occupant:occupants(full_name, student_id), fine:fines(rule:fine_rules(title)), voided_at"
    )
    .eq("dorm_id", context.dormId)
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  if (requestedOccupantId) {
    ledgerQuery = ledgerQuery.eq("occupant_id", requestedOccupantId);
  }

  ledgerQuery = applyTimestampRange(
    ledgerQuery,
    "posted_at",
    context.rangeStartIso,
    context.rangeEndIso
  );

  const { data: ledgerData, error: ledgerError } = await ledgerQuery;
  if (ledgerError) {
    throw new Error(ledgerError.message);
  }

  const entries = ((ledgerData ?? []) as LedgerRow[]).filter((entry) =>
    entry.occupant_id ? occupantIdSet.has(entry.occupant_id) : false
  );

  const summaryMap = new Map<
    string,
    {
      occupant_name: string;
      student_id: string;
      course: string;
      maintenance_balance: number;
      fines_balance: number;
      events_balance: number;
      total_balance: number;
    }
  >();

  for (const occupant of occupants) {
    summaryMap.set(occupant.id, {
      occupant_name: occupant.full_name,
      student_id: occupant.student_id ?? "",
      course: occupant.course ?? "",
      maintenance_balance: 0,
      fines_balance: 0,
      events_balance: 0,
      total_balance: 0,
    });
  }

  for (const entry of entries) {
    if (!entry.occupant_id) {
      continue;
    }

    const summary = summaryMap.get(entry.occupant_id);
    if (!summary) {
      continue;
    }

    const amount = Number(entry.amount_pesos);
    if (entry.ledger === "maintenance_fee") {
      summary.maintenance_balance += amount;
    }
    if (entry.ledger === "sa_fines") {
      summary.fines_balance += amount;
    }
    if (entry.ledger === "contributions") {
      summary.events_balance += amount;
    }
    summary.total_balance += amount;
  }

  const summaryRows = [...summaryMap.values()]
    .sort((left, right) => left.occupant_name.localeCompare(right.occupant_name))
    .map((row) => ({
      "Occupant": row.occupant_name,
      "Student ID": row.student_id,
      "Course": row.course,
      "Maintenance Balance": formatPeso(row.maintenance_balance),
      "Fines Balance": formatPeso(row.fines_balance),
      "Events Balance": formatPeso(row.events_balance),
      "Total Balance": formatPeso(row.total_balance),
      "Clearance Status": row.total_balance <= 0 ? "CLEARED" : "NOT CLEARED",
    }));

  const transactionRows = entries.map((entry) => {
    const occupant = firstJoin(entry.occupant);
    const event = firstJoin(entry.event);
    const fine = firstJoin(entry.fine);
    const fineRule = firstJoin(fine?.rule ?? null);

    return {
      "Date": formatTimestamp(entry.posted_at),
      "Occupant": occupant?.full_name ?? "",
      "Student ID": occupant?.student_id ?? "",
      "Ledger": entry.ledger,
      "Type": entry.entry_type,
      "Amount (₱)": formatPeso(Number(entry.amount_pesos)),
      "Method": entry.method ?? "",
      "Note": entry.note ?? "",
      "Event": event?.title ?? "",
      "Fine Violation": fineRule?.title ?? "",
    };
  });

  const workbook = buildWorkbook();
  appendSheet(workbook, "Statement Summary", summaryRows, [
    "Occupant",
    "Student ID",
    "Course",
    "Maintenance Balance",
    "Fines Balance",
    "Events Balance",
    "Total Balance",
    "Clearance Status",
  ]);
  appendSheet(workbook, "Transactions", transactionRows, [
    "Date",
    "Occupant",
    "Student ID",
    "Ledger",
    "Type",
    "Amount (₱)",
    "Method",
    "Note",
    "Event",
    "Fine Violation",
  ]);
  appendMetadataSheet(workbook, [
    { key: "Report", value: "Per-Occupant Statement" },
    { key: "Dorm", value: context.dormName },
    {
      key: "Occupant filter",
      value: requestedOccupantId ? requestedOccupantId : "All occupants",
    },
    { key: "Date start", value: context.rangeStartRaw ?? "(none)" },
    { key: "Date end", value: context.rangeEndRaw ?? "(none)" },
    { key: "Generated at", value: new Date().toISOString() },
  ]);

  return {
    fileName: `occupant-statement-${context.dormSlug}-${todaySuffix()}.xlsx`,
    buffer: workbookToBuffer(workbook),
  };
}

async function buildMaintenanceLedgerExport(context: ExportContext): Promise<ExportPayload> {
  type EntryRow = {
    posted_at: string;
    occupant_name: string;
    student_id: string;
    entry_type: string;
    amount_pesos: number;
    method: string;
    note: string;
  };

  type LedgerRow = {
    occupant_id: string | null;
    posted_at: string;
    entry_type: string;
    amount_pesos: number;
    method: string | null;
    note: string | null;
    occupant: JoinValue<{ full_name: string | null; student_id: string | null }>;
  };

  let query = context.supabase
    .from("ledger_entries")
    .select(
      "occupant_id, posted_at, entry_type, amount_pesos, method, note, occupant:occupants(full_name, student_id), voided_at"
    )
    .eq("dorm_id", context.dormId)
    .eq("ledger", "maintenance_fee")
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  query = applyTimestampRange(
    query,
    "posted_at",
    context.rangeStartIso,
    context.rangeEndIso
  );

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as LedgerRow[];

  const balanceByOccupant = new Map<string, { occupant_name: string; student_id: string; balance: number }>();
  const entryRows: EntryRow[] = [];

  for (const row of rows) {
    const occupant = firstJoin(row.occupant);
    const occupantName = occupant?.full_name ?? "Unknown";
    const studentId = occupant?.student_id ?? "";

    entryRows.push({
      posted_at: formatTimestamp(row.posted_at),
      occupant_name: occupantName,
      student_id: studentId,
      entry_type: row.entry_type,
      amount_pesos: formatPeso(Number(row.amount_pesos)),
      method: row.method ?? "",
      note: row.note ?? "",
    });

    if (!row.occupant_id) {
      continue;
    }

    const current =
      balanceByOccupant.get(row.occupant_id) ??
      {
        occupant_name: occupantName,
        student_id: studentId,
        balance: 0,
      };
    current.balance += Number(row.amount_pesos);
    balanceByOccupant.set(row.occupant_id, current);
  }

  const balanceRows = [...balanceByOccupant.values()]
    .sort((left, right) => right.balance - left.balance)
    .map((row) => ({
      "Occupant": row.occupant_name,
      "Student ID": row.student_id,
      "Balance (₱)": formatPeso(row.balance),
      "Status": row.balance <= 0 ? "CLEARED" : "OUTSTANDING",
    }));

  const workbook = buildWorkbook();
  appendSheet(workbook, "Maintenance Balances", balanceRows, [
    "Occupant",
    "Student ID",
    "Balance (₱)",
    "Status",
  ]);
  appendSheet(workbook, "Maintenance Entries", entryRows.map(r => ({
    "Date": r.posted_at,
    "Occupant": r.occupant_name,
    "Student ID": r.student_id,
    "Type": r.entry_type,
    "Amount (₱)": r.amount_pesos,
    "Method": r.method,
    "Note": r.note,
  })), [
    "Date",
    "Occupant",
    "Student ID",
    "Type",
    "Amount (₱)",
    "Method",
    "Note",
  ]);
  appendMetadataSheet(workbook, [
    { key: "Report", value: "Maintenance Ledger" },
    { key: "Dorm", value: context.dormName },
    { key: "Date start", value: context.rangeStartRaw ?? "(none)" },
    { key: "Date end", value: context.rangeEndRaw ?? "(none)" },
    { key: "Generated at", value: new Date().toISOString() },
  ]);

  return {
    fileName: `maintenance-ledger-${context.dormSlug}-${todaySuffix()}.xlsx`,
    buffer: workbookToBuffer(workbook),
  };
}

async function buildEventContributionExport(context: ExportContext): Promise<ExportPayload> {
  type EntryRow = {
    posted_at: string;
    event_title: string;
    occupant_name: string;
    student_id: string;
    entry_type: string;
    amount_pesos: number;
    method: string;
    note: string;
  };

  type LedgerRow = {
    event_id: string | null;
    posted_at: string;
    entry_type: string;
    amount_pesos: number;
    method: string | null;
    note: string | null;
    event: JoinValue<{ title: string | null }>;
    occupant: JoinValue<{ full_name: string | null; student_id: string | null }>;
  };

  let query = context.supabase
    .from("ledger_entries")
    .select(
      "event_id, posted_at, entry_type, amount_pesos, method, note, event:events(title), occupant:occupants(full_name, student_id), voided_at"
    )
    .eq("dorm_id", context.dormId)
    .eq("ledger", "contributions")
    .is("voided_at", null)
    .order("posted_at", { ascending: false });

  query = applyTimestampRange(
    query,
    "posted_at",
    context.rangeStartIso,
    context.rangeEndIso
  );

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as LedgerRow[];

  const summaryByEvent = new Map<string, { event_title: string; charged: number; collected: number; balance: number }>();
  const entryRows: EntryRow[] = [];

  for (const row of rows) {
    const event = firstJoin(row.event);
    const occupant = firstJoin(row.occupant);
    const eventTitle = event?.title ?? "Unlinked event";
    const eventKey = row.event_id ?? `unlinked-${eventTitle}`;
    const amount = Number(row.amount_pesos);

    const summary =
      summaryByEvent.get(eventKey) ??
      {
        event_title: eventTitle,
        charged: 0,
        collected: 0,
        balance: 0,
      };

    if (amount >= 0) {
      summary.charged += amount;
    } else {
      summary.collected += Math.abs(amount);
    }
    summary.balance = summary.charged - summary.collected;
    summaryByEvent.set(eventKey, summary);

    entryRows.push({
      posted_at: formatTimestamp(row.posted_at),
      event_title: eventTitle,
      occupant_name: occupant?.full_name ?? "",
      student_id: occupant?.student_id ?? "",
      entry_type: row.entry_type,
      amount_pesos: formatPeso(amount),
      method: row.method ?? "",
      note: row.note ?? "",
    });
  }

  const summaryRows = [...summaryByEvent.values()]
    .sort((left, right) => left.event_title.localeCompare(right.event_title))
    .map((row) => ({
      "Event": row.event_title,
      "Charged (₱)": formatPeso(row.charged),
      "Collected (₱)": formatPeso(row.collected),
      "Balance (₱)": formatPeso(row.balance),
    }));

  const workbook = buildWorkbook();
  appendSheet(workbook, "Event Summary", summaryRows, [
    "Event",
    "Charged (₱)",
    "Collected (₱)",
    "Balance (₱)",
  ]);
  appendSheet(workbook, "Event Entries", entryRows.map(r => ({
    "Date": r.posted_at,
    "Event": r.event_title,
    "Occupant": r.occupant_name,
    "Student ID": r.student_id,
    "Type": r.entry_type,
    "Amount (₱)": r.amount_pesos,
    "Method": r.method,
    "Note": r.note,
  })), [
    "Date",
    "Event",
    "Occupant",
    "Student ID",
    "Type",
    "Amount (₱)",
    "Method",
    "Note",
  ]);
  appendMetadataSheet(workbook, [
    { key: "Report", value: "Event Contributions" },
    { key: "Dorm", value: context.dormName },
    { key: "Date start", value: context.rangeStartRaw ?? "(none)" },
    { key: "Date end", value: context.rangeEndRaw ?? "(none)" },
    { key: "Generated at", value: new Date().toISOString() },
  ]);

  return {
    fileName: `event-contributions-${context.dormSlug}-${todaySuffix()}.xlsx`,
    buffer: workbookToBuffer(workbook),
  };
}

async function buildEvaluationRankingExport(context: ExportContext): Promise<ExportPayload> {
  type CycleRow = {
    id: string;
    school_year: string;
    semester: number;
    label: string | null;
    is_active: boolean;
  };

  type SummaryRow = {
    occupant_id: string;
    full_name: string;
    peer_score: number | null;
    sa_score: number;
    total_fine_points: number;
    final_score: number;
  };

  const requestedCycleId = context.searchParams.get("cycle_id");

  let cycle: CycleRow | null = null;
  if (requestedCycleId) {
    const { data, error } = await context.supabase
      .from("evaluation_cycles")
      .select("id, school_year, semester, label, is_active")
      .eq("dorm_id", context.dormId)
      .eq("id", requestedCycleId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    cycle = (data as CycleRow | null) ?? null;
  } else {
    const { data, error } = await context.supabase
      .from("evaluation_cycles")
      .select("id, school_year, semester, label, is_active")
      .eq("dorm_id", context.dormId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    cycle = (data as CycleRow | null) ?? null;
  }

  if (!cycle) {
    throw new Error("No evaluation cycle found for ranking export.");
  }

  const { data, error } = await context.supabase.rpc("get_evaluation_summary", {
    p_cycle_id: cycle.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  const sortedRows = ((data ?? []) as SummaryRow[])
    .map((row) => ({
      ...row,
      final_score: Number(row.final_score ?? 0),
      peer_score: row.peer_score == null ? null : Number(row.peer_score),
      sa_score: Number(row.sa_score ?? 0),
      total_fine_points: Number(row.total_fine_points ?? 0),
    }))
    .sort((left, right) => right.final_score - left.final_score);

  const topCutoff = sortedRows.length ? Math.ceil(sortedRows.length * 0.3) : 0;
  const rankingRows = sortedRows.map((row, index) => ({
    "Rank": index + 1,
    "Occupant": row.full_name,
    "Peer Score": row.peer_score == null ? "" : Number(row.peer_score.toFixed(2)),
    "SA Score": Number(row.sa_score.toFixed(2)),
    "Total Fine Points": Number(row.total_fine_points.toFixed(2)),
    "Final Score": Number(row.final_score.toFixed(2)),
    "Retention Band": index < topCutoff ? "TOP 30%" : "",
  }));

  const workbook = buildWorkbook();
  appendSheet(workbook, "Ranking", rankingRows, [
    "Rank",
    "Occupant",
    "Peer Score",
    "SA Score",
    "Total Fine Points",
    "Final Score",
    "Retention Band",
  ]);
  appendMetadataSheet(workbook, [
    { key: "Report", value: "Evaluation Rankings" },
    { key: "Dorm", value: context.dormName },
    { key: "Cycle id", value: cycle.id },
    {
      key: "Cycle",
      value: `${cycle.label ?? "Evaluation Cycle"} (${cycle.school_year} Sem ${cycle.semester})`,
    },
    { key: "Date start", value: context.rangeStartRaw ?? "(none)" },
    { key: "Date end", value: context.rangeEndRaw ?? "(none)" },
    { key: "Generated at", value: new Date().toISOString() },
  ]);

  return {
    fileName: `evaluation-rankings-${context.dormSlug}-${normalizeFilePart(cycle.label ?? cycle.id)}-${todaySuffix()}.xlsx`,
    buffer: workbookToBuffer(workbook),
  };
}

async function buildExport(context: ExportContext): Promise<ExportPayload> {
  switch (context.report) {
    case "fines-ledger":
      return buildFinesLedgerExport(context);
    case "occupant-statement":
      return buildOccupantStatementExport(context);
    case "maintenance-ledger":
      return buildMaintenanceLedgerExport(context);
    case "event-contributions":
      return buildEventContributionExport(context);
    case "evaluation-rankings":
      return buildEvaluationRankingExport(context);
    default:
      throw new Error("Unsupported export report.");
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ report: string }> }
) {
  const { report } = await params;
  if (!REPORTS.has(report as ReportKey)) {
    return NextResponse.json({ error: "Unsupported export report." }, { status: 404 });
  }

  const context = await resolveContext(report as ReportKey, request);
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const payload = await buildExport(context);

    return new NextResponse(new Uint8Array(payload.buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${payload.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build export.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
