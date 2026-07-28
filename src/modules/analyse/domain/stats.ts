import type { TabularData } from "@/modules/blocks/domain/types";

export type ColumnStats = {
  column: string;
  kind: "numeric" | "categorical";
  count: number;
  nulls: number;
  nullPct?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stddev?: number;
  p25?: number;
  p75?: number;
  topValues?: { value: string; count: number }[];
  /** Rough histogram bins for numeric columns (equal-width). */
  histogram?: { start: number; end: number; count: number }[];
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base]!;
  const b = sorted[Math.min(sorted.length - 1, base + 1)]!;
  return a + rest * (b - a);
}

/** Avoid Math.min(...arr) / Math.max(...arr) — spread blows the call stack on large arrays. */
export function minMax(values: number[]): { min: number; max: number } {
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function buildHistogram(values: number[], bins = 8): { start: number; end: number; count: number }[] {
  if (values.length < 2) return [];
  const { min, max } = minMax(values);
  if (min === max) return [{ start: min, end: max, count: values.length }];
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    start: min + i * width,
    end: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.min(bins - 1, Math.floor((v - min) / width));
    if (idx < 0) idx = 0;
    out[idx]!.count += 1;
  }
  return out;
}

/** Coerce cell to a finite number (handles "1,234", "R 10.5", "1 234,56", plain strings). */
export function toNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  let raw = String(value).trim();
  if (!raw) return null;
  // Drop currency markers / percent; keep digits, signs, separators
  raw = raw.replace(/[$€£R¥]/gi, "").replace(/\bZAR\b/gi, "").replace(/%/g, "").trim();
  if (!raw) return null;

  // European / SA with grouping: 1 234,56 or 1.234,56 (comma = decimal)
  if (/^-?\d{1,3}([.\s]\d{3})+,\d{1,2}$/.test(raw)) {
    const normalized = raw.replace(/[\s.]/g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  // Plain European decimal only when fraction is 1–2 digits (not thousands like 1,200)
  if (/^-?\d+,\d{1,2}$/.test(raw)) {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // US / plain: 1,234.56 or 1234.56
  const cleaned = raw.replace(/\s/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True when most values look like calendar dates / month labels (not measures). */
export function columnLooksLikeDate(
  table: TabularData,
  column: string,
): boolean {
  const nonNull = table.rows
    .map((r) => r[column])
    .filter((v) => v != null && v !== "");
  if (!nonNull.length) return false;

  let hits = 0;
  for (const v of nonNull) {
    if (typeof v === "number" && Number.isFinite(v)) {
      // Excel serial days ~1990–2035 — not ordinary small measures
      if (v >= 32_874 && v <= 50_000) hits += 1;
      continue;
    }
    const s = String(v).trim();
    // ISO / month-year / day-month patterns (avoid pulling in parseDate for tiny ints)
    if (
      /^\d{4}-\d{2}-\d{2}/.test(s) ||
      /^\d{4}[\/.]\d{1,2}$/.test(s) ||
      /^[A-Za-z]{3,9}[\/\-\s.]\d{2,4}$/.test(s) ||
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) ||
      /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}/.test(s) ||
      /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}/.test(s)
    ) {
      hits += 1;
    }
  }
  return hits >= Math.max(1, Math.ceil(nonNull.length * 0.6));
}

export function columnLooksNumeric(
  table: TabularData,
  column: string,
): boolean {
  if (columnLooksLikeDate(table, column)) return false;
  const nonNull = table.rows.map((r) => r[column]).filter((v) => v != null && v !== "");
  if (!nonNull.length) return false;
  const numeric = nonNull.filter((v) => toNumeric(v) != null);
  return numeric.length >= Math.max(1, nonNull.length * 0.6);
}

export function numericColumns(table: TabularData): string[] {
  return table.columns.filter((c) => columnLooksNumeric(table, c));
}

/** Names that usually mean a business measure worth forecasting. */
const MEASURE_NAME_RE =
  /(sales|revenue|amount|total|qty|quantity|units|volume|value|price|cost|profit|spend|income|turnover|demand|orders?|margin|net|gross|balance|stock|weight)/i;

/** Names that usually mean identifiers / keys — never forecast these. */
const ID_NAME_RE =
  /(^id$|_id$|Id$|ID$|uuid|guid|sku$|(^|_)code$|index$|row.?num|pk$|pharmacyid|customerid|userid|storeid|productid|patientid)/i;

function columnNumericValues(
  table: TabularData,
  column: string,
): number[] {
  return table.rows
    .map((r) => toNumeric(r[column]))
    .filter((v): v is number => v != null);
}

/** True for ID-like numerics (pharmacyId, near-unique integers, etc.). */
export function columnLooksLikeIdentifier(
  table: TabularData,
  column: string,
): boolean {
  if (ID_NAME_RE.test(column)) return true;
  if (MEASURE_NAME_RE.test(column)) return false;
  const vals = columnNumericValues(table, column);
  if (vals.length < 2) return false;
  const unique = new Set(vals.map((v) => String(v)));
  const allIntegers = vals.every((v) => Number.isInteger(v));
  // Near-unique integer keys behave like IDs, not quantities
  if (allIntegers && unique.size >= Math.max(2, Math.ceil(vals.length * 0.85))) {
    return true;
  }
  return false;
}

function scoreForecastMeasure(table: TabularData, column: string): number {
  let score = 0;
  if (MEASURE_NAME_RE.test(column)) score += 50;
  if (columnLooksLikeIdentifier(table, column)) score -= 100;
  if (columnLooksLikeDate(table, column)) score -= 100;

  const vals = columnNumericValues(table, column);
  if (vals.length < 2) return score - 20;

  const unique = new Set(vals.map((v) => String(v)));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance =
    vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length - 1);
  // Prefer columns with real spread (sales) over flat codes
  if (variance > 0) score += Math.min(25, Math.log10(variance + 1) * 8);
  // Slight preference for repeated values (aggregated series) over unique keys
  if (unique.size < vals.length * 0.5) score += 10;
  // Prefer non-negative business quantities
  if (vals.every((v) => v >= 0)) score += 5;
  return score;
}

/**
 * Numeric measure columns suitable to forecast, ranked best-first.
 * Excludes dates and ID-like fields (e.g. pharmacyId).
 */
export function forecastMeasureColumns(table: TabularData): string[] {
  return numericColumns(table)
    .filter((c) => !columnLooksLikeIdentifier(table, c))
    .map((c) => ({ c, score: scoreForecastMeasure(table, c) }))
    .filter((x) => x.score > -50)
    .sort((a, b) => b.score - a.score || a.c.localeCompare(b.c))
    .map((x) => x.c);
}

/** Pick the best forecast measure, honouring an explicit goal mention when valid. */
export function pickForecastMeasure(
  table: TabularData,
  goal?: string,
): string {
  const ranked = forecastMeasureColumns(table);
  if (!ranked.length) return "";
  const g = (goal ?? "").toLowerCase();
  if (g) {
    const mentioned = ranked.find((c) => g.includes(c.toLowerCase()));
    if (mentioned) return mentioned;
    // Goal may name a measure synonym even if column title differs slightly
    if (MEASURE_NAME_RE.test(g)) {
      const byName = ranked.find((c) => MEASURE_NAME_RE.test(c));
      if (byName) return byName;
    }
  }
  return ranked[0]!;
}

/** Best period/label column for a forecast (dates preferred). */
export function guessPeriodColumn(
  table: TabularData,
  valueColumn?: string,
): string {
  const candidates = table.columns.filter((c) => c !== valueColumn);
  const dated = candidates.filter((c) => columnLooksLikeDate(table, c));
  if (dated[0]) return dated[0];
  // Fall back to first non-measure text-ish column
  const measures = new Set(forecastMeasureColumns(table));
  return (
    candidates.find((c) => !measures.has(c) && !columnLooksLikeIdentifier(table, c)) ??
    candidates.find((c) => !measures.has(c)) ??
    ""
  );
}

export function computeStats(table: TabularData): ColumnStats[] {
  return table.columns.map((column) => {
    const values = table.rows.map((r) => r[column]);
    const nulls = values.length - values.filter((v) => v != null && v !== "").length;
    const nonNull = values.filter((v) => v != null && v !== "");
    const numeric = nonNull
      .map((v) => toNumeric(v))
      .filter((v): v is number => v != null);
    if (numeric.length >= Math.max(1, nonNull.length * 0.6)) {
      const sum = numeric.reduce((a, b) => a + b, 0);
      const mean = sum / numeric.length;
      const sorted = [...numeric].sort((a, b) => a - b);
      const variance =
        numeric.reduce((s, v) => s + (v - mean) ** 2, 0) /
        Math.max(1, numeric.length - 1);
      const { min, max } = minMax(numeric);
      return {
        column,
        kind: "numeric" as const,
        count: nonNull.length,
        nulls,
        nullPct: values.length
          ? Number(((nulls / values.length) * 100).toFixed(1))
          : 0,
        min,
        max,
        mean,
        median: Number(quantile(sorted, 0.5).toFixed(4)),
        stddev: Number(Math.sqrt(Math.max(0, variance)).toFixed(4)),
        p25: Number(quantile(sorted, 0.25).toFixed(4)),
        p75: Number(quantile(sorted, 0.75).toFixed(4)),
        histogram: buildHistogram(numeric),
      };
    }
    const freq = new Map<string, number>();
    for (const v of nonNull) {
      const key = String(v);
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    const topValues = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
    return {
      column,
      kind: "categorical" as const,
      count: nonNull.length,
      nulls,
      nullPct: values.length
        ? Number(((nulls / values.length) * 100).toFixed(1))
        : 0,
      topValues,
    };
  });
}

export { buildChartSpec, suggestCharts, summarizeForNode } from "./charts";
export type { ChartSpec, ChartSuggestion, ChartType } from "./charts";
export { projectSeries } from "./forecast";

export function toCsv(table: { columns: string[]; rows: Record<string, unknown>[] }): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [table.columns.join(",")];
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}
