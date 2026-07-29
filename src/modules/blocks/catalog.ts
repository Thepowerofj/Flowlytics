import type { BlockMeta, TabularData } from "./domain/types";

/**
 * Client-safe block catalog (metadata + defaultConfig only).
 * Do not import `./registry` or `./definitions/*` from client code — those pull Node-only runtimes.
 */

export const ingestCsvExcelMeta: BlockMeta = {
  type: "ingest.csv_excel",
  label: "Ingest CSV / Excel",
  description: "Load a tabular file into the flow",
  category: "ingest",
  inputs: [],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    fileName: "",
    table: null as TabularData | null,
    piiFindings: [],
    piiAcknowledged: false,
  },
};

export const ingestUrlMeta: BlockMeta = {
  type: "ingest.url",
  label: "URL file",
  description: "Pull a CSV or Excel file from an HTTPS URL each run",
  category: "ingest",
  inputs: [],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    url: "",
    datasetName: "URL dataset",
  },
};

export const cleanMapMeta: BlockMeta = {
  type: "transform.clean_map",
  label: "Clean / Map Columns",
  description: "Rename, clean, convert types, and format fields",
  category: "transform",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    columnMap: {},
    dropColumns: [],
    transforms: {},
  },
};

export const aggregateMeta: BlockMeta = {
  type: "transform.aggregate",
  label: "Aggregate",
  description: "Group by columns and sum / average / count values for charts and exports",
  category: "transform",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Aggregated table", dataType: "table" }],
  defaultConfig: {
    groupBy: [],
    metrics: [{ column: "", op: "sum", as: "" }],
  },
};

export const statsMeta: BlockMeta = {
  type: "analyse.stats",
  label: "Stats Summary",
  description: "Numeric and categorical summaries with business highlights",
  category: "analyse",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "stats", label: "Stats", dataType: "any" },
  ],
  defaultConfig: {},
};

export const chartMeta: BlockMeta = {
  type: "analyse.chart",
  label: "Chart",
  description: "Visualise the table with bar, line, or pie",
  category: "analyse",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "chart", label: "Chart", dataType: "any" },
  ],
  defaultConfig: {
    chartType: "bar",
    xColumn: "",
    yColumn: "",
    suggestionId: "",
  },
};

export const structureOutputMeta: BlockMeta = {
  type: "output.structure",
  label: "Structure Output",
  description: "Choose and order output columns for export",
  category: "output",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    selectedColumns: [],
    fileName: "flowlytics-export.csv",
  },
};

export const outputEmailMeta: BlockMeta = {
  type: "output.email",
  label: "Email results",
  description: "Send a summary email (and optional CSV snippet) via SMTP",
  category: "output",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    to: "",
    subject: "Flowlytics results",
    includeSampleRows: true,
  },
};

export const outputPresentationMeta: BlockMeta = {
  type: "output.presentation",
  label: "Presentation pack",
  description: "Prepare PDF / PowerPoint export from this run’s insights",
  category: "output",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    deckTitle: "",
  },
};

export const aiStructureMeta: BlockMeta = {
  type: "ai.structure",
  label: "AI Structure Data",
  description:
    "Turn messy upstream data or notes into a named table (opt-in, your API key)",
  category: "ai",
  requiresAiOptIn: true,
  inputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "text", label: "Text", dataType: "text" },
  ],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    aiOptIn: false,
    rawText: "",
    lockSchema: false,
    outputColumns: [],
    instructions: "",
    datasetName: "",
  },
};

export const aiExplainMeta: BlockMeta = {
  type: "ai.explain",
  label: "AI Explain Results",
  description:
    "Structured natural-language explanation of the table (opt-in, your API key)",
  category: "ai",
  requiresAiOptIn: true,
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Insights table", dataType: "table" },
    { id: "explanation", label: "Explanation", dataType: "text" },
    { id: "insightReport", label: "Report", dataType: "any" },
  ],
  defaultConfig: { aiOptIn: false, datasetName: "" },
};

export const aiAnalyseMeta: BlockMeta = {
  type: "ai.analyse",
  label: "AI Analyse",
  description:
    "Structured business insights from your table (opt-in, your API key)",
  category: "ai",
  requiresAiOptIn: true,
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Insights table", dataType: "table" },
    { id: "explanation", label: "Insights", dataType: "text" },
    { id: "insightReport", label: "Report", dataType: "any" },
  ],
  defaultConfig: {
    aiOptIn: false,
    datasetName: "",
    userQuestion: "",
    answerStyle: "exec",
  },
};

export const aiChartMeta: BlockMeta = {
  type: "ai.chart",
  label: "AI Chart Suggest",
  description: "Suggest the best chart type and axes (opt-in, your API key)",
  category: "ai",
  requiresAiOptIn: true,
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "explanation", label: "Suggestion", dataType: "text" },
    { id: "chart", label: "Chart", dataType: "any" },
  ],
  defaultConfig: { aiOptIn: false, datasetName: "" },
};

export const projectionMeta: BlockMeta = {
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
    groupColumn: "",
    periods: 3,
    futureMode: "count",
    untilDate: "",
    customFutureDates: "",
    method: "trend",
    window: 3,
    seasonLength: 12,
    alpha: 0.3,
    confidenceBand: true,
    periodOrder: "auto",
    compareMethods: [],
    outputShape: "long",
    excludePartialLastPeriod: true,
    goalPrompt: "",
  },
};

const metas: BlockMeta[] = [
  ingestCsvExcelMeta,
  ingestUrlMeta,
  cleanMapMeta,
  aggregateMeta,
  statsMeta,
  chartMeta,
  structureOutputMeta,
  outputEmailMeta,
  outputPresentationMeta,
  aiStructureMeta,
  aiExplainMeta,
  aiAnalyseMeta,
  aiChartMeta,
  projectionMeta,
];

const byType = new Map(metas.map((m) => [m.type, m]));

export function listBlockMetas(): BlockMeta[] {
  return metas;
}

export function getBlockMeta(type: string): BlockMeta {
  const meta = byType.get(type);
  if (!meta) throw new Error(`Unknown block type: ${type}`);
  return meta;
}

/** Soft lookup for UI (unknown types show the raw type string). */
export function blockLabel(type: string): string {
  return byType.get(type)?.label ?? type;
}

export function listBlockSummaries() {
  return metas.map(({ type, label, description, category, requiresAiOptIn }) => ({
    type,
    label,
    description,
    category,
    requiresAiOptIn: Boolean(requiresAiOptIn),
  }));
}
