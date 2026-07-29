import { suggestCharts } from "@/modules/analyse/domain/charts";
import { aggregateTable } from "@/modules/analyse/domain/aggregate";
import {
  profileDataset,
  type DatasetQualityProfile,
} from "@/modules/analyse/domain/dataProfile";
import {
  columnLooksLikeDate,
  guessPeriodColumn,
  numericColumns,
  pickForecastMeasure,
} from "@/modules/analyse/domain/stats";
import type { FlowEdge, FlowGraph, FlowNode, TabularData } from "@/modules/blocks/domain/types";
import { blockLabel, getBlockMeta } from "@/modules/blocks/catalog";
import { applyTableTransforms } from "@/modules/ingest/domain/columnTransform";
import { suggestCleanMapConfig } from "@/modules/ingest/domain/suggestCleanMap";
import { alignFlowGraph } from "./flowLayout";
import {
  finalizeAutoPipelineGraph,
  healHintFromFlowIssues,
  repairAutoPipelineGraph,
} from "./pipelineRepair";
import type { FlowIssue } from "./flowChecks";

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
  quality: DatasetQualityProfile;
};

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function profileTable(table: TabularData, goal?: string): DataProfile {
  const numericCols = numericColumns(table);
  const dateCols = table.columns.filter((c) => columnLooksLikeDate(table, c));
  const categoricalCols = table.columns.filter(
    (c) => !numericCols.includes(c) && !dateCols.includes(c),
  );
  // Low-cardinality numerics that behave like coded segments (scenario=60/90)
  const codedDims = numericCols.filter((c) => {
    if (dateCols.includes(c)) return false;
    if (MEASURE_LIKE_RE.test(c)) return false;
    const vals = new Set(
      table.rows
        .map((r) => r[c])
        .filter((v) => v != null && v !== "")
        .map((v) => String(v)),
    );
    return vals.size >= 2 && vals.size <= 24 && vals.size < table.rows.length * 0.5;
  });
  const cutPool = [...categoricalCols, ...codedDims].filter(
    (c) => !/^(id|_id)$/i.test(c) && !/Id$/.test(c),
  );
  const measureCol = pickForecastMeasure(table, goal) || "";
  const periodCol = guessPeriodColumn(table, measureCol) || dateCols[0] || "";
  const g = (goal ?? "").toLowerCase();
  const mentionedCut = cutPool.find((c) => g.includes(c.toLowerCase()));
  const preferredCut = cutPool.find((c) =>
    /scenario|region|store|channel|segment|brand|product|category|member/i.test(
      c,
    ),
  );
  const categoryCol =
    mentionedCut ||
    preferredCut ||
    cutPool.find((c) => !/id$/i.test(c)) ||
    cutPool[0] ||
    "";
  const quality = profileDataset(table, {
    periodColumn: periodCol,
    measureColumn: measureCol,
    categoryColumn: categoryCol,
  });
  return {
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    numericCols,
    dateCols,
    categoricalCols: cutPool.length ? cutPool : categoricalCols,
    measureCol,
    periodCol,
    categoryCol,
    quality,
  };
}

const MEASURE_LIKE_RE =
  /(sales|revenue|amount|total|qty|quantity|units|volume|value|price|cost|profit|spend|missed|scripts?)/i;

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

function parseHorizonPeriods(goal: string): number | null {
  const m = goal.match(/(\d+)\s*(months?|periods?|weeks?|days?|quarters?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(36, Math.max(1, Math.round(n)));
}

function forecastConfig(
  profile: DataProfile,
  goal?: string,
  opts?: { groupColumn?: string },
): Record<string, unknown> {
  const periods = parseHorizonPeriods(goal ?? "") ?? 3;
  return {
    column: profile.measureCol,
    periodColumn: profile.periodCol,
    groupColumn: opts?.groupColumn || "",
    periods,
    method: "trend",
    confidenceBand: true,
    futureMode: "count",
    excludePartialLastPeriod: true,
    goalPrompt: (goal ?? "").trim().slice(0, 400),
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

function periodAggregateConfig(profile: DataProfile): Record<string, unknown> {
  if (!profile.periodCol) return {};
  return {
    groupBy: [profile.periodCol],
    metrics: profile.measureCol
      ? [
          {
            op: "sum",
            column: profile.measureCol,
            as: profile.measureCol,
          },
        ]
      : [{ op: "count", as: "Row count" }],
    datasetName: `By ${profile.periodCol}`,
    _analyticalGrain: "period",
    _primaryMeasure: profile.measureCol || "Row count",
  };
}

/** Aggregate by category + period for per-group forecasts (e.g. scenario × month). */
function periodGroupAggregateConfig(
  profile: DataProfile,
): Record<string, unknown> {
  if (!profile.periodCol || !profile.categoryCol) {
    return periodAggregateConfig(profile);
  }
  return {
    groupBy: [profile.categoryCol, profile.periodCol],
    metrics: profile.measureCol
      ? [
          {
            op: "sum",
            column: profile.measureCol,
            as: profile.measureCol,
          },
        ]
      : [{ op: "count", as: "Row count" }],
    datasetName: `By ${profile.categoryCol} · ${profile.periodCol}`,
    _analyticalGrain: "group_period",
    _primaryMeasure: profile.measureCol || "Row count",
  };
}

function wantsGroupedForecast(goal: string, profile: DataProfile): boolean {
  if (!profile.categoryCol || !profile.periodCol || !profile.measureCol) {
    return false;
  }
  const g = goal.toLowerCase();
  // Explicit cut language or the category column named in the goal
  if (
    /\b(by|per|each|every|across|split|breakdown)\b/i.test(g) ||
    new RegExp(
      `\\b${profile.categoryCol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    ).test(goal)
  ) {
    return true;
  }
  // Named business cuts in the goal
  if (/scenario|region|channel|segment|brand|product\b/i.test(g)) {
    return true;
  }
  return false;
}

/**
 * Decide a full analysis pipeline from structured table and/or messy notes.
 * Deterministic heuristics first (always works offline); AI blocks opt-in when requested.
 */
export type PipelinePlanHeal = {
  disableForecast?: boolean;
  disableAi?: boolean;
  disablePresentation?: boolean;
};

export function planAutoPipeline(input: {
  table?: TabularData | null;
  rawText?: string;
  /** Include AI Analyse (+ AI Structure for notes). Defaults true. */
  enableAi?: boolean;
  goal?: string;
  /** Prior pipeline step types (Ask follow-up) — used in rationale only. */
  priorSteps?: string[];
  /** Ask auto-heal: force a safer subset of steps after a failed run. */
  heal?: PipelinePlanHeal;
}): AutoPipelinePlan {
  const enableAi = input.heal?.disableAi ? false : input.enableAi !== false;
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

  const goalRaw = (input.goal ?? "").trim();
  const goal = goalRaw.toLowerCase();
  const profile = profileTable(table, goalRaw);
  const chart = chartConfig(table);

  const wantForecast =
    !input.heal?.disableForecast &&
    (/forecast|predict|outlook|trend|projection|next\s+\d+/i.test(goal) ||
      (profile.dateCols.length > 0 &&
        Boolean(profile.measureCol) &&
        profile.rowCount >= 3));
  const wantAggregate =
    !input.heal?.disableForecast &&
    (/by category|breakdown|segment|region|product|group by/i.test(goal) ||
      (Boolean(profile.categoryCol) &&
        Boolean(profile.measureCol) &&
        profile.dateCols.length === 0 &&
        !wantForecast));

  let archetype: PipelineArchetype = "mixed";
  let rationale = "Balanced path: clean → explore → visualise → export.";

  if (input.heal?.disableForecast) {
    rationale =
      "Auto-corrected path: explore with stats + chart (forecast skipped after a prior error).";
  }

  const groupForecast = wantsGroupedForecast(goalRaw, profile);

  if (wantForecast && profile.measureCol) {
    archetype = "timeseries";
    rationale = groupForecast
      ? `Forecasting **${profile.measureCol}** by **${profile.categoryCol}** over **${profile.periodCol || "periods"}**. Pipeline aggregates each group’s history, projects an outlook per group (excluding incomplete final periods), then writes insights.`
      : `Forecasting **${profile.measureCol}** over **${profile.periodCol || "periods"}** (not ID/key columns). Pipeline cleans${
          profile.quality.rowGrain === "transaction" ? ", aggregates duplicate periods," : ""
        } projects the orange forecast series (incomplete final periods excluded), then writes insights.`;
  } else if (wantForecast && !profile.measureCol) {
    archetype = "numeric";
    rationale =
      "A forecast was requested, but no suitable numeric measure was found (IDs like pharmacyId are ignored). Pipeline profiles and charts what is available — upload a value column such as Sales or Amount for forecasting.";
  } else if (wantAggregate && profile.categoryCol) {
    archetype = "categorical";
    rationale = `Detected categories (${profile.categoryCol}) with a measure (${profile.measureCol || "count"}). Pipeline aggregates, charts the ranking, then analyses.`;
  } else if (profile.measureCol && !profile.categoryCol) {
    archetype = "numeric";
    rationale = `Numeric focus on ${profile.measureCol}. Pipeline profiles stats, charts the series, then analyses.`;
  }

  if (input.priorSteps?.length) {
    rationale += ` Updating the connected pipeline (was: ${input.priorSteps
      .map((t) => blockLabel(t))
      .slice(0, 8)
      .join(" → ")}).`;
  }

  const steps: AutoPipelineStep[] = [
    { type: "ingest.csv_excel", label: "Ingest" },
    { type: "transform.clean_map", label: "Clean / Map" },
  ];

  if (archetype === "timeseries" && profile.quality.rowGrain === "transaction") {
    steps.push({
      type: "transform.aggregate",
      label: groupForecast ? "Aggregate by group · period" : "Aggregate by Period",
      config: groupForecast
        ? periodGroupAggregateConfig(profile)
        : periodAggregateConfig(profile),
    });
  } else if (archetype === "categorical") {
    steps.push({
      type: "transform.aggregate",
      label: "Aggregate",
      config: aggregateConfig(profile),
    });
  }

  steps.push({
    type: "analyse.stats",
    label: "Stats",
    config: {
      _primaryMeasure: profile.measureCol,
      _analyticalGrain:
        archetype === "timeseries"
          ? groupForecast
            ? "group_period"
            : "period"
          : archetype === "categorical"
            ? "category"
            : "record",
    },
  });

  // Timeseries: Forecast block owns the chart (teal history + orange forecast).
  // A separate Chart step would only show history and hide the orange series.
  if (archetype === "timeseries" && profile.measureCol) {
    steps.push({
      type: "analyse.projection",
      label: groupForecast ? "Forecast by group" : "Forecast",
      config: forecastConfig(profile, goalRaw, {
        groupColumn: groupForecast ? profile.categoryCol : "",
      }),
    });
  } else {
    steps.push({
      type: "analyse.chart",
      label: "Chart",
      config: chart,
    });
  }

  if (enableAi) {
    steps.push({
      type: "ai.analyse",
      label: "AI Analyse",
      config: { aiOptIn: true, datasetName: "Auto insights" },
    });
  }

  const wantDeck =
    !input.heal?.disablePresentation &&
    (/present|pptx?|powerpoint|pdf|deck|pack|executive|board|slide/i.test(
      goal,
    ) ||
      enableAi);

  if (wantDeck) {
    steps.push({
      type: "output.presentation",
      label: "Presentation",
      config: {
        deckTitle:
          archetype === "timeseries" && profile.measureCol
            ? `${profile.measureCol} outlook`
            : "Flowlytics insight pack",
      },
    });
  }

  steps.push({
    type: "output.structure",
    label: "Export",
    config: {
      fileName: `${(profile.measureCol || "data").replace(/[^\w\-]+/g, "-").toLowerCase()}-export.csv`,
      _primaryMeasure: profile.measureCol,
      _analyticalGrain:
        archetype === "timeseries"
          ? "period"
          : archetype === "categorical"
            ? "category"
            : "record",
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
  piiAcknowledged?: boolean;
  datasetName?: string;
};

/** Pull the uploaded table + file refs from an existing Ask/Builder graph. */
export function extractIngestSeedFromGraph(graph: FlowGraph): IngestSeed | null {
  const ingest = graph.nodes.find((n) => n.type === "ingest.csv_excel");
  if (!ingest) return null;
  const c = ingest.config ?? {};
  const table = c.table as TabularData | undefined;
  if (!table?.columns?.length && typeof c.fileId !== "string") return null;
  return {
    fileId: typeof c.fileId === "string" ? c.fileId : undefined,
    fileName: typeof c.fileName === "string" ? c.fileName : undefined,
    table: table?.columns?.length ? table : undefined,
    sheetNames: Array.isArray(c.sheetNames) ? (c.sheetNames as string[]) : undefined,
    excelSheet: (c.excelSheet as string | null | undefined) ?? null,
    excelRange: typeof c.excelRange === "string" ? c.excelRange : undefined,
    piiFindings: Array.isArray(c.piiFindings) ? c.piiFindings : undefined,
    piiAcknowledged: Boolean(c.piiAcknowledged),
    datasetName:
      typeof c.datasetName === "string" ? c.datasetName : undefined,
  };
}

export function graphStepTypes(graph: FlowGraph): string[] {
  return graph.nodes.map((n) => n.type);
}

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
    const def = getBlockMeta(step.type);
    const id = uid("n");
    let config: Record<string, unknown> = {
      ...(def.defaultConfig ?? {}),
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
        piiAcknowledged:
          ingestSeed.piiAcknowledged ??
          !(ingestSeed.piiFindings as unknown[] | undefined)?.length,
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

    // Always rebind column-dependent configs from the *current* upstream table.
    // Plan heuristics use the raw ingest profile; Clean/Aggregate can reshape
    // columns — stale x/y/measure/export lists become Builder errors.
    if (prevTable?.columns?.length) {
      if (step.type === "transform.aggregate") {
        const cols = new Set(prevTable.columns);
        const plannedGroup = Array.isArray(config.groupBy)
          ? (config.groupBy as string[]).filter((c) => cols.has(c))
          : [];
        const plannedMetrics = Array.isArray(config.metrics)
          ? (
              config.metrics as {
                op: string;
                column?: string;
                as?: string;
              }[]
            ).filter(
              (m) =>
                m.op === "count" ||
                !m.column ||
                cols.has(m.column),
            )
          : [];
        if (plannedGroup.length && plannedMetrics.length) {
          config = {
            ...config,
            groupBy: plannedGroup,
            metrics: plannedMetrics,
          };
        } else {
          const profile = profileTable(prevTable);
          const fresh =
            profile.periodCol && (step.label || "").toLowerCase().includes("period")
              ? periodAggregateConfig(profile)
              : aggregateConfig(profile);
          config = { ...config, ...fresh };
        }
      }

      if (step.type === "analyse.chart") {
        config = { ...config, ...chartConfig(prevTable) };
      }

      if (step.type === "analyse.projection") {
        const profile = profileTable(prevTable);
        const goalPrompt =
          typeof config.goalPrompt === "string"
            ? config.goalPrompt
            : typeof step.config?.goalPrompt === "string"
              ? (step.config.goalPrompt as string)
              : "";
        const plannedGroup =
          typeof config.groupColumn === "string" ? config.groupColumn : "";
        const groupColumn =
          plannedGroup && prevTable.columns.includes(plannedGroup)
            ? plannedGroup
            : wantsGroupedForecast(goalPrompt, profile)
              ? profile.categoryCol
              : "";
        const fresh = forecastConfig(profile, goalPrompt, { groupColumn });
        const keepColumn =
          typeof config.column === "string" &&
          prevTable.columns.includes(config.column)
            ? config.column
            : fresh.column;
        const keepPeriod =
          typeof config.periodColumn === "string" &&
          prevTable.columns.includes(config.periodColumn) &&
          config.periodColumn !== keepColumn
            ? config.periodColumn
            : fresh.periodColumn;
        config = {
          ...config,
          ...fresh,
          column: keepColumn,
          periodColumn: keepPeriod,
          groupColumn: groupColumn || "",
          periods: Number(config.periods ?? fresh.periods ?? 3),
          method: (config.method as string) || (fresh.method as string) || "trend",
          excludePartialLastPeriod: config.excludePartialLastPeriod !== false,
          goalPrompt: goalPrompt || (fresh.goalPrompt as string) || "",
        };
      }

      if (step.type === "output.structure") {
        const selected = Array.isArray(config.selectedColumns)
          ? (config.selectedColumns as string[]).filter((c) =>
              prevTable!.columns.includes(c),
            )
          : [];
        config = {
          ...config,
          selectedColumns: selected.length ? selected : [...prevTable.columns],
          fileName:
            (config.fileName as string) ||
            (step.config?.fileName as string) ||
            "flowlytics-export.csv",
        };
      }

      if (
        step.type !== "ingest.csv_excel" &&
        step.type !== "ai.structure" &&
        step.type !== "transform.clean_map"
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

    if (step.type === "transform.aggregate" && prevTable?.columns?.length) {
      const groupBy = Array.isArray(config.groupBy)
        ? (config.groupBy as string[])
        : [];
      const metrics =
        (config.metrics as
          | Parameters<typeof aggregateTable>[1]["metrics"]
          | undefined) ?? [];
      if (groupBy.length || metrics.length) {
        try {
          prevTable = aggregateTable(prevTable, { groupBy, metrics });
        } catch {
          // Keep the upstream preview if the aggregate config is incomplete.
        }
      }
    }

    if (step.type.startsWith("ai.")) {
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

  return finalizeAutoPipelineGraph(alignFlowGraph({ nodes, edges }));
}

/**
 * Plan → materialize → repair, then replan with heal hints while static errors remain.
 * Call this (instead of plan+materialize alone) before saving/showing a pipeline.
 */
export function buildValidatedAutoPipeline(input: {
  table?: TabularData | null;
  rawText?: string;
  enableAi?: boolean;
  goal?: string;
  priorSteps?: string[];
  seed?: IngestSeed;
  /** Seed heal flags before the first plan (runtime Ask heal). */
  heal?: PipelinePlanHeal;
  /** Max heal replans after the first materialize (default 2). */
  maxHealAttempts?: number;
}): {
  plan: AutoPipelinePlan;
  graph: FlowGraph;
  repairs: string[];
  remainingErrors: FlowIssue[];
} {
  const maxAttempts = Math.max(0, input.maxHealAttempts ?? 2);
  let heal: PipelinePlanHeal | undefined = input.heal;
  let plan = planAutoPipeline({
    table: input.table,
    rawText: input.rawText,
    enableAi: input.enableAi,
    goal: input.goal,
    priorSteps: input.priorSteps,
    heal,
  });
  let graph = materializeAutoPipelineGraph(plan, input.seed);
  let repaired = repairAutoPipelineGraph(graph);
  const allRepairs = [...repaired.repairs];

  for (
    let attempt = 0;
    attempt < maxAttempts && repaired.remainingErrors.length > 0;
    attempt++
  ) {
    const hint = healHintFromFlowIssues(repaired.remainingErrors);
    if (!hint) break;
    heal = {
      disableForecast: Boolean(heal?.disableForecast || hint.disableForecast),
      disableAi: Boolean(heal?.disableAi || hint.disableAi),
      disablePresentation: Boolean(
        heal?.disablePresentation || hint.disablePresentation,
      ),
    };
    allRepairs.push(hint.reason);
    plan = planAutoPipeline({
      table: input.table,
      rawText: input.rawText,
      enableAi: input.enableAi,
      goal: input.goal,
      priorSteps: input.priorSteps,
      heal,
    });
    graph = materializeAutoPipelineGraph(plan, input.seed);
    repaired = repairAutoPipelineGraph(graph);
    allRepairs.push(...repaired.repairs);
  }

  return {
    plan,
    graph: repaired.graph,
    repairs: allRepairs,
    remainingErrors: repaired.remainingErrors,
  };
}

export function suggestFlowName(plan: AutoPipelinePlan, fileName?: string): string {
  if (fileName) {
    const base = fileName.replace(/\.[^.]+$/, "").trim();
    if (base) return `${base} · auto analysis`;
  }
  return plan.title.slice(0, 80);
}
