import {
  buildForecast,
  type ForecastMethod,
} from "@/modules/analyse/domain/forecast";
import {
  buildGroupedForecast,
  isGroupedForecastResult,
} from "@/modules/analyse/domain/groupedForecast";
import { buildForecastInsights } from "@/modules/analyse/domain/insights";
import {
  columnLooksLikeIdentifier,
  forecastMeasureColumns,
  guessPeriodColumn,
  pickForecastMeasure,
} from "@/modules/analyse/domain/stats";
import {
  resolveValueFormat,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import type { BlockDefinition, TabularData } from "../domain/types";
import { projectionMeta } from "../catalog";

function resolveValueColumn(
  table: TabularData,
  configured: string,
  goal?: string,
): string {
  const measures = forecastMeasureColumns(table);
  // Honour an explicit measure only when it ranks as forecastable (never pharmacyId-style keys)
  if (configured && measures.includes(configured)) return configured;
  if (configured && columnLooksLikeIdentifier(table, configured)) {
    return pickForecastMeasure(table, goal) || measures[0] || "";
  }
  return pickForecastMeasure(table, goal) || measures[0] || "";
}

export const projectionBlock: BlockDefinition = {
  ...projectionMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Forecast requires a table input");

    const column = resolveValueColumn(
      table,
      (config.column as string) || "",
      String(config.goalPrompt ?? ""),
    );
    if (!column) {
      throw new Error(
        "No numeric measure to forecast. Pick a value column (e.g. Sales, Amount, Quantity) — not IDs like pharmacyId.",
      );
    }

    let periodColumn = (config.periodColumn as string) || "";
    if (!periodColumn || periodColumn === column || !table.columns.includes(periodColumn)) {
      periodColumn = guessPeriodColumn(table, column);
    }

    const groupColumnRaw = String(config.groupColumn ?? "").trim();
    const groupColumn =
      groupColumnRaw &&
      table.columns.includes(groupColumnRaw) &&
      groupColumnRaw !== column &&
      groupColumnRaw !== periodColumn
        ? groupColumnRaw
        : "";

    const compareRaw = config.compareMethods;
    const compareMethods = Array.isArray(compareRaw)
      ? (compareRaw as string[])
      : typeof compareRaw === "string" && compareRaw
        ? compareRaw.split(",").map((s) => s.trim())
        : undefined;

    const forecastInput = {
      column,
      periodColumn: periodColumn || undefined,
      groupColumn: groupColumn || undefined,
      periods: Number(config.periods ?? 3),
      futureMode: (config.futureMode as string) || "count",
      untilDate: (config.untilDate as string) || "",
      customFutureDates: (config.customFutureDates as string) || "",
      method: (config.method as ForecastMethod) || "trend",
      window: Number(config.window ?? 3),
      seasonLength: Number(config.seasonLength ?? 12),
      alpha: Number(config.alpha ?? 0.3),
      confidenceBand: config.confidenceBand !== false,
      periodOrder: (config.periodOrder as string) || "auto",
      compareMethods:
        compareMethods && compareMethods.length ? compareMethods : undefined,
      outputShape: config.outputShape === "wide" ? ("wide" as const) : ("long" as const),
      excludePartialLastPeriod: config.excludePartialLastPeriod !== false,
    };

    const built = groupColumn
      ? buildGroupedForecast(table, forecastInput)
      : buildForecast(table, forecastInput);

    const formats = (config._columnFormats as
      | Record<string, ColumnDisplayFormat>
      | undefined) ?? {};
    const valueFormat = resolveValueFormat(formats, column) ?? {
      kind: "number" as const,
      useGrouping: true,
    };

    if (isGroupedForecastResult(built)) {
      if (!built.groups.length) {
        throw new Error(
          `No groups in “${groupColumn}” had enough history to forecast.`,
        );
      }
      const primary = built.groups[0]!.result;
      const insightLines = [
        `Forecast by ${groupColumn}: ${built.groups.length} group(s).`,
        ...built.diagnosticsWarnings.slice(0, 4),
        ...built.groups.slice(0, 4).map((g) => {
          const next = g.result.forecast[0];
          return `${g.key}: next ≈ ${
            next == null ? "n/a" : Number(next).toLocaleString()
          } (${g.result.method})`;
        }),
      ];
      return {
        table: built.table,
        projection: {
          column,
          groupColumn,
          periods: primary.periods,
          method: primary.method,
          selectedModelReason: `Per-${groupColumn} forecasts (${built.groups.length} series).`,
          forecast: primary.forecast,
          band: primary.band,
          diagnostics: {
            ...primary.diagnostics,
            warnings: [
              ...(primary.diagnostics?.warnings ?? []),
              ...built.diagnosticsWarnings,
            ],
          },
          leaderboard: primary.compare,
          recommendedMethod: primary.recommendedMethod,
          backtest: primary.backtest,
          intervalMethod: primary.intervalMethod,
          scenarios: primary.scenarios,
          groups: built.groups.map((g) => ({
            key: g.key,
            method: g.result.method,
            forecast: g.result.forecast,
            diagnostics: g.result.diagnostics,
            kpis: buildForecastInsights(g.result, valueFormat).kpis,
          })),
          reproducibility: primary.reproducibility,
          kpis: buildForecastInsights(primary, valueFormat).kpis,
        },
        explanation: insightLines.map((l) => `• ${l}`).join("\n"),
        insights: insightLines,
        chart: {
          type: "line" as const,
          title: `Forecast · ${column} by ${groupColumn}`,
          xLabel: "Period",
          yLabel: column,
          forecastSplit: true,
          valueFormat,
          insights: insightLines,
          points: built.points.map((p) => ({
            x: p.period,
            y: p.value,
            series: p.series,
            low: p.low,
            high: p.high,
          })),
        },
        contract: {
          version: 1,
          kind: "forecast",
          rowCount: built.table.rows.length,
          columns: built.table.columns,
          grain: "group_period",
          primaryMeasure: column,
          warnings: built.diagnosticsWarnings,
        },
        _columnFormats: {
          ...formats,
          value: valueFormat,
          [column]: formats[column] ?? valueFormat,
        },
      };
    }

    const result = built;
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

    const { insights, kpis } = buildForecastInsights(result, valueFormat);
    const insightLines = insights.map((i) => `${i.title}: ${i.detail}`);

    return {
      table: result.table,
      projection: {
        column: result.column,
        groupColumn: "",
        periods: result.periods,
        method: result.method,
        selectedModelReason: result.selectedModelReason,
        forecast: result.forecast,
        band: result.band,
        diagnostics: result.diagnostics,
        leaderboard: result.compare,
        recommendedMethod: result.recommendedMethod,
        backtest: result.backtest,
        intervalMethod: result.intervalMethod,
        scenarios: result.scenarios,
        reproducibility: result.reproducibility,
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
      contract: {
        version: 1,
        kind: "forecast",
        rowCount: result.table.rows.length,
        columns: result.table.columns,
        grain: "period",
        primaryMeasure: result.column,
        warnings: result.diagnostics?.warnings ?? [],
      },
      _columnFormats: {
        ...formats,
        value: valueFormat,
        [result.column]: formats[result.column] ?? valueFormat,
      },
    };
  },
};
