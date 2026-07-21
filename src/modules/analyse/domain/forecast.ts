import type { TabularData } from "@/modules/blocks/domain/types";
import { parseDate } from "@/modules/ingest/domain/columnTransform";
import { toNumeric } from "./stats";

export type ForecastMethod =
  | "trend"
  | "moving_average"
  | "naive"
  | "seasonal_naive"
  | "smooth"
  | "growth";

export const FORECAST_METHOD_OPTIONS: {
  id: ForecastMethod;
  label: string;
  hint: string;
}[] = [
  {
    id: "trend",
    label: "Trend (straight line)",
    hint: "Best when sales steadily grow or shrink",
  },
  {
    id: "moving_average",
    label: "Average of recent periods",
    hint: "Smooths noisy week-to-week ups and downs",
  },
  {
    id: "naive",
    label: "Same as last value",
    hint: "Simple flat outlook from the latest point",
  },
  {
    id: "seasonal_naive",
    label: "Same as last cycle",
    hint: "Repeats the pattern from a prior season",
  },
  {
    id: "smooth",
    label: "Smooth trend",
    hint: "Exponential smoothing — common ops forecast",
  },
  {
    id: "growth",
    label: "Growth rate",
    hint: "Continues the average period-over-period growth",
  },
];

export type ForecastOptions = {
  method: ForecastMethod;
  periods: number;
  /** Moving-average window (default 3). */
  window?: number;
  /** Season length for seasonal_naive: 4 / 7 / 12. */
  seasonLength?: number;
  /** Smoothing α for smooth (0–1, default 0.3). */
  alpha?: number;
  /** Include simple residual confidence band on trend/smooth. */
  confidenceBand?: boolean;
};

export type ForecastPoint = {
  period: string;
  value: number;
  series: "Actual" | "Forecast";
  low?: number | null;
  high?: number | null;
};

export type ForecastResult = {
  method: ForecastMethod;
  column: string;
  periods: number;
  actual: number[];
  forecast: number[];
  points: ForecastPoint[];
  table: TabularData;
  band?: { low: number[]; high: number[] };
};

function clampPeriods(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(24, Math.max(1, Math.round(n)));
}

/** Linear OLS projection (kept for stats.ts re-export compatibility). */
export function projectSeries(values: number[], periods: number): number[] {
  return forecastValues(values, {
    method: "trend",
    periods: clampPeriods(periods),
  });
}

export function forecastValues(
  values: number[],
  options: ForecastOptions,
): number[] {
  const periods = clampPeriods(options.periods);
  if (!values.length) return Array.from({ length: periods }, () => 0);
  if (values.length === 1) {
    return Array.from({ length: periods }, () => values[0]!);
  }

  switch (options.method) {
    case "naive":
      return Array.from({ length: periods }, () => values[values.length - 1]!);
    case "moving_average": {
      const w = Math.min(
        Math.max(1, Math.round(options.window ?? 3)),
        values.length,
      );
      const slice = values.slice(-w);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      return Array.from({ length: periods }, () => Number(avg.toFixed(2)));
    }
    case "seasonal_naive": {
      const season = Math.min(
        Math.max(2, Math.round(options.seasonLength ?? 12)),
        values.length,
      );
      return Array.from({ length: periods }, (_, i) => {
        const idx = values.length - season + (i % season);
        return values[Math.max(0, idx)] ?? values[values.length - 1]!;
      });
    }
    case "smooth": {
      const alpha = Math.min(0.95, Math.max(0.05, options.alpha ?? 0.3));
      let level = values[0]!;
      for (let i = 1; i < values.length; i++) {
        level = alpha * values[i]! + (1 - alpha) * level;
      }
      return Array.from({ length: periods }, () => Number(level.toFixed(2)));
    }
    case "growth": {
      const ratios: number[] = [];
      for (let i = 1; i < values.length; i++) {
        const prev = values[i - 1]!;
        if (prev !== 0) ratios.push(values[i]! / prev);
      }
      const g =
        ratios.length > 0
          ? ratios.reduce((a, b) => a + b, 0) / ratios.length
          : 1;
      let cur = values[values.length - 1]!;
      return Array.from({ length: periods }, () => {
        cur = cur * g;
        return Number(cur.toFixed(2));
      });
    }
    case "trend":
    default: {
      const n = values.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i]!;
        sumXY += i * values[i]!;
        sumXX += i * i;
      }
      const denom = n * sumXX - sumX * sumX || 1;
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      return Array.from({ length: periods }, (_, i) =>
        Number((intercept + slope * (n + i)).toFixed(2)),
      );
    }
  }
}

function residualBand(
  values: number[],
  method: ForecastMethod,
  options: ForecastOptions,
): { low: number[]; high: number[] } | undefined {
  if (!options.confidenceBand) return undefined;
  if (method !== "trend" && method !== "smooth") return undefined;
  if (values.length < 3) return undefined;

  // Fit in-sample one-step residuals using the same method family
  const fitted: number[] = [];
  for (let i = 2; i < values.length; i++) {
    const hist = values.slice(0, i);
    const [next] = forecastValues(hist, { ...options, periods: 1, method });
    fitted.push(next ?? hist[hist.length - 1]!);
  }
  const actuals = values.slice(2);
  const residuals = actuals.map((a, i) => a - (fitted[i] ?? a));
  const mean =
    residuals.reduce((s, r) => s + r, 0) / Math.max(1, residuals.length);
  const variance =
    residuals.reduce((s, r) => s + (r - mean) ** 2, 0) /
    Math.max(1, residuals.length - 1);
  const stdev = Math.sqrt(Math.max(0, variance));
  const z = 1.96;
  const fc = forecastValues(values, { ...options, method });
  return {
    low: fc.map((v) => Number((v - z * stdev).toFixed(2))),
    high: fc.map((v) => Number((v + z * stdev).toFixed(2))),
  };
}

export type FutureHorizonMode = "count" | "until" | "custom";

type StepKind =
  | { kind: "days"; n: number }
  | { kind: "months"; n: number };

function inferStep(history: string[]): StepKind {
  if (history.length < 2) return { kind: "months", n: 1 };
  const prev = parseDate(history[history.length - 2]!, "auto");
  const last = parseDate(history[history.length - 1]!, "auto");
  if (!prev || !last) return { kind: "months", n: 1 };
  const a = new Date(`${prev}T00:00:00Z`);
  const b = new Date(`${last}T00:00:00Z`);
  const dayDiff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (dayDiff > 0 && dayDiff < 28) return { kind: "days", n: dayDiff };
  if (dayDiff >= 28 && dayDiff <= 31) return { kind: "months", n: 1 };
  if (dayDiff >= 89 && dayDiff <= 93) return { kind: "months", n: 3 };
  if (dayDiff >= 365 && dayDiff <= 366) return { kind: "months", n: 12 };
  return { kind: "months", n: 1 };
}

function advanceIso(iso: string, step: StepKind, times: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (step.kind === "days") d.setUTCDate(d.getUTCDate() + step.n * times);
  else d.setUTCMonth(d.getUTCMonth() + step.n * times);
  return d.toISOString().slice(0, 10);
}

/** Extend period labels into the future when history looks like dates / months. */
export function nextPeriodLabels(history: string[], count: number): string[] {
  const n = clampPeriods(count);
  if (!history.length) {
    return Array.from({ length: n }, (_, i) => `F${i + 1}`);
  }

  const last = history[history.length - 1]!;
  const iso = parseDate(last, "auto");
  if (!iso) {
    return Array.from({ length: n }, (_, i) => `F${i + 1}`);
  }
  const step = inferStep(history);
  return Array.from({ length: n }, (_, i) => advanceIso(iso, step, i + 1));
}

/** Parse custom future dates (one per line or comma-separated). */
export function parseCustomFutureDates(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw)
    ? raw
    : raw.split(/[\n,;]+/).map((s) => s.trim());
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const iso = parseDate(p, "auto");
    out.push(iso ?? p);
    if (out.length >= 24) break;
  }
  return out;
}

/**
 * Resolve future period labels from count / until-date / custom dates.
 * Returns labels (length = number of forecast steps, 1–24).
 */
export function resolveFutureLabels(
  history: string[],
  config: {
    futureMode?: FutureHorizonMode | string;
    periods?: number;
    untilDate?: string;
    customFutureDates?: string | string[];
  },
): string[] {
  const mode = (config.futureMode as FutureHorizonMode) || "count";

  if (mode === "custom") {
    const custom = parseCustomFutureDates(config.customFutureDates);
    if (custom.length) return custom.slice(0, 24);
  }

  if (mode === "until") {
    const until = parseDate(config.untilDate ?? "", "auto");
    const lastIso = history.length
      ? parseDate(history[history.length - 1]!, "auto")
      : null;
    if (until && lastIso) {
      const step = inferStep(history);
      const untilMs = new Date(`${until}T00:00:00Z`).getTime();
      const labels: string[] = [];
      for (let i = 1; i <= 24; i++) {
        const next = advanceIso(lastIso, step, i);
        if (new Date(`${next}T00:00:00Z`).getTime() > untilMs) break;
        labels.push(next);
        if (next === until) break;
      }
      // Always include the until date if we overshot with step alignment
      if (
        labels.length &&
        labels[labels.length - 1] !== until &&
        new Date(`${labels[labels.length - 1]}T00:00:00Z`).getTime() < untilMs
      ) {
        labels.push(until);
      } else if (!labels.length) {
        labels.push(until);
      }
      return labels.slice(0, 24);
    }
  }

  return nextPeriodLabels(history, config.periods ?? 3);
}

export function buildForecast(
  table: TabularData,
  config: {
    column: string;
    periodColumn?: string;
    periods?: number;
    futureMode?: FutureHorizonMode | string;
    untilDate?: string;
    customFutureDates?: string | string[];
    method?: ForecastMethod;
    window?: number;
    seasonLength?: number;
    alpha?: number;
    confidenceBand?: boolean;
  },
): ForecastResult {
  const column = config.column;
  const method = config.method ?? "trend";

  const actual: number[] = [];
  const periodLabels: string[] = [];
  const periodCol =
    config.periodColumn && config.periodColumn !== column
      ? config.periodColumn
      : "";
  table.rows.forEach((row, i) => {
    const n = toNumeric(row[column]);
    if (n == null) return;
    actual.push(n);
    periodLabels.push(
      periodCol && row[periodCol] != null && row[periodCol] !== ""
        ? String(row[periodCol])
        : `Period ${i + 1}`,
    );
  });

  const futureLabels = resolveFutureLabels(periodLabels, config);
  const periods = clampPeriods(futureLabels.length || config.periods || 3);
  // Ensure label count matches periods (pad if resolve returned empty somehow)
  while (futureLabels.length < periods) {
    futureLabels.push(`F${futureLabels.length + 1}`);
  }
  const labels = futureLabels.slice(0, periods);

  const options: ForecastOptions = {
    method,
    periods,
    window: config.window,
    seasonLength: config.seasonLength,
    alpha: config.alpha,
    confidenceBand: config.confidenceBand ?? method === "trend",
  };

  const forecast = forecastValues(actual, options);
  const band = residualBand(actual, method, options);

  const points: ForecastPoint[] = [
    ...actual.map((value, i) => ({
      period: periodLabels[i] ?? `Period ${i + 1}`,
      value,
      series: "Actual" as const,
    })),
    ...forecast.map((value, i) => ({
      period: labels[i] ?? `F${i + 1}`,
      value,
      series: "Forecast" as const,
      low: band?.low[i] ?? null,
      high: band?.high[i] ?? null,
    })),
  ];

  const columns = band
    ? ["period", "value", "series", "low", "high"]
    : ["period", "value", "series"];
  const rows: TabularData["rows"] = points.map((p) => {
    const row: Record<string, string | number | null> = {
      period: p.period,
      value: p.value,
      series: p.series,
    };
    if (band) {
      row.low = p.low ?? null;
      row.high = p.high ?? null;
    }
    return row;
  });

  return {
    method,
    column,
    periods,
    actual,
    forecast,
    points,
    band,
    table: { columns, rows },
  };
}

/** Chart points for MiniChart — history + forecast as one series with x labels. */
export function forecastChartPoints(result: ForecastResult): {
  x: string;
  y: number;
  series: "Actual" | "Forecast";
  low?: number | null;
  high?: number | null;
}[] {
  return result.points.map((p) => ({
    x: p.period,
    y: p.value,
    series: p.series,
    low: p.low,
    high: p.high,
  }));
}
