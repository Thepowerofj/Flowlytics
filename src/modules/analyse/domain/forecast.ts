import type { TabularData } from "@/modules/blocks/domain/types";
import { parseDate } from "@/modules/ingest/domain/columnTransform";
import {
  aggregateHistoryByPeriod,
  extractHistoryPoints,
  isChronologicallySorted,
  orderHistoryPoints,
  type PeriodOrder,
} from "./periodOrder";
import { assessPartialLastPeriod } from "./partialPeriod";

export type ForecastMethod =
  | "trend"
  | "moving_average"
  | "naive"
  | "seasonal_naive"
  | "smooth"
  | "growth"
  | "ensemble";

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
  {
    id: "ensemble",
    label: "Ensemble average",
    hint: "Averages several techniques for a more stable outlook",
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
  /** Methods to average when method is ensemble (default: trend + moving_average + smooth). */
  ensembleMethods?: ForecastMethod[];
};

export type ForecastPoint = {
  period: string;
  value: number;
  series: "Actual" | "Forecast";
  low?: number | null;
  high?: number | null;
};

export type BacktestSummary = {
  holdout: number;
  folds?: number;
  mae: number;
  rmse?: number;
  mape: number | null;
  smape?: number | null;
  bias?: number;
  method: ForecastMethod;
};

export type MethodCompareRow = {
  method: ForecastMethod;
  forecast: number[];
  backtest?: BacktestSummary;
};

export type ForecastResult = {
  method: ForecastMethod;
  selectedModelReason?: string;
  column: string;
  periods: number;
  actual: number[];
  forecast: number[];
  points: ForecastPoint[];
  table: TabularData;
  band?: { low: number[]; high: number[] };
  periodOrderApplied?: string;
  periodReordered?: boolean;
  chronologyWarning?: boolean;
  compare?: MethodCompareRow[];
  recommendedMethod?: ForecastMethod;
  backtest?: BacktestSummary;
  diagnostics?: ForecastDiagnostics;
  intervalMethod?: string;
  scenarios?: ForecastScenario[];
  reproducibility?: {
    generatedAt: string;
    inputRows: number;
    historyPoints: number;
  };
};

export type ForecastDiagnostics = {
  readiness: "ready" | "limited" | "not_enough_history";
  frequency: string;
  historyPoints: number;
  duplicatePeriodsAggregated: number;
  hasZeros: boolean;
  hasNegatives: boolean;
  intermittentDemand: boolean;
  eligibleMethods: ForecastMethod[];
  warnings: string[];
  /** True when the newest period looked incomplete and was excluded from the fit. */
  excludedPartialLastPeriod?: boolean;
  partialPeriodLabel?: string;
};

export type ForecastScenario = {
  name: "base" | "upside" | "downside";
  assumption: string;
  forecast: number[];
  points: ForecastPoint[];
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

  if (options.method === "ensemble") {
    const members = (
      options.ensembleMethods?.length
        ? options.ensembleMethods
        : (["trend", "moving_average", "smooth"] as ForecastMethod[])
    ).filter((m) => m !== "ensemble");
    const series = members.map((method) =>
      forecastValues(values, { ...options, method, periods }),
    );
    return Array.from({ length: periods }, (_, i) => {
      const nums = series.map((s) => s[i]!).filter((n) => Number.isFinite(n));
      const avg = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
      return Number(avg.toFixed(2));
    });
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
    low: fc.map((v, i) => Number((v - z * stdev * Math.sqrt(i + 1)).toFixed(2))),
    high: fc.map((v, i) => Number((v + z * stdev * Math.sqrt(i + 1)).toFixed(2))),
  };
}

function inferFrequency(labels: string[]): string {
  const parsed = labels
    .map((l) => parseDate(l, "auto"))
    .filter((l): l is string => Boolean(l))
    .map((l) => new Date(`${l}T00:00:00Z`).getTime())
    .sort((a, b) => a - b);
  if (parsed.length < 2) return "unknown";
  const diffs = parsed.slice(1).map((ms, i) => (ms - parsed[i]!) / 86_400_000);
  const median = [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)]!;
  if (median <= 2) return "daily";
  if (median <= 9) return "weekly";
  if (median >= 27 && median <= 32) return "monthly";
  if (median >= 80 && median <= 100) return "quarterly";
  return "irregular";
}

function eligibleForecastMethods(
  values: number[],
  options: { seasonLength?: number } = {},
): ForecastMethod[] {
  if (values.length < 2) return ["naive"];
  const season = Math.max(2, Math.round(options.seasonLength ?? 12));
  const hasZeros = values.some((v) => v === 0);
  const methods: ForecastMethod[] = ["naive", "moving_average", "smooth", "trend"];
  if (values.length >= season + 2) methods.push("seasonal_naive");
  if (!hasZeros && values.length >= 3) methods.push("growth");
  if (values.length >= 4) methods.push("ensemble");
  return methods;
}

function forecastDiagnostics(input: {
  rawPointCount: number;
  labels: string[];
  values: number[];
  seasonLength?: number;
  partial?: ReturnType<typeof assessPartialLastPeriod>;
  excludedPartial?: boolean;
}): ForecastDiagnostics {
  const values = input.values;
  const warnings: string[] = [];
  const duplicatePeriodsAggregated = Math.max(0, input.rawPointCount - values.length);
  const hasZeros = values.some((v) => v === 0);
  const hasNegatives = values.some((v) => v < 0);
  const zeroShare = values.length
    ? values.filter((v) => v === 0).length / values.length
    : 0;
  const intermittentDemand = zeroShare >= 0.3 && values.some((v) => v > 0);
  const frequency = inferFrequency(input.labels);

  if (values.length < 2) warnings.push("Not enough history to validate a forecast.");
  if (values.length < 6) warnings.push("Short history: forecast confidence is limited.");
  if (duplicatePeriodsAggregated) {
    warnings.push(`${duplicatePeriodsAggregated} duplicate period row(s) were aggregated.`);
  }
  if (frequency === "irregular") {
    warnings.push("Period spacing looks irregular; intervals use historical error only.");
  }
  if (intermittentDemand) {
    warnings.push("Intermittent demand detected; simple methods may understate spikes.");
  }
  if (hasNegatives) warnings.push("Negative values detected; growth models may be unsuitable.");
  if (input.excludedPartial && input.partial?.reason) {
    warnings.push(input.partial.reason);
  } else if (input.partial?.isPartial && input.partial.reason) {
    warnings.push(input.partial.reason);
  }

  return {
    readiness:
      values.length < 2
        ? "not_enough_history"
        : values.length < 6
          ? "limited"
          : "ready",
    frequency,
    historyPoints: values.length,
    duplicatePeriodsAggregated,
    hasZeros,
    hasNegatives,
    intermittentDemand,
    eligibleMethods: eligibleForecastMethods(values, {
      seasonLength: input.seasonLength,
    }),
    warnings,
    excludedPartialLastPeriod: Boolean(input.excludedPartial),
    partialPeriodLabel: input.excludedPartial
      ? input.labels[input.labels.length - 1]
      : undefined,
  };
}

function scenarioForecasts(
  forecast: number[],
  labels: string[],
): ForecastScenario[] {
  const mk = (
    name: ForecastScenario["name"],
    factor: number,
    assumption: string,
  ): ForecastScenario => {
    const values = forecast.map((v, i) =>
      Number((v * (1 + factor * ((i + 1) / Math.max(1, forecast.length)))).toFixed(2)),
    );
    return {
      name,
      assumption,
      forecast: values,
      points: values.map((value, i) => ({
        period: labels[i] ?? `F${i + 1}`,
        value,
        series: "Forecast" as const,
      })),
    };
  };
  return [
    mk("base", 0, "Selected model output"),
    mk("upside", 0.1, "Gradually improves up to +10% by horizon end"),
    mk("downside", -0.1, "Gradually softens down to -10% by horizon end"),
  ];
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

/** Holdout backtest: forecast last `holdout` points from earlier history. */
export function backtestMethod(
  values: number[],
  method: ForecastMethod,
  options: Omit<ForecastOptions, "method" | "periods"> & { holdout?: number } = {},
): BacktestSummary | undefined {
  const holdout = Math.min(
    Math.max(1, options.holdout ?? 2),
    Math.max(1, values.length - 2),
  );
  if (values.length < holdout + 2) return undefined;
  const train = values.slice(0, values.length - holdout);
  const actualHold = values.slice(values.length - holdout);
  const pred = forecastValues(train, {
    ...options,
    method,
    periods: holdout,
  });
  let absErr = 0;
  let sqErr = 0;
  let bias = 0;
  let pctSum = 0;
  let smapeSum = 0;
  let pctN = 0;
  let smapeN = 0;
  for (let i = 0; i < holdout; i++) {
    const a = actualHold[i]!;
    const p = pred[i]!;
    const err = p - a;
    absErr += Math.abs(err);
    sqErr += err * err;
    bias += err;
    if (a !== 0) {
      pctSum += Math.abs((a - p) / a);
      pctN += 1;
    }
    const denom = Math.abs(a) + Math.abs(p);
    if (denom !== 0) {
      smapeSum += (2 * Math.abs(a - p)) / denom;
      smapeN += 1;
    }
  }
  return {
    holdout,
    folds: 1,
    method,
    mae: Number((absErr / holdout).toFixed(4)),
    rmse: Number(Math.sqrt(sqErr / holdout).toFixed(4)),
    mape: pctN ? Number(((pctSum / pctN) * 100).toFixed(2)) : null,
    smape: smapeN ? Number(((smapeSum / smapeN) * 100).toFixed(2)) : null,
    bias: Number((bias / holdout).toFixed(4)),
  };
}

export function compareForecastMethods(
  values: number[],
  methods: ForecastMethod[],
  periods: number,
  options: Omit<ForecastOptions, "method" | "periods"> = {},
): { compare: MethodCompareRow[]; recommended: ForecastMethod } {
  const eligible = eligibleForecastMethods(values, options);
  const usable = methods.filter((m) => eligible.includes(m));
  const compare: MethodCompareRow[] = (usable.length ? usable : methods).map((method) => ({
    method,
    forecast: forecastValues(values, { ...options, method, periods }),
    backtest: backtestMethod(values, method, options),
  }));
  const simplicity: ForecastMethod[] = [
    "naive",
    "moving_average",
    "smooth",
    "trend",
    "seasonal_naive",
    "growth",
    "ensemble",
  ];
  const withScores = compare.filter((r) => Number.isFinite(r.backtest?.mae));
  const best = Math.min(...withScores.map((r) => r.backtest!.mae), Infinity);
  const tolerance = best === Infinity ? Infinity : best * 1.05;
  const recommended =
    simplicity.find((method) =>
      withScores.some((r) => r.method === method && r.backtest!.mae <= tolerance),
    ) ??
    withScores[0]?.method ??
    methods[0] ??
    "trend";
  return { compare, recommended };
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
    periodOrder?: PeriodOrder | string;
    compareMethods?: ForecastMethod[] | string[] | string;
    outputShape?: "long" | "wide";
    /** Default true — drop incomplete final period from the model fit. */
    excludePartialLastPeriod?: boolean;
  },
): ForecastResult {
  const column = config.column;
  const method = config.method ?? "trend";

  const periodCol =
    config.periodColumn && config.periodColumn !== column
      ? config.periodColumn
      : "";
  const extractedPoints = extractHistoryPoints(table.rows, column, periodCol);
  const rawPoints = aggregateHistoryByPeriod(extractedPoints);
  const asIsLabels = rawPoints.map((p) => p.label);
  const chronologyWarning =
    !isChronologicallySorted(asIsLabels) &&
    (config.periodOrder === "as_is" ||
      (!config.periodOrder && !isChronologicallySorted(asIsLabels)));

  const { ordered, applied, reordered } = orderHistoryPoints(
    rawPoints,
    config.periodOrder ?? "auto",
  );
  let fitPoints = ordered;
  let excludedPartial = false;
  let partialMeta = assessPartialLastPeriod(
    ordered.map((p) => p.label),
    ordered.map((p) => p.value),
  );
  const excludePartial = config.excludePartialLastPeriod !== false;
  if (excludePartial && partialMeta.isPartial && ordered.length >= 3) {
    fitPoints = ordered.slice(0, -1);
    excludedPartial = true;
  }

  const actual = fitPoints.map((p) => p.value);
  const periodLabels = fitPoints.map((p) => p.label);
  const diagnostics = forecastDiagnostics({
    rawPointCount: extractedPoints.length,
    labels: periodLabels,
    values: actual,
    seasonLength: config.seasonLength,
    partial: partialMeta,
    excludedPartial,
  });

  const futureLabels = resolveFutureLabels(periodLabels, config);
  const periods = clampPeriods(futureLabels.length || config.periods || 3);
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

  const explicitCompare = config.compareMethods;
  const compareList: ForecastMethod[] = (
    Array.isArray(explicitCompare)
      ? explicitCompare
      : typeof explicitCompare === "string" && explicitCompare.trim()
        ? explicitCompare.split(",").map((s: string) => s.trim())
        : []
  )
    .map((m) => m as ForecastMethod)
    .filter((m) => FORECAST_METHOD_OPTIONS.some((o) => o.id === m));
  // Undefined compareMethods → auto-score all eligible (runs / Ask trust).
  // Explicit [] → only the selected method (canvas live preview).
  const defaultCompare =
    explicitCompare === undefined
      ? diagnostics.eligibleMethods.filter((m) => m !== "ensemble")
      : [];
  const uniqueCompare = [...new Set([method, ...compareList, ...defaultCompare])];
  const { compare, recommended } = compareForecastMethods(
    actual,
    uniqueCompare,
    periods,
    options,
  );
  const selectedMethod =
    diagnostics.eligibleMethods.includes(method) && method !== "ensemble"
      ? method
      : recommended;
  const selectedModelReason =
    selectedMethod === method
      ? excludedPartial
        ? "Using the configured method on complete periods only (partial last period excluded)."
        : "Using the configured eligible method."
      : `Switched from ${method} to ${selectedMethod} because the configured method was not eligible for this history.`;
  const selectedOptions = { ...options, method: selectedMethod };
  const forecast = forecastValues(actual, selectedOptions);
  const band = residualBand(actual, selectedMethod, selectedOptions);
  const backtest = backtestMethod(actual, selectedMethod, selectedOptions);

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

  // Partial last period is excluded from the fit and chart history so an open
  // month cannot drag the outlook down; diagnostics explain the exclusion.

  const longColumns = band
    ? ["period", "value", "series", "low", "high"]
    : ["period", "value", "series"];
  const longRows: TabularData["rows"] = points.map((p) => {
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

  let outTable: TabularData = { columns: longColumns, rows: longRows };
  if (config.outputShape === "wide") {
    const wideCols = ["period", "actual", "forecast"];
    if (band) wideCols.push("low", "high");
    const byPeriod = new Map<string, Record<string, string | number | null>>();
    for (const p of points) {
      const row = byPeriod.get(p.period) ?? { period: p.period };
      if (p.series === "Actual") row.actual = p.value;
      else {
        row.forecast = p.value;
        if (band) {
          row.low = p.low ?? null;
          row.high = p.high ?? null;
        }
      }
      byPeriod.set(p.period, row);
    }
    outTable = {
      columns: wideCols,
      rows: [...byPeriod.values()],
    };
  }

  return {
    method: selectedMethod,
    selectedModelReason,
    column,
    periods,
    actual,
    forecast,
    points,
    band,
    table: outTable,
    periodOrderApplied: applied,
    periodReordered: reordered,
    chronologyWarning:
      chronologyWarning ||
      (!isChronologicallySorted(asIsLabels) && applied === "as_is"),
    compare,
    recommendedMethod: recommended,
    backtest,
    diagnostics,
    intervalMethod: band
      ? "Historical one-step residual envelope widened by forecast horizon; not a guaranteed 95% claim."
      : undefined,
    scenarios: scenarioForecasts(forecast, labels),
    reproducibility: {
      generatedAt: "deterministic",
      inputRows: table.rows.length,
      historyPoints: actual.length,
    },
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
