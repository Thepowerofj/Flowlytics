import { businessInsightLines } from "@/modules/analyse/domain/insights";
import { profileDataset } from "@/modules/analyse/domain/dataProfile";
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
    const primaryMeasure =
      typeof config._primaryMeasure === "string" ? config._primaryMeasure : undefined;
    const analyticalGrain =
      typeof config._analyticalGrain === "string" ? config._analyticalGrain : undefined;
    const qualityProfile = profileDataset(table, { measureColumn: primaryMeasure });
    return {
      table,
      stats,
      insights,
      qualityProfile,
      contract: {
        version: 1,
        kind: "stats",
        rowCount: table.rows.length,
        columns: table.columns,
        grain: analyticalGrain ?? qualityProfile.rowGrain,
        primaryMeasure: primaryMeasure ?? qualityProfile.measureColumn,
        warnings: qualityProfile.warnings,
      },
      explanation: insights.map((l) => `• ${l}`).join("\n"),
    };
  },
};
