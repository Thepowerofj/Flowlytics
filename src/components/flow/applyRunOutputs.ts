import {
  normalizeOutputColumns,
  type OutputColumnSpec,
} from "@/modules/ai/domain/structuredOutput";
import type { TabularData } from "@/modules/blocks/domain/types";
import type { ColumnDisplayFormat } from "@/modules/ingest/domain/columnFormat";

export type RunStepOutput = {
  blockId: string;
  status: string;
  outputJson?: unknown | null;
};

/** Blocks that store `config.table` as their *input* (not display output). */
export function usesTableAsInput(blockType: string): boolean {
  return (
    blockType === "transform.clean_map" ||
    blockType === "transform.aggregate" ||
    // Forecast keeps the upstream series as `table` so users can still change
    // the value column after Run; forecast series lives in `_runOutputTable`.
    blockType === "analyse.projection"
  );
}

function mergeColumnFormats(
  existing: unknown,
  fromOutput: unknown,
): Record<string, ColumnDisplayFormat> | undefined {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, ColumnDisplayFormat>)
      : {};
  const extra =
    fromOutput && typeof fromOutput === "object" && !Array.isArray(fromOutput)
      ? (fromOutput as Record<string, ColumnDisplayFormat>)
      : {};
  if (!Object.keys(base).length && !Object.keys(extra).length) {
    return existing as Record<string, ColumnDisplayFormat> | undefined;
  }
  return { ...base, ...extra };
}

function asTable(value: unknown): TabularData | null {
  if (!value || typeof value !== "object") return null;
  const t = value as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(t.columns) || !t.columns.length || !Array.isArray(t.rows)) {
    return null;
  }
  return t as TabularData;
}

/** Map succeeded step outputs by activity id. */
export function stepOutputsByBlockId(
  steps: RunStepOutput[] | undefined | null,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!steps?.length) return map;
  for (const step of steps) {
    if (step.status !== "SUCCEEDED") continue;
    if (!step.outputJson || typeof step.outputJson !== "object") continue;
    map.set(step.blockId, step.outputJson as Record<string, unknown>);
  }
  return map;
}

/**
 * Merge a step's full-run output into an activity config for canvas display.
 * Clears the preview-sample flag so Stats/Chart show full-dataset results.
 *
 * Clean/Map and Aggregate keep `table` as their input schema — overwriting it
 * with the step output would make Aggregate configure against its own results.
 */
export function mergeRunOutputIntoConfig(
  config: Record<string, unknown>,
  output: Record<string, unknown> | undefined,
  blockType?: string,
): Record<string, unknown> {
  if (!output) return config;
  const table = asTable(output.table);
  if (!table) return config;

  if (blockType && usesTableAsInput(blockType)) {
    const next: Record<string, unknown> = {
      ...config,
      _previewSample: false,
      _runOutputTable: table,
      _columnFormats: mergeColumnFormats(
        config._columnFormats,
        output._columnFormats,
      ),
      _inputColumnFormats: config._inputColumnFormats,
    };
    if (output.stats != null) next._runStats = output.stats;
    if (output.contract != null) next._runContract = output.contract;
    if (output.qualityProfile != null) next._qualityProfile = output.qualityProfile;
    if (output.chart != null) next._runChart = output.chart;
    if (output.projection != null) next._runProjection = output.projection;
    if (typeof output.explanation === "string") next.explanation = output.explanation;
    if (Array.isArray(output.insights)) next.insights = output.insights;
    if (output.insightReport != null) next.insightReport = output.insightReport;
    if (output.suggestedChart != null) next.suggestedChart = output.suggestedChart;
    if (output.chartSuggestion != null) next.suggestedChart = output.chartSuggestion;
    if (Array.isArray(output.outputColumns)) next.outputColumns = output.outputColumns;
    return next;
  }

  const next: Record<string, unknown> = {
    ...config,
    table,
    _previewSample: false,
    _sourceColumns: table.columns,
    // AI Structure also keeps a dedicated run output so schema preview stays stable
    ...(blockType === "ai.structure" ? { _runOutputTable: table } : {}),
    // Keep Clean/Map currency & number formatting; merge Forecast `value` format
    _columnFormats: mergeColumnFormats(
      config._columnFormats,
      output._columnFormats,
    ),
    _inputColumnFormats: config._inputColumnFormats,
  };

  if (output.stats != null) next._runStats = output.stats;
  if (output.contract != null) next._runContract = output.contract;
  if (output.qualityProfile != null) next._qualityProfile = output.qualityProfile;
  if (output.chart != null) next._runChart = output.chart;
  if (output.projection != null) next._runProjection = output.projection;
  if (typeof output.explanation === "string") next.explanation = output.explanation;
  if (Array.isArray(output.insights)) next.insights = output.insights;
  if (output.insightReport != null) next.insightReport = output.insightReport;
  if (output.suggestedChart != null) next.suggestedChart = output.suggestedChart;
  if (output.chartSuggestion != null) next.suggestedChart = output.chartSuggestion;
  applyStructureSchemaFromOutput(next, config, output, blockType);

  return next;
}

/** AI Structure: keep suggested schema insight; auto-fill builder when unlocked. */
function applyStructureSchemaFromOutput(
  next: Record<string, unknown>,
  config: Record<string, unknown>,
  output: Record<string, unknown>,
  blockType?: string,
) {
  if (blockType !== "ai.structure") {
    if (Array.isArray(output.outputColumns)) next.outputColumns = output.outputColumns;
    return;
  }

  const suggested = normalizeOutputColumns(
    output.suggestedOutputColumns ?? output.outputColumns,
  );
  if (suggested.length) {
    next.suggestedOutputColumns = suggested;
  }

  const hadBuilder = normalizeOutputColumns(config.outputColumns).length > 0;
  const locked = Boolean(config.lockSchema) || hadBuilder;

  if (!locked && suggested.length) {
    // Auto mode — populate the column builder from the AI result
    next.outputColumns = suggested as OutputColumnSpec[];
    next.schemaAutoFilled = true;
  } else if (hadBuilder) {
    // Keep the user’s builder; still surface the suggestion for insight/apply
    next.outputColumns = normalizeOutputColumns(config.outputColumns);
  } else if (Array.isArray(output.outputColumns)) {
    next.outputColumns = normalizeOutputColumns(output.outputColumns);
  }
}

type NodeLike = {
  id: string;
  data: {
    blockType: string;
    config: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** Write full per-step tables onto matching nodes after a successful run. */
export function applyRunOutputsToNodes<T extends NodeLike>(
  nodes: T[],
  steps: RunStepOutput[] | undefined | null,
): T[] {
  const byId = stepOutputsByBlockId(steps);
  if (!byId.size) return nodes;

  return nodes.map((n) => {
    const out = byId.get(n.id);
    if (!out) return n;
    const nextConfig = mergeRunOutputIntoConfig(
      n.data.config,
      out,
      n.data.blockType,
    );
    if (nextConfig === n.data.config) return n;
    return {
      ...n,
      data: {
        ...n.data,
        config: nextConfig,
      },
    };
  });
}
