import type { TabularData } from "@/modules/blocks/domain/types";
import {
  buildForecast,
  type ForecastMethod,
  type ForecastResult,
  type FutureHorizonMode,
} from "./forecast";
import type { PeriodOrder } from "./periodOrder";

export type GroupedForecastResult = {
  groupColumn: string;
  groups: { key: string; result: ForecastResult }[];
  /** Combined long table with a group column for charts/export. */
  table: TabularData;
  /** Chart points tagged with group name as series (Actual/Forecast encoded in point meta). */
  points: {
    period: string;
    value: number;
    series: string;
    group: string;
    low?: number | null;
    high?: number | null;
  }[];
  diagnosticsWarnings: string[];
};

const MAX_GROUPS = 12;

/**
 * Forecast each category separately (e.g. scenario × month), then combine.
 * Falls back to a single buildForecast when groupColumn is empty/missing.
 */
export function buildGroupedForecast(
  table: TabularData,
  config: {
    column: string;
    periodColumn?: string;
    groupColumn?: string;
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
    excludePartialLastPeriod?: boolean;
  },
): GroupedForecastResult | ForecastResult {
  const groupCol = (config.groupColumn ?? "").trim();
  if (!groupCol || !table.columns.includes(groupCol) || groupCol === config.column) {
    return buildForecast(table, config);
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    if (!row || typeof row !== "object") continue;
    const key = String(row[groupCol] ?? "").trim() || "(blank)";
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= MAX_GROUPS) break;
  }

  if (keys.length <= 1) {
    return buildForecast(table, config);
  }

  const groups: { key: string; result: ForecastResult }[] = [];
  const warnings: string[] = [];
  const combinedRows: TabularData["rows"] = [];
  const points: GroupedForecastResult["points"] = [];

  for (const key of keys) {
    const subset: TabularData = {
      columns: table.columns,
      rows: table.rows.filter(
        (r) => (String(r[groupCol] ?? "").trim() || "(blank)") === key,
      ),
    };
    try {
      const result = buildForecast(subset, {
        ...config,
        // Per-group canvas shouldn't explode CPU on method boards
        compareMethods: config.compareMethods ?? [],
      });
      if (result.actual.length < 2) {
        warnings.push(`“${key}” has fewer than 2 periods — skipped.`);
        continue;
      }
      groups.push({ key, result });
      for (const p of result.points) {
        points.push({
          period: p.period,
          value: p.value,
          series: `${key} · ${p.series}`,
          group: key,
          low: p.low,
          high: p.high,
        });
        combinedRows.push({
          [groupCol]: key,
          period: p.period,
          value: p.value,
          series: p.series,
          low: p.low ?? null,
          high: p.high ?? null,
        });
      }
      for (const w of result.diagnostics?.warnings ?? []) {
        warnings.push(`${key}: ${w}`);
      }
    } catch (error) {
      warnings.push(
        `“${key}” could not be forecast: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  if (!groups.length) {
    // Fall back to overall series if every group failed
    return buildForecast(table, config);
  }

  return {
    groupColumn: groupCol,
    groups,
    table: {
      columns: [groupCol, "period", "value", "series", "low", "high"],
      rows: combinedRows,
    },
    points,
    diagnosticsWarnings: warnings,
  };
}

export function isGroupedForecastResult(
  value: GroupedForecastResult | ForecastResult,
): value is GroupedForecastResult {
  return Boolean(value && typeof value === "object" && "groups" in value);
}
