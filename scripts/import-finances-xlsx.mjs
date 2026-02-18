import "./load-env.mjs";

import fs from "node:fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const financesWorkbookPath = process.argv[2];
const dormSlug = process.argv[3] || process.env.DORMY_DORM_SLUG || "molave-mens-hall";
const ledgerCategory = process.argv[4] || "treasurer_events"; // sa_fines, treasurer_events, adviser_maintenance

if (!financesWorkbookPath) {
  console.error(
    "Usage: npm run import:finances:xlsx -- <finances-xlsx> [dorm-slug] [ledger-category]"
  );
  process.exit(1);
}

if (!fs.existsSync(financesWorkbookPath)) {
  console.error(`File not found: ${financesWorkbookPath}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const clean = (value) =>
  String(value ?? "")
    .replace(/\u200e|\u200f/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeNameKey = (value) => clean(value).toLowerCase();

const { data: dorm, error: dormError } = await supabase
  .from("dorms")
  .select("id, slug")
  .eq("slug", dormSlug)
  .single();

if (dormError || !dorm) {
  console.error(dormError?.message ?? `Dorm not found: ${dormSlug}`);
  process.exit(1);
}

const { data: occupants, error: occupantsError } = await supabase
  .from("occupants")
  .select("id, full_name")
  .eq("dorm_id", dorm.id);

if (occupantsError) {
  console.error(`Failed to fetch occupants: ${occupantsError.message}`);
  process.exit(1);
}

const occupantIdByName = new Map(
  occupants.map((o) => [normalizeNameKey(o.full_name), o.id])
);

const workbook = XLSX.readFile(financesWorkbookPath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

console.log(`Processing ${rows.length} rows from sheet "${sheetName}"...`);

let inserted = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const rawName = clean(row["Name"] || row["Occupant"] || row["Full Name"]);
  const rawAmount = parseFloat(row["Amount"] || row["Value"] || 0);
  const rawDate = row["Date"] || row["Timestamp"] || new Date().toISOString();
  const rawNote = clean(row["Note"] || row["Description"] || row["Reason"] || "Imported payment");
  const rawType = clean(row["Type"] || "payment").toLowerCase(); // payment or charge

  if (!rawName) {
    console.warn("Skipping row with missing name");
    skipped++;
    continue;
  }

  const nameKey = normalizeNameKey(rawName);
  const occupantId = occupantIdByName.get(nameKey);

  if (!occupantId) {
    console.warn(`Occupant not found for name: ${rawName}`);
    failed++;
    continue;
  }

  // Calculate signed amount
  // payment should be negative in ledger_entries (reduces balance)
  // charge should be positive (increases balance)
  const finalAmount = rawType === "payment" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  const { error: insertError } = await supabase.from("ledger_entries").insert({
    dorm_id: dorm.id,
    ledger: ledgerCategory,
    entry_type: rawType === "payment" ? "payment" : "charge",
    occupant_id: occupantId,
    amount_pesos: finalAmount,
    note: rawNote,
    posted_at: new Date(rawDate).toISOString(),
    metadata: {
      import_source: "gdrive_migration",
      original_row: row,
    },
  });

  if (insertError) {
    console.error(`Failed to insert entry for ${rawName}: ${insertError.message}`);
    failed++;
  } else {
    inserted++;
  }
}

console.log(
  JSON.stringify(
    {
      rows_processed: rows.length,
      entries_inserted: inserted,
      rows_skipped: skipped,
      failed_matches: failed,
    },
    null,
    2
  )
);
