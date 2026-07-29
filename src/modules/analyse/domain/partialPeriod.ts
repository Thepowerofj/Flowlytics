import { parseDate } from "@/modules/ingest/domain/columnTransform";

export type PartialPeriodAssessment = {
  /** Last history label looked incomplete / truncated. */
  isPartial: boolean;
  reason?: string;
  /** Median of earlier complete periods (when available). */
  priorMedian?: number;
  /** Last period value. */
  lastValue?: number;
  /** Ratio last / priorMedian when both exist. */
  ratio?: number;
};

/**
 * Detect an incomplete final period (common when the current month is still open).
 * Heuristics:
 * 1. Calendar: last period is the current month/week and today is before period end
 * 2. Magnitude: last value is far below the median of prior periods (<40%)
 */
export function assessPartialLastPeriod(
  labels: string[],
  values: number[],
  now: Date = new Date(),
): PartialPeriodAssessment {
  if (labels.length < 2 || values.length < 2) {
    return { isPartial: false };
  }
  const lastLabel = labels[labels.length - 1]!;
  const lastValue = values[values.length - 1]!;
  const prior = values.slice(0, -1).filter((v) => Number.isFinite(v));
  if (!prior.length) return { isPartial: false, lastValue };

  const sorted = [...prior].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const priorMedian =
    sorted.length % 2
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;

  const ratio =
    priorMedian > 0 ? lastValue / priorMedian : lastValue === 0 ? 0 : 1;

  const calendar = isOpenCalendarPeriod(lastLabel, now);
  if (calendar.open) {
    return {
      isPartial: true,
      reason: calendar.reason,
      priorMedian,
      lastValue,
      ratio,
    };
  }

  // Magnitude drop with enough history — typical of MTD / incomplete extracts
  if (prior.length >= 2 && priorMedian > 0 && ratio < 0.4) {
    return {
      isPartial: true,
      reason: `Last period (${lastLabel}) is only ${Math.round(ratio * 100)}% of the prior median — likely incomplete data, not a true collapse.`,
      priorMedian,
      lastValue,
      ratio,
    };
  }

  return { isPartial: false, priorMedian, lastValue, ratio };
}

function isOpenCalendarPeriod(
  label: string,
  now: Date,
): { open: boolean; reason?: string } {
  const iso = parseDate(label, "auto");
  if (!iso) return { open: false };
  const start = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { open: false };

  // Treat as month-grain when day is 1 or label is month-like
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59),
  );
  const nowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = end.getTime();

  // Same calendar month as "now" and month not finished
  if (
    start.getUTCFullYear() === now.getUTCFullYear() &&
    start.getUTCMonth() === now.getUTCMonth() &&
    nowUtc < endUtc
  ) {
    return {
      open: true,
      reason: `Last period (${label}) is the current month and is still open — excluded from the forecast fit.`,
    };
  }

  // Period start is in the future relative to now (bad clock / data) — ignore
  if (startUtc > nowUtc) return { open: false };

  // Period end after "now" (partial month/week still collecting)
  if (nowUtc >= startUtc && nowUtc < endUtc) {
    return {
      open: true,
      reason: `Last period (${label}) has not finished yet — excluded from the forecast fit.`,
    };
  }

  return { open: false };
}
