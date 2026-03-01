import { createSupabaseServerClient } from "@/lib/supabase/server";

const MANUAL_EXPENSE_MARKER = "[treasurer_finance_manual]";

type SemesterRow = {
  id: string;
  label: string;
  starts_on: string | null;
};

type ContributionLedgerRow = {
  semester_id: string | null;
  entry_type: string;
  amount_pesos: number | string | null;
  metadata: Record<string, unknown> | null;
};

type ContributionExpenseRow = {
  semester_id: string;
  amount_pesos: number | string;
  status: string;
  transparency_notes: string | null;
};

export type TreasurerSemesterSnapshot = {
  semesterId: string;
  semesterLabel: string;
  startsOn: string | null;
  inflow: number;
  approvedExpense: number;
  net: number;
  handoverIn: number;
  closingCash: number;
};

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function hasContributionId(metadata: Record<string, unknown>) {
  return (
    (typeof metadata.contribution_id === "string" && metadata.contribution_id.trim().length > 0) ||
    (typeof metadata.payable_batch_id === "string" && metadata.payable_batch_id.trim().length > 0)
  );
}

function isManualInflowRow(row: ContributionLedgerRow) {
  const metadata = asMetadataRecord(row.metadata);
  return metadata.finance_manual_inflow === true;
}

function isLegacyImportedContributionRow(row: ContributionLedgerRow) {
  const metadata = asMetadataRecord(row.metadata);
  if (hasContributionId(metadata)) {
    return false;
  }

  const importSource =
    typeof metadata.import_source === "string" && metadata.import_source.trim().length > 0
      ? metadata.import_source.trim().toLowerCase()
      : "";

  return importSource.startsWith("gdrive_");
}

function isApprovedContributionExpense(row: ContributionExpenseRow) {
  const notes = row.transparency_notes ?? "";
  if (notes.includes(MANUAL_EXPENSE_MARKER)) {
    return row.status === "approved";
  }
  return row.status === "approved";
}

export async function getTreasurerSemesterSnapshots(
  dormId: string,
  injectedSupabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<TreasurerSemesterSnapshot[]> {
  const supabase = injectedSupabase ?? (await createSupabaseServerClient());
  if (!supabase) {
    return [];
  }

  const { data: semestersData, error: semestersError } = await supabase
    .from("dorm_semesters")
    .select("id, label, starts_on")
    .is("dorm_id", null)
    .order("starts_on", { ascending: true });

  if (semestersError) {
    throw new Error(semestersError.message);
  }

  const semesters = (semestersData ?? []) as SemesterRow[];
  if (!semesters.length) {
    return [];
  }

  const semesterIds = semesters.map((semester) => semester.id);

  const [{ data: ledgerData, error: ledgerError }, { data: expensesData, error: expensesError }] =
    await Promise.all([
      supabase
        .from("ledger_entries")
        .select("semester_id, entry_type, amount_pesos, metadata")
        .eq("dorm_id", dormId)
        .eq("ledger", "contributions")
        .in("semester_id", semesterIds)
        .is("voided_at", null),
      supabase
        .from("expenses")
        .select("semester_id, amount_pesos, status, transparency_notes")
        .eq("dorm_id", dormId)
        .eq("category", "contributions")
        .in("semester_id", semesterIds),
    ]);

  if (ledgerError) {
    throw new Error(ledgerError.message);
  }
  if (expensesError) {
    throw new Error(expensesError.message);
  }

  const ledgerRows = (ledgerData ?? []) as ContributionLedgerRow[];
  const expenseRows = (expensesData ?? []) as ContributionExpenseRow[];

  const bySemester = new Map(
    semesters.map((semester) => [
      semester.id,
      {
        inflow: 0,
        approvedExpense: 0,
      },
    ])
  );

  for (const row of ledgerRows) {
    if (!row.semester_id || !bySemester.has(row.semester_id)) continue;

    const amount = Number(row.amount_pesos ?? 0);
    const isPayment = row.entry_type === "payment" || amount < 0;
    if (!isPayment) continue;

    const accumulator = bySemester.get(row.semester_id);
    if (!accumulator) continue;

    if (isManualInflowRow(row)) {
      accumulator.inflow += Math.abs(amount);
      continue;
    }

    if (isLegacyImportedContributionRow(row)) {
      continue;
    }

    accumulator.inflow += Math.abs(amount);
  }

  for (const row of expenseRows) {
    if (!row.semester_id || !bySemester.has(row.semester_id)) continue;
    if (!isApprovedContributionExpense(row)) continue;

    const accumulator = bySemester.get(row.semester_id);
    if (!accumulator) continue;
    accumulator.approvedExpense += Number(row.amount_pesos ?? 0);
  }

  const snapshots: TreasurerSemesterSnapshot[] = [];
  let carry = 0;
  for (const semester of semesters) {
    const aggregate = bySemester.get(semester.id) ?? { inflow: 0, approvedExpense: 0 };
    const inflow = Number(aggregate.inflow.toFixed(2));
    const approvedExpense = Number(aggregate.approvedExpense.toFixed(2));
    const handoverIn = Number(carry.toFixed(2));
    const net = Number((inflow - approvedExpense).toFixed(2));
    const closingCash = Number((handoverIn + net).toFixed(2));

    snapshots.push({
      semesterId: semester.id,
      semesterLabel: semester.label,
      startsOn: semester.starts_on,
      inflow,
      approvedExpense,
      net,
      handoverIn,
      closingCash,
    });

    carry = closingCash;
  }

  return snapshots;
}

