import "./load-env.mjs";

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXCLUDED_SOURCE = "2nd Placer sa ATI (Most Sustained Garden)";
const MANUAL_EXPENSE_MARKER = "[treasurer_finance_manual]";
const IMPORT_BATCH = "first_sem_aug_dec_2025";

const args = process.argv.slice(2);
const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
const sourceDir =
  positionalArgs[0] ||
  "output/spreadsheet/treasurer_drive_extract_2026_02_25/first_sem_aug_2025_to_dec_2025/normalized_json";
const dormSlug = positionalArgs[1] || process.env.DORMY_DORM_SLUG || "molave-mens-hall";
const dryRun = args.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clean = (value) =>
  String(value ?? "")
    .replace(/\u200e|\u200f|\ufeff/g, "")
    .replace(/\s+/g, " ")
    .trim();

const monthMap = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function parseAmount(raw) {
  const text = clean(raw).replace(/,/g, "").replace(/₱/g, "");
  if (!text) return null;
  const normalized = text.replace(/\s+/g, "");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseDate(raw, fallback = "2025-12-31") {
  const value = clean(raw);
  if (!value) return fallback;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const rangeMatch = value.match(/^([^–-]+)\s*[–-]\s*([^–-]+)$/);
  if (rangeMatch) {
    return parseDate(rangeMatch[1], fallback);
  }

  const mdYMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdYMatch) {
    const [, m, d, y] = mdYMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const monthDayYear = value.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (monthDayYear) {
    const month = monthMap[monthDayYear[1].toLowerCase()];
    if (month) {
      const day = monthDayYear[2].padStart(2, "0");
      const year = monthDayYear[3] ?? "2025";
      return `${year}-${month}-${day}`;
    }
  }

  const monthYear = value.match(/^([A-Za-z]+)(?:\s+(\d{4}))?$/);
  if (monthYear) {
    const month = monthMap[monthYear[1].toLowerCase()];
    if (month) {
      const year = monthYear[2] ?? "2025";
      return `${year}-${month}-01`;
    }
  }

  return fallback;
}

function readJson(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing file: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function rowFirstValue(row) {
  const values = Object.values(row ?? {});
  return values.length ? values[0] : "";
}

function buildImportKey(parts) {
  return parts.map((part) => clean(part).toLowerCase()).join("|");
}

async function resolveDorm(dormSlugValue) {
  const { data, error } = await supabase
    .from("dorms")
    .select("id, slug, name")
    .eq("slug", dormSlugValue)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? `Dorm not found: ${dormSlugValue}`);
  }
  return data;
}

async function resolveSemesterId(dormId) {
  const { data: semesters, error } = await supabase
    .from("dorm_semesters")
    .select("id, label, school_year, semester, starts_on, ends_on")
    .eq("dorm_id", dormId)
    .order("starts_on", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = semesters ?? [];
  const directMatch =
    rows.find((row) => clean(row.semester).toLowerCase() === "first" && clean(row.school_year) === "2025-2026") ??
    rows.find((row) => clean(row.label).toLowerCase().includes("first") && clean(row.school_year).includes("2025")) ??
    rows.find((row) => row.starts_on <= "2025-12-31" && row.ends_on >= "2025-08-01");

  if (directMatch) return directMatch.id;

  const { data: created, error: createError } = await supabase
    .from("dorm_semesters")
    .insert({
      dorm_id: dormId,
      school_year: "2025-2026",
      semester: "first",
      label: "First Semester AY 2025-2026",
      starts_on: "2025-08-01",
      ends_on: "2025-12-31",
      status: "archived",
      metadata: {
        import_batch: IMPORT_BATCH,
        source: "treasurer_drive_extract",
      },
    })
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message ?? "Failed to create first semester row.");
  }

  return created.id;
}

async function resolveTreasurerUserId(dormId) {
  const { data, error } = await supabase
    .from("dorm_memberships")
    .select("user_id, role")
    .eq("dorm_id", dormId)
    .eq("role", "treasurer")
    .limit(1);

  if (error) throw new Error(error.message);
  const userId = data?.[0]?.user_id ?? null;
  if (!userId) {
    throw new Error("No treasurer membership found for this dorm. Cannot set submitted_by.");
  }
  return userId;
}

async function getExistingImportKeys(dormId, semesterId) {
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("ledger_entries")
    .select("metadata")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterId)
    .eq("ledger", "contributions")
    .is("voided_at", null);

  if (ledgerError) throw new Error(ledgerError.message);

  const ledgerKeys = new Set(
    (ledgerRows ?? [])
      .map((row) => row.metadata?.import_key)
      .filter((value) => typeof value === "string")
  );

  const { data: expenseRows, error: expenseError } = await supabase
    .from("expenses")
    .select("transparency_notes")
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterId)
    .eq("category", "contributions");

  if (expenseError) throw new Error(expenseError.message);

  const expenseKeys = new Set();
  for (const row of expenseRows ?? []) {
    const text = clean(row.transparency_notes);
    if (!text.includes(`import_batch=${IMPORT_BATCH}`)) continue;
    const keyMatch = text.match(/import_key=([^\n]+)/);
    if (keyMatch?.[1]) {
      expenseKeys.add(clean(keyMatch[1]));
    }
  }

  return { ledgerKeys, expenseKeys };
}

function prepareInflowRows(receivedMoneyRows) {
  const groupedBySource = new Map();

  for (const row of receivedMoneyRows) {
    const source = clean(row.source);
    const amount = parseAmount(row.amount);
    if (!source || !amount || amount <= 0) continue;
    if (source === EXCLUDED_SOURCE) continue;

    const dateRaw = rowFirstValue(row);
    const happenedOn = parseDate(dateRaw, "2025-12-31");
    const receivedFrom = clean(row.received_from);
    const notes = clean(row.notes);
    const receivedBy = clean(row.received_by);
    const sourceKey = source.toLowerCase();

    const existing = groupedBySource.get(sourceKey) ?? {
      source,
      happenedOn,
      totalAmount: 0,
      receivedFromSet: new Set(),
      notesSet: new Set(),
      receivedBySet: new Set(),
      rawRows: [],
    };

    existing.totalAmount += amount;
    if (happenedOn < existing.happenedOn) {
      existing.happenedOn = happenedOn;
    }
    if (receivedFrom) existing.receivedFromSet.add(receivedFrom);
    if (notes) existing.notesSet.add(notes);
    if (receivedBy) existing.receivedBySet.add(receivedBy);
    existing.rawRows.push(row);
    groupedBySource.set(sourceKey, existing);
  }

  const payloads = [];
  for (const group of groupedBySource.values()) {
    const receivedFrom = Array.from(group.receivedFromSet).join(", ");
    const notes = Array.from(group.notesSet).join(" | ");
    const receivedBy = Array.from(group.receivedBySet).join(", ");
    const note = [notes, receivedBy ? `Received by: ${receivedBy}` : ""].filter(Boolean).join(" · ");
    const totalAmount = Number(group.totalAmount.toFixed(2));
    const importKey = buildImportKey([
      "inflow-aggregate",
      group.source,
      group.happenedOn,
      totalAmount.toFixed(2),
      receivedFrom,
      note,
    ]);

    payloads.push({
      importKey,
      payload: {
        posted_at: `${group.happenedOn}T12:00:00.000Z`,
        amount_pesos: -Math.abs(totalAmount),
        note: group.source,
        metadata: {
          finance_manual_inflow: true,
          finance_source: "first_sem_import",
          finance_counterparty: receivedFrom || null,
          finance_note: note || null,
          import_batch: IMPORT_BATCH,
          import_key: importKey,
          import_raw_rows: group.rawRows,
        },
      },
    });
  }
  return payloads;
}

function prepareExpenseRows(expenseRowsRaw) {
  const payloads = [];
  for (const row of expenseRowsRaw) {
    const description = clean(row.description);
    const amount = parseAmount(row.amount);
    if (!description || !amount || amount <= 0) continue;

    const dateRaw = rowFirstValue(row);
    const happenedOn = parseDate(dateRaw, "2025-12-31");
    const personInCharge = clean(row.person_in_charge);
    const receipt = clean(row.receipt);
    const category = clean(row.category);
    const noteParts = [category ? `Category: ${category}` : "", receipt ? `Receipt: ${receipt}` : ""].filter(Boolean);
    const note = noteParts.join(" · ");
    const importKey = buildImportKey(["expense", description, happenedOn, amount.toFixed(2), personInCharge, note]);

    const transparencyNotes = [
      MANUAL_EXPENSE_MARKER,
      `import_batch=${IMPORT_BATCH}`,
      `import_key=${importKey}`,
      note,
    ]
      .filter(Boolean)
      .join("\n");

    payloads.push({
      importKey,
      payload: {
        title: description,
        description: note || null,
        amount_pesos: Number(amount.toFixed(2)),
        purchased_at: happenedOn,
        status: "approved",
        approval_comment: "Imported from first semester treasurer data",
        approved_at: new Date().toISOString(),
        category: "contributions",
        expense_group_title: description,
        contribution_reference_title: null,
        vendor_name: personInCharge || null,
        payment_method: "manual_import",
        purchased_by: personInCharge || null,
        transparency_notes: transparencyNotes,
      },
    });
  }
  return payloads;
}

async function run() {
  const receivedMoneyPath = path.join(sourceDir, "dorm-finance__1TjS42pQ__received-money.json");
  const expensesPath = path.join(sourceDir, "dorm-finance__1TjS42pQ__expenses.json");

  const receivedMoneyJson = readJson(receivedMoneyPath);
  const expensesJson = readJson(expensesPath);

  const dorm = await resolveDorm(dormSlug);
  const semesterId = await resolveSemesterId(dorm.id);
  const treasurerUserId = await resolveTreasurerUserId(dorm.id);

  const inflows = prepareInflowRows(receivedMoneyJson.records ?? []);
  const expenses = prepareExpenseRows(expensesJson.records ?? []);
  const { ledgerKeys, expenseKeys } = await getExistingImportKeys(dorm.id, semesterId);

  const inflowsToInsert = inflows.filter((item) => !ledgerKeys.has(item.importKey));
  const expensesToInsert = expenses.filter((item) => !expenseKeys.has(item.importKey));

  if (!dryRun && inflowsToInsert.length > 0) {
    const { error } = await supabase.from("ledger_entries").insert(
      inflowsToInsert.map((item) => ({
        dorm_id: dorm.id,
        semester_id: semesterId,
        ledger: "contributions",
        entry_type: "payment",
        occupant_id: null,
        event_id: null,
        fine_id: null,
        method: "manual_import",
        created_by: treasurerUserId,
        ...item.payload,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (!dryRun && expensesToInsert.length > 0) {
    const { error } = await supabase.from("expenses").insert(
      expensesToInsert.map((item) => ({
        dorm_id: dorm.id,
        semester_id: semesterId,
        committee_id: null,
        submitted_by: treasurerUserId,
        receipt_storage_path: null,
        approved_by: treasurerUserId,
        official_receipt_no: null,
        quantity: null,
        unit_cost_pesos: null,
        ...item.payload,
      }))
    );
    if (error) throw new Error(error.message);
  }

  const summary = {
    dorm: { id: dorm.id, slug: dorm.slug, name: dorm.name },
    semester_id: semesterId,
    dry_run: dryRun,
    totals: {
      inflow_rows_seen: inflows.length,
      expense_rows_seen: expenses.length,
      inflow_inserted: inflowsToInsert.length,
      expense_inserted: expensesToInsert.length,
      inflow_skipped_existing: inflows.length - inflowsToInsert.length,
      expense_skipped_existing: expenses.length - expensesToInsert.length,
    },
    excluded_source: EXCLUDED_SOURCE,
  };

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
