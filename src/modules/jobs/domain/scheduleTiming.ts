/** cronKind values: daily | weekly | custom:{n}h | custom:{n}d */

export type ScheduleKindInput =
  | { cronKind: "daily" }
  | { cronKind: "weekly" }
  | { cronKind: "custom"; every: number; unit: "h" | "d" };

export function encodeCronKind(input: ScheduleKindInput): string {
  if (input.cronKind === "custom") {
    const every = Math.max(1, Math.floor(input.every));
    return `custom:${every}${input.unit}`;
  }
  return input.cronKind;
}

export function intervalMsFromCronKind(cronKind: string): number {
  if (cronKind === "weekly") return 7 * 24 * 60 * 60 * 1000;
  if (cronKind === "daily") return 24 * 60 * 60 * 1000;
  const m = /^custom:(\d+)(h|d)$/.exec(cronKind);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) return 24 * 60 * 60 * 1000;
    return m[2] === "d" ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

export function nextRunAtFromCronKind(cronKind: string, from = new Date()): Date {
  return new Date(from.getTime() + intervalMsFromCronKind(cronKind));
}

export function describeCronKind(cronKind: string): string {
  if (cronKind === "daily") return "Daily";
  if (cronKind === "weekly") return "Weekly";
  const m = /^custom:(\d+)(h|d)$/.exec(cronKind);
  if (m) {
    const n = Number(m[1]);
    return m[2] === "d"
      ? `Every ${n} day${n === 1 ? "" : "s"}`
      : `Every ${n} hour${n === 1 ? "" : "s"}`;
  }
  return cronKind;
}

/**
 * Expand schedule occurrences inside [rangeStart, rangeEnd] using nextRunAt
 * as the anchor on the interval grid.
 */
export function occurrencesInRange(
  cronKind: string,
  nextRunAt: Date | string,
  rangeStart: Date | string,
  rangeEnd: Date | string,
  max = 500,
): Date[] {
  const interval = intervalMsFromCronKind(cronKind);
  if (interval < 60_000) return [];

  const start = new Date(rangeStart).getTime();
  const end = new Date(rangeEnd).getTime();
  let t = new Date(nextRunAt).getTime();
  if (![start, end, t].every(Number.isFinite)) return [];

  // Walk back to the first tick at or after rangeStart
  while (t - interval >= start) t -= interval;
  while (t < start) t += interval;

  const out: Date[] = [];
  while (t <= end && out.length < max) {
    out.push(new Date(t));
    t += interval;
  }
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
