import {
  aggregateTable,
  type AggregateMetric,
  type AggregateOp,
} from "@/modules/analyse/domain/aggregate";
import type { BlockDefinition, TabularData } from "../domain/types";

export const aggregateBlock: BlockDefinition = {
  type: "transform.aggregate",
  label: "Aggregate",
  description: "Group by columns and sum / average / count values for charts and exports",
  category: "transform",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Aggregated table", dataType: "table" }],
  defaultConfig: {
    groupBy: [] as string[],
    metrics: [
      { column: "", op: "sum" as AggregateOp, as: "" },
    ] as AggregateMetric[],
  },
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
    return { table: aggregated };
  },
};
