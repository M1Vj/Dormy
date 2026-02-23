import * as XLSX from "xlsx";

type Row = Record<string, string | number | boolean | null | undefined>;

export function buildWorkbook() {
  return XLSX.utils.book_new();
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
  workbook: XLSX.WorkBook,
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

  const worksheet = columns.length
    ? XLSX.utils.json_to_sheet(normalizedRows, { header: columns })
    : XLSX.utils.aoa_to_sheet([["No data"]]);

  if (columns.length) {
    const widths = columns.map((column) => {
      let max = column.length;
      for (const row of normalizedRows) {
        const value = row[column];
        const length = String(value ?? "").length;
        if (length > max) {
          max = length;
        }
      }
      return { wch: Math.min(Math.max(max + 2, 10), 48) };
    });
    worksheet["!cols"] = widths;
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
}

export function appendMetadataSheet(
  workbook: XLSX.WorkBook,
  metadata: Array<{ key: string; value: string }>
) {
  const rows = metadata.map((entry) => [
    sanitizeCell(entry.key),
    sanitizeCell(entry.value),
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Field", "Value"],
    ...rows,
  ]);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Metadata");
}

export function workbookToBuffer(workbook: XLSX.WorkBook) {
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  }) as Buffer;
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
