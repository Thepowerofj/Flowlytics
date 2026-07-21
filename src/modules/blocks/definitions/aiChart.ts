import { suggestCharts } from "@/modules/analyse/domain/charts";
import { parseLlmJson } from "@/modules/ai/domain/structuredOutput";
import type { BlockDefinition, TabularData } from "../domain/types";

export const aiChartBlock: BlockDefinition = {
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
  async run(config, inputs, ctx) {
    if (!config.aiOptIn) throw new Error("Enable AI opt-in on this block to run.");
    const table = inputs.table as TabularData;
    if (!table) throw new Error("AI Chart Suggest requires a table input");
    if (!ctx.callLlm) {
      throw new Error("AI runtime is not configured.");
    }
    if (ctx.hasLlmKey === false) {
      throw new Error("Add your LLM API key in Settings to use AI.");
    }

    const suggestions = suggestCharts(table);
    const first = suggestions[0];
    const schema = {
      columns: table.columns,
      suggestions: suggestions.slice(0, 4),
    };
    const prompt = `Pick the best chart for an SMB spreadsheet. Reply JSON only: {"chartType":"bar"|"line"|"pie","xColumn":string,"yColumn":string,"reason":string}. Prefer these candidates when sensible:\n${JSON.stringify(schema).slice(0, 3500)}`;

    let chartType = first?.type ?? "bar";
    let xColumn = first?.xColumn ?? table.columns[0] ?? "";
    let yColumn = first?.yColumn ?? "__count__";
    let reason =
      first?.reason ??
      "Use a bar chart to compare categories against a number.";

    try {
      const reply = await ctx.callLlm(prompt, { json: true });
      const json = parseLlmJson(reply) as {
        chartType?: string;
        xColumn?: string;
        yColumn?: string;
        reason?: string;
      };
      if (json.chartType === "bar" || json.chartType === "line" || json.chartType === "pie") {
        chartType = json.chartType;
      }
      if (json.xColumn && (table.columns.includes(json.xColumn) || json.xColumn === "__row__")) {
        xColumn = json.xColumn;
      }
      if (
        json.yColumn &&
        (table.columns.includes(json.yColumn) || json.yColumn === "__count__")
      ) {
        yColumn = json.yColumn;
      }
      if (json.reason) reason = json.reason;
    } catch (error) {
      if (ctx.hasLlmKey && !first) {
        throw error instanceof Error
          ? error
          : new Error("AI Chart Suggest failed talking to the model.");
      }
      /* keep heuristic suggestion when available */
    }

    const explanation = `Suggested ${chartType} chart: ${xColumn} vs ${yColumn}. ${reason} Wire a Chart activity next — axes are applied automatically when connected.`;

    const suggestedChart = { chartType, xColumn, yColumn, reason };

    return {
      table,
      explanation,
      chartSuggestion: suggestedChart,
      suggestedChart,
    };
  },
};
