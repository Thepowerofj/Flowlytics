import {
  defaultMetricAs,
  type AggregateMetric,
} from "@/modules/analyse/domain/aggregate";
import { suggestCharts } from "@/modules/analyse/domain/charts";
import {
  forecastMeasureColumns,
  guessPeriodColumn,
  numericColumns,
} from "@/modules/analyse/domain/stats";
import { normalizeOutputColumns } from "@/modules/ai/domain/structuredOutput";
import type { TabularData } from "@/modules/blocks/domain/types";
import {
  formatsFromCleanMap,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import { defaultColumnTransform } from "@/modules/ingest/domain/columnTransform";
import { suggestColumnTransform } from "@/modules/ingest/domain/suggestCleanMap";
import { previewOutputTable } from "./previewPipeline";

function resolveUpstreamFormats(
  sourceType: string,
  sourceConfig: Record<string, unknown>,
): Record<string, ColumnDisplayFormat> {
  if (sourceType === "transform.clean_map") {
    return formatsFromCleanMap(sourceConfig);
  }
  const existing = sourceConfig._columnFormats;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, ColumnDisplayFormat>;
  }
  return {};
}

/** Map upstream formats onto Aggregate output columns (group-by + metric aliases). */
export function formatsForAggregate(
  upstream: Record<string, ColumnDisplayFormat>,
  groupBy: string[],
  metrics: AggregateMetric[],
): Record<string, ColumnDisplayFormat> {
  const out: Record<string, ColumnDisplayFormat> = {};
  for (const g of groupBy) {
    out[g] = upstream[g] ?? { kind: "string" };
  }
  for (const m of metrics) {
    const as = m.as?.trim() || defaultMetricAs(m.op, m.column);
    if (m.op === "count" || m.op === "count_distinct") {
      out[as] = { kind: "number", decimals: 0, useGrouping: true };
      continue;
    }
    if (m.op === "pct_total") {
      out[as] = { kind: "number", decimals: 2, useGrouping: true };
      continue;
    }
    const base = upstream[m.column] ?? { kind: "number", useGrouping: true };
    out[as] = {
      ...base,
      kind: base.kind === "currency" ? "currency" : "number",
      useGrouping: base.useGrouping ?? true,
    };
  }
  return out;
}

/** Authoritative columns for a node config — prefer materialised preview table. */
export function availableColumns(config: Record<string, unknown>): string[] {
  const table = config.table as TabularData | undefined;
  if (table?.columns?.length) return [...table.columns];
  if (Array.isArray(config._sourceColumns)) {
    return [...(config._sourceColumns as string[])];
  }
  return [];
}

export function getColumnsFromConfig(config: Record<string, unknown>): string[] {
  return availableColumns(config);
}

function guessNumericColumn(table?: TabularData | null): string {
  if (!table?.columns?.length) return "";
  return numericColumns(table)[0] ?? table.columns[0] ?? "";
}

function guessForecastMeasure(table?: TabularData | null): string {
  if (!table?.columns?.length) return "";
  return forecastMeasureColumns(table)[0] ?? "";
}

/** Remap a previously chosen column through Clean/Map renames when possible. */
function remapColumn(
  name: string | undefined,
  columns: string[],
  columnMap: Record<string, string>,
  fallback: string,
): string {
  if (!name) return fallback;
  if (columns.includes(name)) return name;
  const mapped = columnMap[name];
  if (mapped && columns.includes(mapped)) return mapped;
  for (const [from, to] of Object.entries(columnMap)) {
    if (to === name && columns.includes(to)) return to;
  }
  return fallback;
}

function onlyAvailable(names: string[], columns: string[]): string[] {
  const set = new Set(columns);
  return names.filter((c) => set.has(c));
}

/**
 * When a source activity connects to a target, prefill the target for the next step.
 * Uses the source's **preview output** (sampled; cleaned/dropped/renamed if Clean/Map).
 * Downstream never keeps columns that are no longer in that output.
 */
export function autoMapOnConnect(
  sourceType: string,
  sourceConfig: Record<string, unknown>,
  targetType: string,
  targetConfig: Record<string, unknown>,
): Record<string, unknown> {
  // AI Structure consumes upstream text/table but emits its own schema.
  // Do not overwrite its outputColumns / structured table with the input table.
  if (targetType === "ai.structure") {
    const upstream = previewOutputTable(sourceType, sourceConfig);
    const upstreamCols = upstream?.columns ?? [];
    return {
      ...targetConfig,
      // Keep configured / last-run structured output for downstream auto-map
      table: targetConfig.table,
      _runOutputTable: targetConfig._runOutputTable,
      outputColumns: normalizeOutputColumns(targetConfig.outputColumns),
      suggestedOutputColumns: normalizeOutputColumns(
        targetConfig.suggestedOutputColumns,
      ),
      _upstreamColumns: upstreamCols,
      _upstreamPreview: upstream
        ? {
            columns: upstream.columns,
            rows: upstream.rows.slice(0, 5),
          }
        : null,
      lockSchema: Boolean(targetConfig.lockSchema),
      aiOptIn: targetConfig.aiOptIn ?? false,
      rawText: targetConfig.rawText ?? "",
      instructions: targetConfig.instructions ?? "",
      datasetName: (targetConfig.datasetName as string) || "",
      explanation: targetConfig.explanation,
    };
  }

  const table = previewOutputTable(sourceType, sourceConfig);
  if (!table?.columns?.length) {
    // Upstream has no usable output — clear stale downstream schema
    return {
      ...targetConfig,
      table: null,
      _sourceColumns: [],
      selectedColumns: [],
      xColumn: "",
      yColumn: "",
      column: "",
      suggestionId: "",
    };
  }
  const columns = table.columns;

  const sourceColumnMap =
    (sourceConfig.columnMap as Record<string, string> | undefined) ?? {};
  const upstreamFormats = resolveUpstreamFormats(sourceType, sourceConfig);

  const base = {
    ...targetConfig,
    _sourceColumns: columns,
    _previewSample: true,
    // Snapshot of upstream *output* (post Clean/Map drops/renames/types)
    table,
    // Display formatting (currency, grouping) carried to charts/stats/structure
    _columnFormats: upstreamFormats,
  };

  switch (targetType) {
    case "transform.clean_map": {
      // Clean/Map stores upstream output as its *input* table
      const existing = (targetConfig.columnMap as Record<string, string>) ?? {};
      const existingTransforms =
        (targetConfig.transforms as Record<string, ReturnType<typeof defaultColumnTransform>>) ??
        {};
      const columnMap: Record<string, string> = {};
      const transforms: Record<string, ReturnType<typeof defaultColumnTransform>> = {};
      for (const col of columns) {
        columnMap[col] = existing[col] ?? col;
        // Keep existing casts; infer date/currency/number/… for new columns
        transforms[col] =
          existingTransforms[col] ?? suggestColumnTransform(table, col);
      }
      // Drop list can only reference current input columns
      const dropColumns = ((targetConfig.dropColumns as string[]) ?? []).filter((c) =>
        columns.includes(c),
      );
      const nextCfg = { columnMap, transforms, dropColumns, _sourceColumns: columns };
      return {
        ...base,
        ...nextCfg,
        datasetName: (targetConfig.datasetName as string) || "",
        _columnFormats: formatsFromCleanMap(nextCfg),
      };
    }
    case "transform.aggregate": {
      const existingGroup = ((targetConfig.groupBy as string[]) ?? []).filter((c) =>
        columns.includes(c),
      );
      const numeric = numericColumns(table);
      const existingMetrics = (targetConfig.metrics as AggregateMetric[]) ?? [];
      const metrics: AggregateMetric[] =
        existingMetrics.length > 0
          ? existingMetrics.map((m) => ({
              ...m,
              column:
                m.op === "count"
                  ? m.column
                  : columns.includes(m.column)
                    ? m.column
                    : numeric[0] ?? columns[0] ?? "",
            }))
          : [
              {
                column: numeric[0] ?? columns[0] ?? "",
                op: "sum",
                as: "",
              },
            ];
      const groupBy = existingGroup.length
        ? existingGroup
        : columns[0]
          ? [columns[0]]
          : [];
      return {
        ...base,
        groupBy,
        metrics,
        datasetName: (targetConfig.datasetName as string) || "",
        // Input formats (table columns) so AggregateConfig can recompute output formats
        _inputColumnFormats: upstreamFormats,
        _columnFormats: formatsForAggregate(upstreamFormats, groupBy, metrics),
      };
    }
    case "output.structure": {
      const selected = (targetConfig.selectedColumns as string[]) ?? [];
      const remapped = onlyAvailable(
        selected.map((c) => remapColumn(c, columns, sourceColumnMap, "")).filter(Boolean),
        columns,
      );
      return {
        ...base,
        selectedColumns: remapped.length ? [...new Set(remapped)] : [...columns],
        fileName: (targetConfig.fileName as string) || "flowlytics-export.csv",
      };
    }
    case "analyse.projection": {
      const measures = forecastMeasureColumns(table);
      const preferred = remapColumn(
        targetConfig.column as string | undefined,
        columns,
        sourceColumnMap,
        "",
      );
      const periodPreferred = remapColumn(
        targetConfig.periodColumn as string | undefined,
        columns,
        sourceColumnMap,
        "",
      );
      const valueColumn =
        preferred && measures.includes(preferred)
          ? preferred
          : guessForecastMeasure(table);
      const periodColumn =
        periodPreferred &&
        periodPreferred !== valueColumn &&
        columns.includes(periodPreferred)
          ? periodPreferred
          : guessPeriodColumn(table, valueColumn);
      return {
        ...base,
        column: valueColumn,
        periodColumn,
        periods: Number(targetConfig.periods ?? 3),
        futureMode: (targetConfig.futureMode as string) || "count",
        untilDate: (targetConfig.untilDate as string) || "",
        customFutureDates: (targetConfig.customFutureDates as string) || "",
        method: (targetConfig.method as string) || "trend",
        window: Number(targetConfig.window ?? 3),
        seasonLength: Number(targetConfig.seasonLength ?? 12),
        alpha: Number(targetConfig.alpha ?? 0.3),
        confidenceBand: targetConfig.confidenceBand !== false,
      };
    }
    case "analyse.chart": {
      const aiSuggestion =
        sourceType === "ai.chart" &&
        sourceConfig.suggestedChart &&
        typeof sourceConfig.suggestedChart === "object"
          ? (sourceConfig.suggestedChart as {
              chartType?: string;
              xColumn?: string;
              yColumn?: string;
            })
          : null;
      const suggestions = suggestCharts(table);
      const first = suggestions[0];
      const xFallback =
        (aiSuggestion?.xColumn &&
        (columns.includes(aiSuggestion.xColumn) ||
          aiSuggestion.xColumn === "__row__")
          ? aiSuggestion.xColumn
          : null) ||
        first?.xColumn ||
        columns[0] ||
        "";
      const yFallback =
        (aiSuggestion?.yColumn &&
        (columns.includes(aiSuggestion.yColumn) ||
          aiSuggestion.yColumn === "__count__")
          ? aiSuggestion.yColumn
          : null) ||
        first?.yColumn ||
        guessNumericColumn(table) ||
        "__count__";
      const xColumn = remapColumn(
        targetConfig.xColumn as string | undefined,
        columns,
        sourceColumnMap,
        xFallback,
      );
      const yColumn = remapColumn(
        targetConfig.yColumn as string | undefined,
        columns,
        sourceColumnMap,
        yFallback,
      );
      // Special chart sentinels stay valid even if not in column list
      const safeX =
        xColumn === "__row__" || columns.includes(xColumn) ? xColumn : xFallback;
      const safeY =
        yColumn === "__count__" || columns.includes(yColumn) ? yColumn : yFallback;
      const prevSuggestion = targetConfig.suggestionId as string | undefined;
      const suggestionStillValid = suggestions.some(
        (s) =>
          s.id === prevSuggestion && s.xColumn === safeX && s.yColumn === safeY,
      );
      const chartType =
        aiSuggestion?.chartType === "bar" ||
        aiSuggestion?.chartType === "line" ||
        aiSuggestion?.chartType === "pie"
          ? aiSuggestion.chartType
          : (targetConfig.chartType as string) || first?.type || "bar";
      return {
        ...base,
        chartType,
        xColumn: safeX,
        yColumn: safeY,
        suggestionId: aiSuggestion
          ? "ai-suggest"
          : suggestionStillValid
            ? prevSuggestion
            : first?.id || "",
        nodeWidth: 480,
        nodeHeight: 400,
      };
    }
    case "analyse.stats":
    case "ai.explain":
    case "ai.analyse":
    case "ai.chart":
      return base;
    default:
      return base;
  }
}

type NodeLike = {
  id: string;
  data: {
    blockType: string;
    config: Record<string, unknown>;
    [key: string]: unknown;
  };
};

type EdgeLike = { source: string; target: string };

/**
 * Re-apply preview auto-map from `startId` through all descendants (BFS).
 * Call after ingest upload or Clean/Map transform edits (drop/rename/type).
 */
export function propagatePreviewFrom<T extends NodeLike>(
  nodes: T[],
  edges: EdgeLike[],
  startId: string,
): T[] {
  let next = nodes.map((n) => ({
    ...n,
    data: { ...n.data, config: { ...n.data.config } },
  }));
  const queue = [startId];
  const seen = new Set<string>();

  while (queue.length) {
    const sourceId = queue.shift()!;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const source = next.find((n) => n.id === sourceId);
    if (!source) continue;

    for (const edge of edges.filter((e) => e.source === sourceId)) {
      const targetIndex = next.findIndex((n) => n.id === edge.target);
      if (targetIndex < 0) continue;
      const target = next[targetIndex]!;
      const mapped = autoMapOnConnect(
        source.data.blockType,
        source.data.config,
        target.data.blockType,
        target.data.config,
      );
      next[targetIndex] = {
        ...target,
        data: { ...target.data, config: mapped },
      };
      queue.push(edge.target);
    }
  }

  return next;
}

/**
 * Bind a node config to its upstream preview output (for config window display).
 * Downstream pickers only see post-transform columns.
 *
 * Clean/Map, Aggregate, and Forecast always rebind `table` from upstream (that
 * field is their *input*). Stats/Chart/Structure may keep a full-run table after Run.
 */
export function bindConfigToUpstream(
  blockType: string,
  config: Record<string, unknown>,
  upstreamType: string,
  upstreamConfig: Record<string, unknown>,
): Record<string, unknown> {
  const mapped = autoMapOnConnect(upstreamType, upstreamConfig, blockType, config);

  // Input-table activities: never replace the rebound input with a prior run output
  if (
    blockType === "transform.clean_map" ||
    blockType === "transform.aggregate" ||
    blockType === "analyse.projection"
  ) {
    const mappedCols = availableColumns(mapped);
    const keepColumn =
      typeof config.column === "string" &&
      config.column &&
      mappedCols.includes(config.column)
        ? config.column
        : mapped.column;
    const keepPeriod =
      typeof config.periodColumn === "string" &&
      config.periodColumn &&
      mappedCols.includes(config.periodColumn)
        ? config.periodColumn
        : mapped.periodColumn;
    return {
      ...mapped,
      // Preserve settings only when columns still exist on the rebound input
      column: keepColumn,
      periodColumn: keepPeriod,
      periods: config.periods ?? mapped.periods,
      futureMode: config.futureMode ?? mapped.futureMode,
      untilDate: config.untilDate ?? mapped.untilDate,
      customFutureDates: config.customFutureDates ?? mapped.customFutureDates,
      method: config.method ?? mapped.method,
      window: config.window ?? mapped.window,
      seasonLength: config.seasonLength ?? mapped.seasonLength,
      alpha: config.alpha ?? mapped.alpha,
      confidenceBand: config.confidenceBand ?? mapped.confidenceBand,
      _previewSample: config._previewSample === false ? false : mapped._previewSample,
      _runOutputTable: config._runOutputTable,
      _runStats: config._runStats,
      _runChart: config._runChart,
      _runProjection: config._runProjection,
      explanation: config.explanation,
      datasetName: config.datasetName ?? mapped.datasetName,
    };
  }

  const fullTable = config.table as TabularData | undefined;
  if (
    config._previewSample === false &&
    fullTable?.columns?.length &&
    Array.isArray(fullTable.rows)
  ) {
    return {
      ...mapped,
      table: fullTable,
      _previewSample: false,
      _sourceColumns: fullTable.columns,
      _columnFormats: config._columnFormats ?? mapped._columnFormats,
      _inputColumnFormats:
        config._inputColumnFormats ?? mapped._inputColumnFormats,
      _runStats: config._runStats,
      _runChart: config._runChart,
      explanation: config.explanation,
    };
  }
  return mapped;
}

/** Suggest the next activity type after an ingest. */
export function suggestNextAfter(blockType: string): string | null {
  if (blockType === "ingest.csv_excel") return "transform.clean_map";
  if (blockType === "transform.clean_map") return "transform.aggregate";
  if (blockType === "transform.aggregate") return "analyse.chart";
  if (blockType === "analyse.stats") return "analyse.chart";
  if (blockType === "analyse.chart") return "output.structure";
  if (blockType === "ai.structure") return "transform.clean_map";
  if (blockType === "ai.analyse" || blockType === "ai.explain") return "analyse.chart";
  if (blockType === "ai.chart") return "analyse.chart";
  return null;
}
