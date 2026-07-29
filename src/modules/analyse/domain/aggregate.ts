import type { TabularData } from "@/modules/blocks/domain/types";
import { toNumeric } from "./stats";

export type AggregateOp =
  | "sum"
  | "avg"
  | "count"
  | "count_distinct"
  | "min"
  | "max"
  | "pct_total";

export type AggregateMetric = {
  column: string;
  op: AggregateOp;
  /** Output column name; default derived from op + column */
  as?: string;
};

export type AggregateConfig = {
  groupBy: string[];
  metrics: AggregateMetric[];
};

export function defaultMetricAs(op: AggregateOp, column: string): string {
  if (op === "count" && !column) return "count";
  if (op === "count_distinct") return `distinct_${column || "values"}`;
  if (op === "pct_total") return `pct_${column || "total"}`;
  const base = column || "rows";
  return `${op}_${base}`;
}

function metricKey(m: AggregateMetric): string {
  return (m.as?.trim() || defaultMetricAs(m.op, m.column)).trim();
}

type Bucket = {
  keyParts: string[];
  sums: Map<string, number>;
  counts: Map<string, number>;
  mins: Map<string, number>;
  maxs: Map<string, number>;
  distinct: Map<string, Set<string>>;
  rowCount: number;
};

/**
 * Group rows and compute metrics. Output columns = groupBy + metric aliases.
 */
export function aggregateTable(
  table: TabularData,
  config: AggregateConfig,
): TabularData {
  const groupByRaw = Array.isArray(config.groupBy) ? config.groupBy : [];
  const metricsRaw = Array.isArray(config.metrics)
    ? config.metrics.filter(
        (m): m is AggregateMetric =>
          Boolean(m) && typeof m === "object" && typeof m.op === "string",
      )
    : [];
  const groupBy = groupByRaw.filter(
    (c): c is string => typeof c === "string" && table.columns.includes(c),
  );
  const metrics = metricsRaw.filter(
    (m) =>
      m.op === "count" ||
      m.op === "count_distinct" ||
      m.op === "pct_total" ||
      (typeof m.column === "string" && table.columns.includes(m.column)),
  );

  const safeRows = Array.isArray(table.rows)
    ? table.rows.filter((r): r is TabularData["rows"][number] =>
        Boolean(r) && typeof r === "object",
      )
    : [];

  if (!groupBy.length && !metrics.length) {
    return { columns: [...table.columns], rows: [...safeRows] };
  }

  // No group-by → one total row
  const effectiveGroupBy = groupBy.length ? groupBy : [];

  const buckets = new Map<string, Bucket>();
  /** Grand totals for pct_total (sum of numeric column, or row count when empty). */
  const grandSum = new Map<string, number>();
  const grandCount = new Map<string, number>();

  for (const row of safeRows) {
    const keyParts = effectiveGroupBy.map((c) => String(row[c] ?? ""));
    const key = keyParts.join("\u0001");
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        keyParts,
        sums: new Map(),
        counts: new Map(),
        mins: new Map(),
        maxs: new Map(),
        distinct: new Map(),
        rowCount: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.rowCount += 1;

    for (const m of metrics) {
      const out = metricKey(m);
      if (m.op === "count") {
        bucket.counts.set(out, (bucket.counts.get(out) ?? 0) + 1);
        grandCount.set(out, (grandCount.get(out) ?? 0) + 1);
        continue;
      }
      if (m.op === "count_distinct") {
        let set = bucket.distinct.get(out);
        if (!set) {
          set = new Set();
          bucket.distinct.set(out, set);
        }
        const cell = row[m.column];
        if (cell != null && cell !== "") set.add(String(cell));
        continue;
      }
      if (m.op === "pct_total") {
        if (!m.column) {
          bucket.counts.set(out, (bucket.counts.get(out) ?? 0) + 1);
          grandCount.set(out, (grandCount.get(out) ?? 0) + 1);
        } else {
          const n = toNumeric(row[m.column]);
          if (n == null) continue;
          bucket.sums.set(out, (bucket.sums.get(out) ?? 0) + n);
          grandSum.set(out, (grandSum.get(out) ?? 0) + n);
        }
        continue;
      }
      const n = toNumeric(row[m.column]);
      if (n == null) continue;
      bucket.sums.set(out, (bucket.sums.get(out) ?? 0) + n);
      bucket.counts.set(out, (bucket.counts.get(out) ?? 0) + 1);
      const prevMin = bucket.mins.get(out);
      const prevMax = bucket.maxs.get(out);
      bucket.mins.set(out, prevMin == null ? n : Math.min(prevMin, n));
      bucket.maxs.set(out, prevMax == null ? n : Math.max(prevMax, n));
    }
  }

  const metricCols = metrics.map((m) => metricKey(m));
  // Dedupe output names
  const columns = [...effectiveGroupBy];
  for (const c of metricCols) {
    if (!columns.includes(c)) columns.push(c);
  }

  const rows: TabularData["rows"] = [];
  for (const bucket of buckets.values()) {
    const row: Record<string, string | number | null> = {};
    effectiveGroupBy.forEach((c, i) => {
      row[c] = bucket.keyParts[i] ?? "";
    });
    for (const m of metrics) {
      const out = metricKey(m);
      if (m.op === "count") {
        row[out] = bucket.counts.get(out) ?? bucket.rowCount;
      } else if (m.op === "count_distinct") {
        row[out] = bucket.distinct.get(out)?.size ?? 0;
      } else if (m.op === "pct_total") {
        if (!m.column) {
          const part = bucket.counts.get(out) ?? bucket.rowCount;
          const total = grandCount.get(out) ?? 0;
          row[out] = total ? Number(((part / total) * 100).toFixed(2)) : null;
        } else {
          const part = bucket.sums.get(out) ?? 0;
          const total = grandSum.get(out) ?? 0;
          row[out] = total ? Number(((part / total) * 100).toFixed(2)) : null;
        }
      } else if (m.op === "sum") {
        row[out] = bucket.sums.get(out) ?? 0;
      } else if (m.op === "avg") {
        const c = bucket.counts.get(out) ?? 0;
        const s = bucket.sums.get(out) ?? 0;
        row[out] = c ? Number((s / c).toFixed(4)) : null;
      } else if (m.op === "min") {
        row[out] = bucket.mins.has(out) ? bucket.mins.get(out)! : null;
      } else if (m.op === "max") {
        row[out] = bucket.maxs.has(out) ? bucket.maxs.get(out)! : null;
      }
    }
    rows.push(row);
  }

  // Stable sort by group keys
  rows.sort((a, b) => {
    for (const c of effectiveGroupBy) {
      const cmp = String(a[c] ?? "").localeCompare(String(b[c] ?? ""));
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return { columns, rows };
}

export function describeAggregate(config: AggregateConfig): string {
  const groups = (
    Array.isArray(config.groupBy) ? config.groupBy : []
  ).filter(Boolean);
  const metrics = Array.isArray(config.metrics) ? config.metrics : [];
  if (!groups.length && !metrics.length) return "Configure group & metrics";
  const g = groups.length ? `by ${groups.join(", ")}` : "totals";
  const m =
    metrics.length > 0
      ? metrics
          .map((x) => `${x.op}(${x.column || "*"})`)
          .slice(0, 2)
          .join(", ")
      : "count";
  return `${m} · ${g}`;
}
