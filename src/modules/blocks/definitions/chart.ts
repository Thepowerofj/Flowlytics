import { buildChartSpec } from "@/modules/analyse/domain/charts";
import type { ColumnDisplayFormat } from "@/modules/ingest/domain/columnFormat";
import type { BlockDefinition, TabularData } from "../domain/types";
import { chartMeta } from "../catalog";

export const chartBlock: BlockDefinition = {
  ...chartMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Chart requires a table input");
    const columnFormats = config._columnFormats as
      | Record<string, ColumnDisplayFormat>
      | undefined;
    const chart = buildChartSpec(table, {
      chartType: config.chartType as "bar" | "line" | "pie" | undefined,
      xColumn: (config.xColumn as string) || undefined,
      yColumn: (config.yColumn as string) || undefined,
      suggestionId: (config.suggestionId as string) || undefined,
      columnFormats,
    });
    return {
      table,
      chart,
      insights: chart.insights,
      explanation: chart.insights?.length
        ? chart.insights.map((l) => `• ${l}`).join("\n")
        : undefined,
    };
  },
};
