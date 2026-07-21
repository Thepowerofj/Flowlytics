import {
  buildForecast,
  type ForecastMethod,
} from "@/modules/analyse/domain/forecast";
import { buildForecastInsights } from "@/modules/analyse/domain/insights";
import {
  columnLooksLikeDate,
  forecastMeasureColumns,
  guessPeriodColumn,
  toNumeric,
} from "@/modules/analyse/domain/stats";
import {
  resolveValueFormat,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import type { BlockDefinition, TabularData } from "../domain/types";

function resolveValueColumn(table: TabularData, configured: string): string {
  const measures = forecastMeasureColumns(table);
  if (configured && measures.includes(configured)) return configured;
  // Configured column exists but isn't a measure (e.g. a date) — pick a real measure
  if (configured && table.columns.includes(configured)) {
    const numericCount = table.rows.filter((r) => toNumeric(r[configured]) != null).length;
    if (numericCount >= 2 && !columnLooksLikeDate(table, configured)) {
      return configured;
    }
  }
  return measures[0] || "";
}

export const projectionBlock: BlockDefinition = {
  type: "analyse.projection",
  label: "Forecast",
  description:
    "Project a numeric series forward with trend, averages, seasonality, or growth",
  category: "analyse",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "projection", label: "Projection", dataType: "any" },
  ],
  defaultConfig: {
    column: "",
    periodColumn: "",
    periods: 3,
    futureMode: "count",
    untilDate: "",
    customFutureDates: "",
    method: "trend",
    window: 3,
    seasonLength: 12,
    alpha: 0.3,
    confidenceBand: true,
  },
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Forecast requires a table input");

    const column = resolveValueColumn(table, (config.column as string) || "");
    if (!column) {
      throw new Error(
        "No numeric measure to forecast. Pick a number column (e.g. Sales) — dates/months are only used as period labels.",
      );
    }

    let periodColumn = (config.periodColumn as string) || "";
    if (!periodColumn || periodColumn === column || !table.columns.includes(periodColumn)) {
      periodColumn = guessPeriodColumn(table, column);
    }

    const result = buildForecast(table, {
      column,
      periodColumn: periodColumn || undefined,
      periods: Number(config.periods ?? 3),
      futureMode: (config.futureMode as string) || "count",
      untilDate: (config.untilDate as string) || "",
      customFutureDates: (config.customFutureDates as string) || "",
      method: (config.method as ForecastMethod) || "trend",
      window: Number(config.window ?? 3),
      seasonLength: Number(config.seasonLength ?? 12),
      alpha: Number(config.alpha ?? 0.3),
      confidenceBand: config.confidenceBand !== false,
    });

    if (result.actual.length === 0) {
      throw new Error(
        `“${column}” has no readable numbers. Forecast needs a numeric measure — use dates only in “Period labels”.`,
      );
    }
    if (result.actual.length < 2) {
      throw new Error(
        `“${column}” only has ${result.actual.length} numeric value — need at least 2 history points to forecast.`,
      );
    }

    const formats = (config._columnFormats as
      | Record<string, ColumnDisplayFormat>
      | undefined) ?? {};
    const valueFormat = resolveValueFormat(formats, result.column) ?? {
      kind: "number" as const,
      useGrouping: true,
    };
    const { insights, kpis } = buildForecastInsights(result, valueFormat);
    const insightLines = insights.map((i) => `${i.title}: ${i.detail}`);

    return {
      table: result.table,
      projection: {
        column: result.column,
        periods: result.periods,
        method: result.method,
        forecast: result.forecast,
        band: result.band,
        kpis,
      },
      explanation: insightLines.map((l) => `• ${l}`).join("\n"),
      insights: insightLines,
      chart: {
        type: "line" as const,
        title: `Forecast · ${result.column}`,
        xLabel: "Period",
        yLabel: result.column,
        forecastSplit: true,
        valueFormat,
        insights: insightLines,
        points: result.points.map((p) => ({
          x: p.period,
          y: p.value,
          series: p.series,
          low: p.low,
          high: p.high,
        })),
      },
      // So canvas / Results keep currency on the series `value` column
      _columnFormats: {
        ...formats,
        value: valueFormat,
        [result.column]: formats[result.column] ?? valueFormat,
      },
    };
  },
};
