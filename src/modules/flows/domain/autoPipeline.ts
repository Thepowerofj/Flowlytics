import { suggestCharts } from "@/modules/analyse/domain/charts";
import {
  columnLooksLikeDate,
  forecastMeasureColumns,
  guessPeriodColumn,
  numericColumns,
} from "@/modules/analyse/domain/stats";
import type { FlowEdge, FlowGraph, FlowNode, TabularData } from "@/modules/blocks/domain/types";
import { getBlock } from "@/modules/blocks/registry";
import { applyTableTransforms } from "@/modules/ingest/domain/columnTransform";
import { suggestCleanMapConfig } from "@/modules/ingest/domain/suggestCleanMap";
import { alignFlowGraph } from "./flowLayout";

export type PipelineArchetype =
  | "timeseries"
  | "categorical"
  | "numeric"
  | "unstructured"
  | "mixed";

export type AutoPipelineStep = {
  type: string;
  /** Human label override */
  label?: string;
  config?: Record<string, unknown>;
};

export type AutoPipelinePlan = {
  archetype: PipelineArchetype;
  title: string;
  rationale: string;
  steps: AutoPipelineStep[];
};

export type DataProfile = {
  rowCount: number;
  columnCount: number;
  numericCols: string[];
  dateCols: string[];
  categoricalCols: string[];
  measureCol: string;
  periodCol: string;
  categoryCol: string;
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function profileTable(table: TabularData): DataProfile {
  const numericCols = numericColumns(table);
  const dateCols = table.columns.filter((c) => columnLooksLikeDate(table, c));
  const categoricalCols = table.columns.filter(
    (c) => !numericCols.includes(c) && !dateCols.includes(c),
  );
  const measureCol =
    forecastMeasureColumns(table)[0] || numericCols[0] || "";
  const periodCol = guessPeriodColumn(table, measureCol) || dateCols[0] || "";
  const categoryCol = categoricalCols[0] || "";
  return {
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    numericCols,
    dateCols,
    categoricalCols,
    measureCol,
    periodCol,
    categoryCol,
  };
}

function chartConfig(table: TabularData): Record<string, unknown> {
  const suggestions = suggestCharts(table);
  const first = suggestions[0];
  if (!first) return { chartType: "bar" };
  return {
    chartType: first.type,
    xColumn: first.xColumn,
    yColumn: first.yColumn,
    suggestionId: first.id,
  };
}

function forecastConfig(profile: DataProfile): Record<string, unknown> {
  return {
    column: profile.measureCol,
    periodColumn: profile.periodCol,
    periods: 3,
    method: "trend",
    confidenceBand: true,
    futureMode: "count",
  };
}

function aggregateConfig(profile: DataProfile): Record<string, unknown> {
  if (!profile.categoryCol || !profile.measureCol) return {};
  return {
    groupBy: [profile.categoryCol],
    metrics: [
      {
        op: "sum",
        column: profile.measureCol,
        as: `${profile.measureCol}_sum`,
      },
    ],
  };
}

/**
 * Decide a full analysis pipeline from structured table and/or messy notes.
 * Deterministic heuristics first (always works offline); AI blocks opt-in when requested.
 */
export function planAutoPipeline(input: {
  table?: TabularData | null;
  rawText?: string;
  /** Include AI Analyse (+ AI Structure for notes). Defaults true. */
  enableAi?: boolean;
  goal?: string;
}): AutoPipelinePlan {
  const enableAi = input.enableAi !== false;
  const rawText = (input.rawText ?? "").trim();
  const table = input.table;

  // Unstructured / notes path
  if ((!table?.columns?.length || table.rows.length === 0) && rawText) {
    const steps: AutoPipelineStep[] = [
      {
        type: "ai.structure",
        label: "AI Structure",
        config: {
          aiOptIn: true,
          rawText,
          datasetName: "From notes",
        },
      },
      { type: "transform.clean_map", label: "Clean / Map" },
      { type: "analyse.stats", label: "Stats" },
      { type: "analyse.chart", label: "Chart" },
    ];
    if (enableAi) {
      steps.push({
        type: "ai.analyse",
        label: "AI Analyse",
        config: { aiOptIn: true, datasetName: "Insights" },
      });
    }
    steps.push({
      type: "output.structure",
      label: "Export",
      config: { fileName: "flowlytics-insights.csv" },
    });
    return {
      archetype: "unstructured",
      title: "Notes → structured analysis",
      rationale:
        "Looks like free-form notes. Pipeline structures them with AI, cleans, charts, analyses, then exports.",
      steps,
    };
  }

  if (!table?.columns?.length) {
    return {
      archetype: "mixed",
      title: "Starter analysis path",
      rationale: "No data profile yet — built a versatile ingest → insights path. Upload data on Ingest.",
      steps: [
        { type: "ingest.csv_excel", label: "Ingest" },
        { type: "transform.clean_map", label: "Clean / Map" },
        { type: "analyse.stats", label: "Stats" },
        { type: "analyse.chart", label: "Chart" },
        ...(enableAi
          ? [
              {
                type: "ai.analyse",
                label: "AI Analyse",
                config: { aiOptIn: true },
              } satisfies AutoPipelineStep,
            ]
          : []),
        {
          type: "output.structure",
          label: "Export",
          config: { fileName: "flowlytics-export.csv" },
        },
      ],
    };
  }

  const profile = profileTable(table);
  const chart = chartConfig(table);
  const goal = (input.goal ?? "").toLowerCase();

  const wantForecast =
    /forecast|predict|outlook|trend|projection/i.test(goal) ||
    (profile.dateCols.length > 0 && profile.measureCol && profile.rowCount >= 3);
  const wantAggregate =
    /by category|breakdown|segment|region|product/i.test(goal) ||
    (Boolean(profile.categoryCol) &&
      Boolean(profile.measureCol) &&
      profile.dateCols.length === 0);

  let archetype: PipelineArchetype = "mixed";
  let rationale = "Balanced path: clean → explore → visualise → export.";

  if (wantForecast && profile.measureCol) {
    archetype = "timeseries";
    rationale = `Detected a time-friendly series (${profile.periodCol || "periods"} × ${profile.measureCol}). Pipeline cleans, charts the trend, forecasts ahead, then writes insights.`;
  } else if (wantAggregate && profile.categoryCol) {
    archetype = "categorical";
    rationale = `Detected categories (${profile.categoryCol}) with a measure (${profile.measureCol}). Pipeline aggregates, charts the ranking, then analyses.`;
  } else if (profile.measureCol && !profile.categoryCol) {
    archetype = "numeric";
    rationale = `Numeric focus on ${profile.measureCol}. Pipeline profiles stats, charts the series, then analyses.`;
  }

  const steps: AutoPipelineStep[] = [
    { type: "ingest.csv_excel", label: "Ingest" },
    { type: "transform.clean_map", label: "Clean / Map" },
  ];

  if (archetype === "categorical") {
    steps.push({
      type: "transform.aggregate",
      label: "Aggregate",
      config: aggregateConfig(profile),
    });
  }

  steps.push({ type: "analyse.stats", label: "Stats" });
  steps.push({
    type: "analyse.chart",
    label: "Chart",
    config: chart,
  });

  if (archetype === "timeseries" && profile.measureCol) {
    steps.push({
      type: "analyse.projection",
      label: "Forecast",
      config: forecastConfig(profile),
    });
  }

  if (enableAi) {
    steps.push({
      type: "ai.analyse",
      label: "AI Analyse",
      config: { aiOptIn: true, datasetName: "Auto insights" },
    });
  }

  steps.push({
    type: "output.structure",
    label: "Export",
    config: {
      fileName: `${(profile.measureCol || "data").replace(/[^\w\-]+/g, "-").toLowerCase()}-export.csv`,
      selectedColumns: table.columns.slice(0, 12),
    },
  });

  const title =
    archetype === "timeseries"
      ? `Forecast path · ${profile.measureCol}`
      : archetype === "categorical"
        ? `Breakdown · ${profile.categoryCol}`
        : `Analyse · ${table.columns.length} columns`;

  return { archetype, title, rationale, steps };
}

export type IngestSeed = {
  fileId?: string;
  fileName?: string;
  table?: TabularData;
  sheetNames?: string[];
  excelSheet?: string | null;
  excelRange?: string;
  piiFindings?: unknown[];
  datasetName?: string;
};

/** Turn a plan into a saved FlowGraph with seeded configs + aligned layout. */
export function materializeAutoPipelineGraph(
  plan: AutoPipelinePlan,
  ingestSeed?: IngestSeed,
): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  let prevId: string | null = null;
  let prevTable = ingestSeed?.table;

  plan.steps.forEach((step) => {
    const def = getBlock(step.type);
    const id = uid("n");
    let config: Record<string, unknown> = {
      ...(def?.defaultConfig ?? {}),
      ...(step.config ?? {}),
    };

    if (step.type === "ingest.csv_excel" && ingestSeed) {
      config = {
        ...config,
        fileId: ingestSeed.fileId ?? null,
        fileName: ingestSeed.fileName ?? "",
        table: ingestSeed.table,
        sheetNames: ingestSeed.sheetNames ?? [],
        excelSheet: ingestSeed.excelSheet ?? null,
        excelRange: ingestSeed.excelRange ?? "",
        piiFindings: ingestSeed.piiFindings ?? [],
        piiAcknowledged: !(ingestSeed.piiFindings as unknown[] | undefined)?.length,
        _sourceColumns: ingestSeed.table?.columns ?? [],
        _previewSample: false,
        datasetName:
          ingestSeed.datasetName ||
          (ingestSeed.fileName
            ? String(ingestSeed.fileName).replace(/\.[^.]+$/, "")
            : "Dataset"),
      };
      prevTable = ingestSeed.table;
    }

    // Seed Clean/Map with explicit casts (date / currency / number / …)
    if (step.type === "transform.clean_map" && prevTable?.columns?.length) {
      const suggested = suggestCleanMapConfig(prevTable);
      config = {
        ...config,
        columnMap: suggested.columnMap,
        dropColumns: suggested.dropColumns,
        transforms: suggested.transforms,
        _columnFormats: suggested._columnFormats,
        _sourceColumns: prevTable.columns,
        table: {
          columns: prevTable.columns,
          rows: prevTable.rows.slice(0, 40),
        },
        _previewSample: true,
        datasetName: config.datasetName || "Cleaned data",
      };
      const cleaned = applyTableTransforms(prevTable, {
        columnMap: suggested.columnMap,
        dropColumns: suggested.dropColumns,
        transforms: suggested.transforms,
      });
      prevTable = {
        columns: cleaned.columns,
        rows: cleaned.rows as TabularData["rows"],
      };
    }

    // Seed chart/forecast/aggregate from upstream (post-clean when available)
    if (prevTable?.columns?.length) {
      if (step.type === "analyse.chart" && !step.config?.chartType) {
        config = { ...config, ...chartConfig(prevTable) };
      }
      if (step.type === "analyse.projection" && !step.config?.column) {
        config = { ...config, ...forecastConfig(profileTable(prevTable)) };
      }
      if (step.type === "transform.aggregate" && !step.config?.groupBy) {
        config = { ...config, ...aggregateConfig(profileTable(prevTable)) };
      }
      if (
        step.type !== "ingest.csv_excel" &&
        step.type !== "ai.structure" &&
        step.type !== "transform.clean_map" &&
        !config.table
      ) {
        config = {
          ...config,
          table: {
            columns: prevTable.columns,
            rows: prevTable.rows.slice(0, 40),
          },
          _sourceColumns: prevTable.columns,
          _previewSample: true,
        };
      }
    }

    if (step.type.startsWith("ai.") && config.aiOptIn == null) {
      config.aiOptIn = true;
    }

    nodes.push({
      id,
      type: step.type,
      x: 0,
      y: 0,
      config: {
        ...config,
        ...(step.label ? { datasetName: config.datasetName ?? step.label } : {}),
      },
    });

    if (prevId) {
      edges.push({
        id: uid("e"),
        source: prevId,
        sourcePort: "table",
        target: id,
        targetPort: "table",
      });
    }
    prevId = id;
  });

  return alignFlowGraph({ nodes, edges });
}

export function suggestFlowName(plan: AutoPipelinePlan, fileName?: string): string {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, "").trim();
    if (base) return `${base} · auto analysis`;
  }
  return plan.title.slice(0, 80);
}
