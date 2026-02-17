import "./load-env.mjs";

import fs from "node:fs";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const occupantsWorkbookPath = process.argv[2];
const bigbrodsRoomsWorkbookPath = process.argv[3]; // optional

if (!occupantsWorkbookPath) {
  console.error(
    "Usage: npm run import:occupants:xlsx -- <occupants-xlsx> [bigbrods-rooms-xlsx]"
  );
  process.exit(1);
}

if (!fs.existsSync(occupantsWorkbookPath)) {
  console.error(`File not found: ${occupantsWorkbookPath}`);
  process.exit(1);
}

if (bigbrodsRoomsWorkbookPath && !fs.existsSync(bigbrodsRoomsWorkbookPath)) {
  console.error(`File not found: ${bigbrodsRoomsWorkbookPath}`);
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
const byRoomSheetName = process.env.DORMY_OCCUPANT_BY_ROOM_SHEET || "BY ROOM";
const defaultJoinedAt =
  process.env.DORMY_OCCUPANT_JOINED_AT ||
  new Date().toISOString().slice(0, 10);
const defaultStatus = process.env.DORMY_OCCUPANT_STATUS || "active";
const assignmentStartDate =
  process.env.DORMY_ROOM_ASSIGNMENT_START_DATE || defaultJoinedAt;

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const clean = (value) =>
  String(value ?? "")
    .replace(/\u200e|\u200f/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeNameKey = (value) => clean(value).toLowerCase();

const getLooseNameKey = (value) => {
  const name = clean(value).toLowerCase();
  if (!name) return "";
  const parts = name.split(",");
  if (parts.length < 2) {
    const first = name.split(" ")[0] ?? "";
    return `${name}:${first.slice(0, 3)}`;
  }
  const last = parts[0].trim();
  const rest = parts.slice(1).join(",").trim();
  const firstToken = rest.split(" ")[0] ?? "";
  return `${last}:${firstToken.slice(0, 3)}`;
};

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseBirthdate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  const raw = clean(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const normalized = raw
    .replace(/\./g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})\s*,\s*(\d{4})$/i
  );
  if (!match) return null;

  const monthToken = match[1].toLowerCase();
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (!day || !year) return null;

  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const month = monthMap[monthToken];
  if (!month) return null;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const parsePhone = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const raw = clean(value);
  if (!raw) return null;
  return raw.replace(/[^\d+]/g, "");
};

const parseEmail = (value) => {
  const raw = clean(value);
  if (!raw) return null;
  return raw.toLowerCase();
};

const getRowValue = (row, keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const rowToOccupant = (row) => {
  const full_name = clean(getRowValue(row, ["Name"]));
  if (!full_name) return null;

  const classification = clean(
    getRowValue(row, ["Degree Program ", "Degree Program"])
  );
  const home_address = clean(getRowValue(row, ["Home Adress", "Home Address"]));
  const birthdate = parseBirthdate(getRowValue(row, ["Birthday"]));
  const contact_mobile = parsePhone(getRowValue(row, ["Mobile Number"]));
  const contact_email = parseEmail(getRowValue(row, ["Email Adress", "Email Address"]));
  const emergency_contact_name = clean(
    getRowValue(row, ["Emergency Contact Person ", "Emergency Contact Person"])
  );
  const emergency_contact_mobile = parsePhone(
    getRowValue(row, ["Mobile Number_1", "Mobile Number.1", "Mobile Number 1"])
  );
  const emergency_contact_relationship = clean(
    getRowValue(row, ["Relationship to Occupant"])
  );

  return {
    full_name,
    classification: classification || null,
    home_address: home_address || null,
    birthdate: birthdate || null,
    contact_mobile: contact_mobile || null,
    contact_email: contact_email || null,
    emergency_contact_name: emergency_contact_name || null,
    emergency_contact_mobile: emergency_contact_mobile || null,
    emergency_contact_relationship: emergency_contact_relationship || null,
  };
};

const { data: dorm, error: dormError } = await supabase
  .from("dorms")
  .select("id, slug")
  .eq("slug", dormSlug)
  .single();

if (dormError || !dorm) {
  console.error(dormError?.message ?? `Dorm not found: ${dormSlug}`);
  process.exit(1);
}

const workbook = XLSX.readFile(occupantsWorkbookPath, { cellDates: true });
const sheet = workbook.Sheets[sheetName];
const byRoomSheet = workbook.Sheets[byRoomSheetName];

if (!sheet) {
  console.error(
    `Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
  );
  process.exit(1);
}

if (!byRoomSheet) {
  console.error(
    `Sheet "${byRoomSheetName}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`
  );
  process.exit(1);
}

const baseRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
const byRoomRows = XLSX.utils.sheet_to_json(byRoomSheet, { defval: "" });

const occupantsByKey = new Map();
const occupantLooseKeyToKeys = new Map(); // looseKey -> occupantKey[]

const upsertOccupantData = (occupant) => {
  if (!occupant?.full_name) return;
  const key = normalizeNameKey(occupant.full_name);
  if (!key || key === "name" || key === "bigbrods") return;

  const existing = occupantsByKey.get(key);
  if (!existing) {
    occupantsByKey.set(key, occupant);
  } else {
    for (const [field, value] of Object.entries(occupant)) {
      if (field === "full_name") continue;
      if (existing[field]) continue;
      if (value) existing[field] = value;
    }
  }
};

for (const row of baseRows) {
  const occupant = rowToOccupant(row);
  if (!occupant) continue;
  upsertOccupantData(occupant);
}

const assignmentsByKey = new Map(); // occupantKey -> roomNumber
const roomOrder = new Map(); // roomNumber -> occupantKey[] in source order
const bigbrodsKeys = new Set();

const pushRoomOrder = (roomNumber, occupantKey) => {
  const list = roomOrder.get(roomNumber) ?? [];
  if (!list.includes(occupantKey)) list.push(occupantKey);
  roomOrder.set(roomNumber, list);
};

let currentRoomNumber = null;
let inBigbrodsList = false;
for (const row of byRoomRows) {
  const rawName = clean(getRowValue(row, ["Name"]));
  const nameKey = normalizeNameKey(rawName);
  if (!nameKey) continue;

  const roomMatch = rawName.match(/^room\s+(\d+)\s*$/i);
  if (roomMatch) {
    currentRoomNumber = Number.parseInt(roomMatch[1], 10);
    if (Number.isNaN(currentRoomNumber)) currentRoomNumber = null;
    inBigbrodsList = false;
    continue;
  }

  if (nameKey === "name") continue;
  if (nameKey === "bigbrods") {
    currentRoomNumber = null;
    inBigbrodsList = true;
    continue;
  }

  const occupant = rowToOccupant(row);
  if (occupant) upsertOccupantData(occupant);

  if (currentRoomNumber) {
    assignmentsByKey.set(nameKey, currentRoomNumber);
    pushRoomOrder(currentRoomNumber, nameKey);
  } else if (inBigbrodsList) {
    bigbrodsKeys.add(nameKey);
  }
}

for (const [key, occ] of occupantsByKey.entries()) {
  const loose = getLooseNameKey(occ.full_name);
  if (!loose) continue;
  const list = occupantLooseKeyToKeys.get(loose) ?? [];
  if (!list.includes(key)) list.push(key);
  occupantLooseKeyToKeys.set(loose, list);
}

if (bigbrodsRoomsWorkbookPath) {
  const bbWb = XLSX.readFile(bigbrodsRoomsWorkbookPath, { cellDates: true });
  const bbSheetName =
    process.env.DORMY_BIGBRODS_ROOM_SHEET || bbWb.SheetNames[0] || "Sheet1";
  const bbSheet = bbWb.Sheets[bbSheetName];

  if (!bbSheet) {
    console.error(
      `BigBrods sheet "${bbSheetName}" not found. Available sheets: ${bbWb.SheetNames.join(", ")}`
    );
    process.exit(1);
  }

  const bbRows = XLSX.utils.sheet_to_json(bbSheet, { header: 1, defval: "" });
  let startIndex = -1;
  for (let i = 0; i < bbRows.length; i += 1) {
    const left = clean(bbRows[i]?.[0]).toLowerCase();
    const right = clean(bbRows[i]?.[1]).toLowerCase();
    if (left === "room no." && right === "bigbrods") {
      startIndex = i + 1;
      break;
    }
  }

  if (startIndex >= 0) {
    let bbRoomNumber = null;
    for (let i = startIndex; i < bbRows.length; i += 1) {
      const row = bbRows[i] ?? [];
      const roomCell = clean(row[0]);
      const nameCell = clean(row[1]);
      if (!roomCell && !nameCell) continue;
      if (roomCell) {
        const n = Number.parseInt(roomCell, 10);
        bbRoomNumber = Number.isNaN(n) ? null : n;
      }
      if (!bbRoomNumber || !nameCell) continue;

      const exactKey = normalizeNameKey(nameCell);
      if (occupantsByKey.has(exactKey)) {
        assignmentsByKey.set(exactKey, bbRoomNumber);
        pushRoomOrder(bbRoomNumber, exactKey);
        continue;
      }

      const loose = getLooseNameKey(nameCell);
      if (!loose) continue;
      const candidates = occupantLooseKeyToKeys.get(loose) ?? [];
      if (candidates.length === 1) {
        assignmentsByKey.set(candidates[0], bbRoomNumber);
        pushRoomOrder(bbRoomNumber, candidates[0]);
        continue;
      }

      if (candidates.length > 1) {
        const scoped = candidates.filter((key) => bigbrodsKeys.has(key));
        if (scoped.length === 1) {
          assignmentsByKey.set(scoped[0], bbRoomNumber);
          pushRoomOrder(bbRoomNumber, scoped[0]);
        }
      }
    }
  }
}

const occupantList = Array.from(occupantsByKey.values());
if (occupantList.length === 0) {
  console.error("No occupant rows found in spreadsheet.");
  process.exit(1);
}

const roomDefs = [
  { code: "1", level: 1, capacity: 6, sort_order: 1 },
  { code: "2", level: 1, capacity: 6, sort_order: 2 },
  { code: "3", level: 1, capacity: 6, sort_order: 3 },
  { code: "4a", level: 2, capacity: 5, sort_order: 4 },
  { code: "4b", level: 2, capacity: 5, sort_order: 5 },
  { code: "5", level: 2, capacity: 6, sort_order: 6 },
  { code: "6", level: 2, capacity: 6, sort_order: 7 },
  { code: "7", level: 3, capacity: 6, sort_order: 8 },
  { code: "8", level: 3, capacity: 6, sort_order: 9 },
  { code: "9", level: 3, capacity: 6, sort_order: 10 },
  { code: "10a", level: 3, capacity: 5, sort_order: 11 },
  { code: "10b", level: 3, capacity: 5, sort_order: 12 },
];

const { error: roomSeedError } = await supabase.from("rooms").upsert(
  roomDefs.map((room) => ({
    dorm_id: dorm.id,
    code: room.code,
    level: room.level,
    capacity: room.capacity,
    sort_order: room.sort_order,
  })),
  { onConflict: "dorm_id,code" }
);

if (roomSeedError) {
  console.error(`Failed to seed rooms: ${roomSeedError.message}`);
  process.exit(1);
}

const { data: rooms, error: roomsError } = await supabase
  .from("rooms")
  .select("id, code, capacity")
  .eq("dorm_id", dorm.id);

if (roomsError) {
  console.error(`Failed to fetch rooms: ${roomsError.message}`);
  process.exit(1);
}

const roomByCode = new Map(
  (rooms ?? []).map((room) => [String(room.code).toLowerCase(), room])
);
const roomIdToCode = new Map(
  (rooms ?? []).map((room) => [room.id, String(room.code)])
);

const { data: existingOccupants, error: existingError } = await supabase
  .from("occupants")
  .select("id, full_name, joined_at")
  .eq("dorm_id", dorm.id);

if (existingError) {
  console.error(`Failed to fetch existing occupants: ${existingError.message}`);
  process.exit(1);
}

const existingByKey = new Map();
for (const occ of existingOccupants ?? []) {
  const key = normalizeNameKey(occ.full_name);
  if (!key) continue;
  if (!existingByKey.has(key)) existingByKey.set(key, occ);
}

let inserted = 0;
let updated = 0;
let failed = 0;

const occupantIdByKey = new Map();

for (const occupant of occupantList) {
  const key = normalizeNameKey(occupant.full_name);
  const existing = existingByKey.get(key);

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("occupants")
      .update({
        classification: occupant.classification,
        home_address: occupant.home_address,
        birthdate: occupant.birthdate,
        contact_mobile: occupant.contact_mobile,
        contact_email: occupant.contact_email,
        emergency_contact_name: occupant.emergency_contact_name,
        emergency_contact_mobile: occupant.emergency_contact_mobile,
        emergency_contact_relationship: occupant.emergency_contact_relationship,
        status: defaultStatus,
      })
      .eq("id", existing.id);

    if (updateError) {
      failed += 1;
      continue;
    }
    updated += 1;
    occupantIdByKey.set(key, existing.id);
    continue;
  }

  const { data: created, error: insertError } = await supabase
    .from("occupants")
    .insert({
      dorm_id: dorm.id,
      full_name: occupant.full_name,
      classification: occupant.classification,
      home_address: occupant.home_address,
      birthdate: occupant.birthdate,
      contact_mobile: occupant.contact_mobile,
      contact_email: occupant.contact_email,
      emergency_contact_name: occupant.emergency_contact_name,
      emergency_contact_mobile: occupant.emergency_contact_mobile,
      emergency_contact_relationship: occupant.emergency_contact_relationship,
      status: defaultStatus,
      joined_at: defaultJoinedAt,
    })
    .select("id")
    .single();

  if (insertError || !created?.id) {
    failed += 1;
    continue;
  }

  inserted += 1;
  occupantIdByKey.set(key, created.id);
}

const desiredRoomCodeByKey = new Map();

for (const [occKey, roomNumber] of assignmentsByKey.entries()) {
  if (!roomNumber) continue;
  if (roomNumber === 4 || roomNumber === 10) continue;
  desiredRoomCodeByKey.set(occKey, String(roomNumber));
}

const splitRoom = (roomNumber, codes, maxPerCode) => {
  const orderedKeys = roomOrder.get(roomNumber) ?? [];
  const unique = [];
  for (const key of orderedKeys) {
    if (assignmentsByKey.get(key) !== roomNumber) continue;
    if (!unique.includes(key)) unique.push(key);
  }
  for (const [key, n] of assignmentsByKey.entries()) {
    if (n !== roomNumber) continue;
    if (!unique.includes(key)) unique.push(key);
  }

  for (let i = 0; i < unique.length; i += 1) {
    const code = i < maxPerCode ? codes[0] : codes[1];
    desiredRoomCodeByKey.set(unique[i], code);
  }
};

splitRoom(4, ["4a", "4b"], 5);
splitRoom(10, ["10a", "10b"], 5);

const { data: activeAssignments, error: activeAssignmentsError } = await supabase
  .from("room_assignments")
  .select("id, occupant_id, room_id")
  .eq("dorm_id", dorm.id)
  .is("end_date", null);

if (activeAssignmentsError) {
  console.error(
    `Failed to fetch active room assignments: ${activeAssignmentsError.message}`
  );
  process.exit(1);
}

const activeAssignmentByOccupantId = new Map(
  (activeAssignments ?? []).map((a) => [a.occupant_id, a])
);

const activeRoomCodeByOccupantId = new Map();
for (const assignment of activeAssignments ?? []) {
  const code = roomIdToCode.get(assignment.room_id);
  if (!code) continue;
  activeRoomCodeByOccupantId.set(assignment.occupant_id, code);
}

let preservedAssignments = 0;
for (const [occKey, occupantId] of occupantIdByKey.entries()) {
  if (!occupantId) continue;
  if (desiredRoomCodeByKey.has(occKey)) continue;
  const activeCode = activeRoomCodeByOccupantId.get(occupantId);
  if (!activeCode) continue;
  desiredRoomCodeByKey.set(occKey, activeCode);
  preservedAssignments += 1;
}

const occupantKeys = Array.from(occupantIdByKey.keys());
let unassigned = occupantKeys.filter((key) => !desiredRoomCodeByKey.has(key));
let autoAssignedBigbrods = 0;

if (unassigned.length) {
  const remainingBigbrods = unassigned
    .filter((key) => bigbrodsKeys.has(key))
    .sort();

  if (remainingBigbrods.length) {
    const roomCountByCode = new Map();
    for (const code of desiredRoomCodeByKey.values()) {
      roomCountByCode.set(code, (roomCountByCode.get(code) ?? 0) + 1);
    }

    const pending = [...remainingBigbrods];
    for (const roomDef of roomDefs) {
      if (!pending.length) break;
      const room = roomByCode.get(roomDef.code.toLowerCase());
      const capacity = Number(room?.capacity ?? roomDef.capacity ?? 0);
      const currentCount = roomCountByCode.get(roomDef.code) ?? 0;
      let available = capacity - currentCount;
      while (available > 0 && pending.length) {
        const key = pending.shift();
        if (!key) break;
        desiredRoomCodeByKey.set(key, roomDef.code);
        roomCountByCode.set(roomDef.code, (roomCountByCode.get(roomDef.code) ?? 0) + 1);
        autoAssignedBigbrods += 1;
        available -= 1;
      }
    }
  }

  unassigned = occupantKeys.filter((key) => !desiredRoomCodeByKey.has(key));
  if (unassigned.length) {
    console.error(`Missing room assignment for ${unassigned.length} occupant(s).`);
    process.exit(1);
  }
}

const roomCounts = {};
for (const code of desiredRoomCodeByKey.values()) {
  roomCounts[code] = (roomCounts[code] || 0) + 1;
}

for (const [code, count] of Object.entries(roomCounts)) {
  const room = roomByCode.get(code.toLowerCase());
  if (!room) continue;
  const capacity = Number(room.capacity ?? 0);
  if (capacity && count > capacity) {
    console.error(
      `Room ${code} over capacity: ${count} assigned, capacity ${capacity}`
    );
    process.exit(1);
  }
}

let assigned = 0;
let assignmentUpdated = 0;
let assignmentFailed = 0;

for (const [occKey, roomCode] of desiredRoomCodeByKey.entries()) {
  const occupantId = occupantIdByKey.get(occKey);
  if (!occupantId) continue;

  const room = roomByCode.get(roomCode.toLowerCase());
  if (!room?.id) continue;

  const active = activeAssignmentByOccupantId.get(occupantId);
  if (active?.room_id === room.id) continue;

  if (active?.id) {
    const { error: closeError } = await supabase
      .from("room_assignments")
      .update({ end_date: assignmentStartDate })
      .eq("id", active.id);

    if (closeError) {
      assignmentFailed += 1;
      continue;
    }
  }

  const { error: assignError } = await supabase.from("room_assignments").insert({
    dorm_id: dorm.id,
    room_id: room.id,
    occupant_id: occupantId,
    start_date: assignmentStartDate,
  });

  if (assignError) {
    assignmentFailed += 1;
    continue;
  }

  if (active?.id) assignmentUpdated += 1;
  else assigned += 1;
}

console.log(
  JSON.stringify(
    {
      occupants_processed: occupantList.length,
      occupants_inserted: inserted,
      occupants_updated: updated,
      occupants_failed: failed,
      rooms_seeded: roomDefs.length,
      assignments_targeted: desiredRoomCodeByKey.size,
      assignments_preserved: preservedAssignments,
      bigbrods_auto_assigned: autoAssignedBigbrods,
      assignments_created: assigned,
      assignments_updated: assignmentUpdated,
      assignments_failed: assignmentFailed,
    },
    null,
    2
  )
);
