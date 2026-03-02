type DateInput = string | Date | null | undefined;

const DEFAULT_TIME_ZONE = "Asia/Manila";

export const APP_TIME_ZONE =
  process.env.APP_TIME_ZONE?.trim() ||
  process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() ||
  DEFAULT_TIME_ZONE;

function toValidDate(input: DateInput) {
  if (!input) return null;
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function partsMap(
  date: Date,
  options: Intl.DateTimeFormatOptions
): Record<string, string> {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    ...options,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
}

export function formatDateTimeInAppTimeZone(input: DateInput) {
  const date = toValidDate(input);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatTimestampInAppTimeZone(input: DateInput) {
  const date = toValidDate(input);
  if (!date) return "";
  const parts = partsMap(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
    return "";
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatDateOnlyInAppTimeZone(input: DateInput) {
  const date = toValidDate(input);
  if (!date) return "";
  const parts = partsMap(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  if (!parts.year || !parts.month || !parts.day) {
    return "";
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}
