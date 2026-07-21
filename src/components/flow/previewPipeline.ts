import {
  aggregateTable,
  type AggregateMetric,
} from "@/modules/analyse/domain/aggregate";
import {
  buildForecast,
  type ForecastMethod,
} from "@/modules/analyse/domain/forecast";
import {
  normalizeOutputColumns,
  previewTableFromSchema,
} from "@/modules/ai/domain/structuredOutput";
import type { TabularData } from "@/modules/blocks/domain/types";
import {
  applyTableTransforms,
  defaultColumnTransform,
  type ColumnTransform,
} from "@/modules/ingest/domain/columnTransform";

/** Rows used for canvas / config previews only. Full data runs on Run. */
export const PREVIEW_SAMPLE_ROWS = 25;

export function sampleTable(
  table: TabularData,
  limit: number = PREVIEW_SAMPLE_ROWS,
): TabularData {
  return {
    columns: [...table.columns],
    rows: table.rows.slice(0, limit).map((row) => ({ ...row })),
  };
}

/**
 * Materialize what a block would emit for visual-editor preview.
 * Always samples — never used for worker Run (which uses DAG inputs).
 */
export function previewOutputTable(
  blockType: string,
  config: Record<string, unknown>,
): TabularData | null {
  // AI Structure emits a *new* table — never passthrough the upstream input.
  if (blockType === "ai.structure") {
    const runOut = config._runOutputTable as TabularData | undefined;
    if (runOut?.columns?.length) return sampleTable(runOut);
    const table = config.table as TabularData | undefined;
    const schema = normalizeOutputColumns(config.outputColumns);
    // After a successful Run, config.table is the structured output
    if (
      table?.columns?.length &&
      config._previewSample === false &&
      (!schema.length || schema.every((c) => table.columns.includes(c.name)))
    ) {
      return sampleTable(table);
    }
    return previewTableFromSchema(schema);
  }

  const table = config.table as TabularData | undefined;
  if (!table?.columns?.length) return null;

  const sampled = sampleTable(table);

  if (blockType === "transform.clean_map") {
    const dropColumns = (config.dropColumns as string[]) ?? [];
    const columnMap = (config.columnMap as Record<string, string>) ?? {};
    const transforms = (config.transforms as Record<string, ColumnTransform>) ?? {};
    const withDefaults: Record<string, ColumnTransform> = { ...transforms };
    for (const c of sampled.columns) {
      if (!withDefaults[c]) withDefaults[c] = defaultColumnTransform();
    }
    const next = applyTableTransforms(sampled, {
      dropColumns,
      columnMap,
      transforms: withDefaults,
    });
    return {
      columns: next.columns,
      rows: next.rows as TabularData["rows"],
    };
  }

  if (blockType === "transform.aggregate") {
    const groupBy = (config.groupBy as string[]) ?? [];
    const metrics = (config.metrics as AggregateMetric[]) ?? [];
    if (!groupBy.length && !metrics.length) return sampled;
    return aggregateTable(sampled, { groupBy, metrics });
  }

  if (blockType === "analyse.projection") {
    const column = (config.column as string) || "";
    if (!column || !sampled.columns.includes(column)) return sampled;
    try {
      const result = buildForecast(sampled, {
        column,
        periodColumn: (config.periodColumn as string) || undefined,
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
      if (result.actual.length < 2) return sampled;
      return result.table;
    } catch {
      return sampled;
    }
  }

  // Ingest and passthrough analyse/output/AI: preview = sampled table as-is
  return sampled;
}

/** Patches that change a node's preview output and should cascade downstream. */
export function patchAffectsPreviewOutput(
  blockType: string,
  patch: Record<string, unknown>,
): boolean {
  if ("table" in patch) return true;
  if (blockType === "ai.structure") {
    return "outputColumns" in patch || "_runOutputTable" in patch;
  }
  if (blockType === "transform.clean_map") {
    return (
      "columnMap" in patch ||
      "dropColumns" in patch ||
      "transforms" in patch
    );
  }
  if (blockType === "transform.aggregate") {
    return "groupBy" in patch || "metrics" in patch;
  }
  if (blockType === "analyse.projection") {
    return (
      "column" in patch ||
      "periodColumn" in patch ||
      "periods" in patch ||
      "futureMode" in patch ||
      "untilDate" in patch ||
      "customFutureDates" in patch ||
      "method" in patch ||
      "window" in patch ||
      "seasonLength" in patch ||
      "alpha" in patch ||
      "confidenceBand" in patch
    );
  }
  return false;
}
