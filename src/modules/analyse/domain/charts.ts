import type { ColumnDisplayFormat } from "@/modules/ingest/domain/columnFormat";
import type { TabularData } from "@/modules/blocks/domain/types";
import { businessInsightLines } from "./insights";
import { comparePeriodKeys } from "./periodOrder";
import {
  columnLooksLikeDate,
  computeStats,
  toNumeric,
} from "./stats";

export type ChartType = "bar" | "line" | "pie";

export type ChartPoint = {
  x: string;
  y: number;
  series?: "Actual" | "Forecast";
  /** Optional residual confidence band (forecast charts). */
  low?: number | null;
  high?: number | null;
};

export type ChartSpec = {
  type: ChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  points: ChartPoint[];
  /** How to render Y values (currency, grouping, decimals). */
  valueFormat?: ColumnDisplayFormat;
  /** When set, MiniChart draws Forecast points with a distinct stroke. */
  forecastSplit?: boolean;
  /** Plain-language findings shown under the chart (answer-first). */
  insights?: string[];
  /** Full point count before UI truncation (for “showing top N” notice). */
  totalPoints?: number;
};

export type ChartSuggestion = {
  id: string;
  type: ChartType;
  label: string;
  reason: string;
  xColumn: string;
  yColumn: string;
};

function aggregate(
  table: TabularData,
  xColumn: string,
  yColumn: string | null,
  mode: "sum" | "count",
): { x: string; y: number }[] {
  const buckets = new Map<string, number>();
  for (const row of table.rows) {
    const key = String(row[xColumn] ?? "n/a");
    if (mode === "count") {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    } else {
      const val = toNumeric(row[yColumn!]) ?? 0;
      buckets.set(key, (buckets.get(key) ?? 0) + val);
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([x, y]) => ({ x, y }));
}

export function suggestCharts(table: TabularData): ChartSuggestion[] {
  const stats = computeStats(table);
  const numeric = stats.filter((s) => s.kind === "numeric");
  const categorical = stats.filter((s) => s.kind === "categorical");
  const dateCol = table.columns.find((c) => columnLooksLikeDate(table, c));
  const suggestions: ChartSuggestion[] = [];

  // Prefer time-series line when a date + measure exist (BI default)
  if (dateCol && numeric[0]) {
    suggestions.push({
      id: "line-time",
      type: "line",
      label: `Line · ${numeric[0].column} over ${dateCol}`,
      reason: "Best for trends over time — spot growth, dips, and seasonality.",
      xColumn: dateCol,
      yColumn: numeric[0].column,
    });
  }

  if (categorical[0] && numeric[0] && categorical[0].column !== dateCol) {
    suggestions.push({
      id: "bar-cat-num",
      type: "bar",
      label: `Bar · ${numeric[0].column} by ${categorical[0].column}`,
      reason: "Compare totals across categories — good for ranking drivers.",
      xColumn: categorical[0].column,
      yColumn: numeric[0].column,
    });
    const catCount = categorical[0].topValues?.length ?? 0;
    if (catCount > 0 && catCount <= 8) {
      suggestions.push({
        id: "pie-cat-num",
        type: "pie",
        label: `Pie · share of ${numeric[0].column}`,
        reason: "Share of total across a few categories (keep slices ≤ 8).",
        xColumn: categorical[0].column,
        yColumn: numeric[0].column,
      });
    }
  }

  if (numeric[0] && !dateCol) {
    suggestions.push({
      id: "line-num",
      type: "line",
      label: `Line · ${numeric[0].column} over rows`,
      reason: "Spot direction when you don’t have a date column yet.",
      xColumn: "__row__",
      yColumn: numeric[0].column,
    });
  }

  if (categorical[0] && !numeric[0]) {
    suggestions.push({
      id: "bar-count",
      type: "bar",
      label: `Bar · count of ${categorical[0].column}`,
      reason: "No strong numeric column — count how often each category appears.",
      xColumn: categorical[0].column,
      yColumn: "__count__",
    });
    suggestions.push({
      id: "pie-count",
      type: "pie",
      label: `Pie · ${categorical[0].column} mix`,
      reason: "Quick view of category mix in your data.",
      xColumn: categorical[0].column,
      yColumn: "__count__",
    });
  }

  if (!suggestions.length && table.columns[0]) {
    suggestions.push({
      id: "bar-fallback",
      type: "bar",
      label: `Bar · count of ${table.columns[0]}`,
      reason: "Fallback suggestion from the first column.",
      xColumn: table.columns[0],
      yColumn: "__count__",
    });
  }

  return suggestions;
}

export function buildChartSpec(
  table: TabularData,
  config: {
    chartType?: ChartType;
    xColumn?: string;
    yColumn?: string;
    suggestionId?: string;
    valueFormat?: ColumnDisplayFormat;
    columnFormats?: Record<string, ColumnDisplayFormat>;
  } = {},
): ChartSpec {
  const suggestions = suggestCharts(table);
  const picked =
    suggestions.find((s) => s.id === config.suggestionId) ??
    suggestions.find(
      (s) =>
        s.type === (config.chartType ?? s.type) &&
        (!config.xColumn || s.xColumn === config.xColumn) &&
        (!config.yColumn || s.yColumn === config.yColumn),
    ) ??
    suggestions[0];

  const type = (config.chartType as ChartType) || picked?.type || "bar";
  const xColumn = config.xColumn || picked?.xColumn || table.columns[0] || "x";
  const yColumn = config.yColumn || picked?.yColumn || "__count__";

  let points: ChartPoint[] = [];
  let xLabel = xColumn;
  let yLabel = yColumn;
  let totalPoints = 0;

  if (xColumn === "__row__" || yColumn === "__row__") {
    const col = yColumn === "__row__" ? xColumn : yColumn;
    yLabel = col;
    xLabel = "Row";
    totalPoints = table.rows.length;
    points = table.rows.slice(0, 40).map((row, i) => ({
      x: String(i + 1),
      y: toNumeric(row[col]) ?? 0,
    }));
  } else if (yColumn === "__count__") {
    yLabel = "Count";
    points = aggregate(table, xColumn, null, "count");
    totalPoints = points.length;
  } else if (columnLooksLikeDate(table, xColumn) && type === "line") {
    // Preserve time order for date axes (don't rank by sum)
    const buckets = new Map<string, number>();
    for (const row of table.rows) {
      const key = String(row[xColumn] ?? "n/a");
      buckets.set(key, (buckets.get(key) ?? 0) + (toNumeric(row[yColumn]) ?? 0));
    }
    const ordered = [...buckets.entries()].sort((a, b) =>
      comparePeriodKeys(a[0], b[0]),
    );
    totalPoints = ordered.length;
    points = ordered.slice(0, 40).map(([x, y]) => ({ x, y }));
    xLabel = xColumn;
  } else {
    points = aggregate(table, xColumn, yColumn, "sum");
    totalPoints = points.length;
  }

  const title =
    picked?.label ??
    `${type[0]!.toUpperCase()}${type.slice(1)} · ${yLabel} by ${xLabel}`;

  const valueFormat =
    config.valueFormat ??
    (yColumn !== "__count__" && yColumn !== "__row__"
      ? config.columnFormats?.[yColumn]
      : yColumn === "__count__"
        ? { kind: "number" as const, decimals: 0, useGrouping: true }
        : undefined);

  const insights = businessInsightLines(table, config.columnFormats).slice(0, 3);

  return {
    type,
    title,
    xLabel,
    yLabel,
    points,
    valueFormat,
    insights,
    totalPoints: totalPoints || points.length,
  };
}

export function summarizeForNode(
  table: TabularData,
  formats?: Record<string, ColumnDisplayFormat>,
): {
  rows: number;
  columns: number;
  highlights: string[];
} {
  const highlights = businessInsightLines(table, formats).slice(0, 5);
  return { rows: table.rows.length, columns: table.columns.length, highlights };
}
