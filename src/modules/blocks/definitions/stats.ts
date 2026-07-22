import { businessInsightLines } from "@/modules/analyse/domain/insights";
import { computeStats } from "@/modules/analyse/domain/stats";
import type { ColumnDisplayFormat } from "@/modules/ingest/domain/columnFormat";
import type { BlockDefinition, TabularData } from "../domain/types";
import { statsMeta } from "../catalog";

export const statsBlock: BlockDefinition = {
  ...statsMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Stats requires a table input");
    const stats = computeStats(table);
    const formats = (config._columnFormats as
      | Record<string, ColumnDisplayFormat>
      | undefined) ?? {};
    const insights = businessInsightLines(table, formats, stats);
    return {
      table,
      stats,
      insights,
      explanation: insights.map((l) => `• ${l}`).join("\n"),
    };
  },
};
