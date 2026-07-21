/**
 * Fixed-locale UI formatters so SSR HTML matches the client (avoid hydration mismatches
 * from `toLocaleString()` / `undefined` locale).
 */
export const DISPLAY_LOCALE = "en-ZA";
export const DISPLAY_TIMEZONE = "Africa/Johannesburg";

function asDate(value: string | Date | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(
  value: string | Date | number | null | undefined,
  opts?: { withYear?: boolean },
): string {
  const d = asDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      month: "short",
      day: "numeric",
      ...(opts?.withYear ? { year: "numeric" as const } : {}),
      hour: "2-digit",
      minute: "2-digit",
      timeZone: DISPLAY_TIMEZONE,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function formatDate(
  value: string | Date | number | null | undefined,
): string {
  const d = asDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: DISPLAY_TIMEZONE,
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatMonthYear(value: string | Date | number | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      month: "long",
      year: "numeric",
      timeZone: DISPLAY_TIMEZONE,
    }).format(d);
  } catch {
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  }
}

export function formatWeekdayDate(
  value: string | Date | number | null | undefined,
): string {
  const d = asDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: DISPLAY_TIMEZONE,
    }).format(d);
  } catch {
    return formatDate(d);
  }
}

export function formatTime(
  value: string | Date | number | null | undefined,
  opts?: { withSeconds?: boolean },
): string {
  const d = asDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      ...(opts?.withSeconds ? { second: "2-digit" as const } : {}),
      timeZone: DISPLAY_TIMEZONE,
    }).format(d);
  } catch {
    return opts?.withSeconds
      ? d.toISOString().slice(11, 19)
      : d.toISOString().slice(11, 16);
  }
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(DISPLAY_LOCALE, { useGrouping: true }).format(n);
  } catch {
    return String(n);
  }
}
