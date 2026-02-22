/**
 * Formats a date or string into a readable date (e.g., Jan 1, 2024).
 * Handles YYYY-MM-DD strings by parsing them in local time to avoid timezone shifts.
 */
export function formatDate(value?: string | Date | null, fallback = "-") {
  if (!value) return fallback;

  let parsed: Date;
  if (value instanceof Date) {
    parsed = value;
  } else {
    const raw = String(value);
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    parsed = ymd
      ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
      : new Date(raw);
  }

  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

/**
 * Formats a date or string into a readable date and time (e.g., Jan 1, 2024, 12:00 PM).
 */
export function formatDateTime(value?: string | Date | null, fallback = "-") {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * Specifically for competition print where en-PH and specific styles are used.
 */
export function formatCompetitionDateTime(value?: string | Date | null, fallback = "-") {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
