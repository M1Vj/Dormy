import ExcelJS from "exceljs";

type Row = Record<string, string | number | boolean | null | undefined>;

export function buildWorkbook() {
  return new ExcelJS.Workbook();
}

export function sanitizeCell(value: string | number | boolean | null | undefined): string | number | boolean | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    // Prevent CSV/Formula Injection: Check for dangerous prefixes =, +, -, @
    // Prepend a single quote to force the cell to be treated as text
    if (/^[=+\-@]/.test(value)) {
      return `'${value}`;
    }
  }
  return value;
}

export function appendSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: Row[],
  fallbackColumns?: string[]
) {
  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value == null ? null : sanitizeCell(value);
    }
    return normalized;
  });

  const columns =
    fallbackColumns ??
    Object.keys(normalizedRows[0] ?? {}).filter((column) => column.length > 0);

  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Sheet");

  if (!columns.length) {
    worksheet.addRow(["No data"]);
    return;
  }

  worksheet.addRow(columns);
  for (const row of normalizedRows) {
    worksheet.addRow(columns.map((column) => row[column] ?? null));
  }

  columns.forEach((column, index) => {
    let max = column.length;
    for (const row of normalizedRows) {
      const value = row[column];
      const length = String(value ?? "").length;
      if (length > max) {
        max = length;
      }
    }
    worksheet.getColumn(index + 1).width = Math.min(Math.max(max + 2, 10), 48);
  });
}

export function appendMetadataSheet(
  workbook: ExcelJS.Workbook,
  metadata: Array<{ key: string; value: string }>
) {
  const worksheet = workbook.addWorksheet("Metadata");
  worksheet.addRow(["Field", "Value"]);
  for (const entry of metadata) {
    worksheet.addRow([sanitizeCell(entry.key), sanitizeCell(entry.value)]);
  }
  worksheet.getColumn(1).width = 24;
  worksheet.getColumn(2).width = 60;
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook) {
  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(content);
}

export function normalizeFilePart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function toIsoDate(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function formatTimestamp(value: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().replace("T", " ").slice(0, 19);
}

export function formatDateOnly(value: string | null) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}
