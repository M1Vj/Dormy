import fs from "node:fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const workbookPath = process.argv[2];

if (!workbookPath) {
  console.error("Usage: npm run import:occupants:xlsx -- <path-to-xlsx>");
  process.exit(1);
}

if (!fs.existsSync(workbookPath)) {
  console.error(`File not found: ${workbookPath}`);
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

const dormSlug = process.env.DORMY_DORM_SLUG || "molave-mens-hall";
const sheetName = process.env.DORMY_OCCUPANT_SHEET || "ALPHABETICAL";
const defaultJoinedAt =
  process.env.DORMY_OCCUPANT_JOINED_AT ||
  new Date().toISOString().slice(0, 10);
const defaultStatus = process.env.DORMY_OCCUPANT_STATUS || "active";

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: dorm, error: dormError } = await supabase
  .from("dorms")
  .select("id, slug")
  .eq("slug", dormSlug)
  .single();

if (dormError || !dorm) {
  console.error(dormError?.message ?? `Dorm not found: ${dormSlug}`);
  process.exit(1);
}

const workbook = XLSX.readFile(workbookPath);
const sheet = workbook.Sheets[sheetName];

if (!sheet) {
  console.error(
    `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
  );
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const occupants = rows
  .map((row) => ({
    full_name: clean(row["Name"]),
    classification: clean(row["Degree Program "] || row["Degree Program"]),
  }))
  .filter((row) => row.full_name && row.full_name.toLowerCase() !== "name")
  .filter((row) => row.full_name.toLowerCase() !== "bigbrods");

if (occupants.length === 0) {
  console.error("No occupant rows found in spreadsheet.");
  process.exit(1);
}

let inserted = 0;
let updated = 0;
let failed = 0;

for (const occupant of occupants) {
  const { data: existing, error: lookupError } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dorm.id)
    .eq("full_name", occupant.full_name)
    .maybeSingle();

  if (lookupError) {
    failed += 1;
    console.log(`lookup failed: ${occupant.full_name} (${lookupError.message})`);
    continue;
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("occupants")
      .update({
        classification: occupant.classification || null,
        status: defaultStatus,
      })
      .eq("id", existing.id);

    if (updateError) {
      failed += 1;
      console.log(`update failed: ${occupant.full_name} (${updateError.message})`);
    } else {
      updated += 1;
    }

    continue;
  }

  const { error: insertError } = await supabase.from("occupants").insert({
    dorm_id: dorm.id,
    full_name: occupant.full_name,
    classification: occupant.classification || null,
    status: defaultStatus,
    joined_at: defaultJoinedAt,
  });

  if (insertError) {
    failed += 1;
    console.log(`insert failed: ${occupant.full_name} (${insertError.message})`);
  } else {
    inserted += 1;
  }
}

console.log(
  `import complete: ${occupants.length} rows processed, ${inserted} inserted, ${updated} updated, ${failed} failed`
);
