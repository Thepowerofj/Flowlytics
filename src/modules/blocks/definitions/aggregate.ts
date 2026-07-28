import {
  aggregateTable,
  type AggregateMetric,
} from "@/modules/analyse/domain/aggregate";
import { profileDataset } from "@/modules/analyse/domain/dataProfile";
import type { BlockDefinition, TabularData } from "../domain/types";
import { aggregateMeta } from "../catalog";

export const aggregateBlock: BlockDefinition = {
  ...aggregateMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Aggregate requires a table input");
    const groupBy = (config.groupBy as string[]) ?? [];
    const metrics = (config.metrics as AggregateMetric[]) ?? [];
    if (!groupBy.length && !metrics.some((m) => m.op === "count" || m.column)) {
      throw new Error("Choose at least one group-by column or metric.");
    }
    const aggregated = aggregateTable(table, { groupBy, metrics });
    if (!aggregated.columns.length) {
      throw new Error("Aggregation produced no columns — check your settings.");
    }
    const primaryMeasure =
      typeof config._primaryMeasure === "string"
        ? config._primaryMeasure
        : metrics.find((m) => m.column)?.column;
    const grain =
      typeof config._analyticalGrain === "string"
        ? config._analyticalGrain
        : groupBy.length
          ? groupBy.join(", ")
          : "record";
    const qualityProfile = profileDataset(aggregated, {
      measureColumn: primaryMeasure,
    });
    return {
      table: aggregated,
      qualityProfile,
      contract: {
        version: 1,
        kind: "table",
        rowCount: aggregated.rows.length,
        columns: aggregated.columns,
        grain,
        primaryMeasure,
        sourceRowCount: table.rows.length,
        transformations: [
          {
            type: "aggregate",
            groupBy,
            metrics,
          },
        ],
        warnings: qualityProfile.warnings,
      },
    };
  },
};
