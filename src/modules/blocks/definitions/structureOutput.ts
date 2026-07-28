import type { BlockDefinition, TabularData } from "../domain/types";
import { structureOutputMeta } from "../catalog";

export const structureOutputBlock: BlockDefinition = {
  ...structureOutputMeta,
  async run(config, inputs) {
    const table = inputs.table as TabularData;
    if (!table) throw new Error("Structure Output requires a table input");
    const selected =
      (config.selectedColumns as string[])?.length > 0
        ? (config.selectedColumns as string[])
        : table.columns;
    const columns = selected.filter((c) => table.columns.includes(c));
    const rows = table.rows.map((row) => {
      const next: Record<string, string | number | null> = {};
      for (const c of columns) next[c] = row[c] ?? null;
      return next;
    });
    return {
      table: { columns, rows },
      contract: {
        version: 1,
        kind: "table",
        rowCount: rows.length,
        columns,
        grain:
          typeof config._analyticalGrain === "string"
            ? config._analyticalGrain
            : "record",
        primaryMeasure:
          typeof config._primaryMeasure === "string"
            ? config._primaryMeasure
            : undefined,
        sourceRowCount: table.rows.length,
        transformations: [
          {
            type: "select_columns",
            columns,
          },
        ],
        warnings:
          rows.length === table.rows.length
            ? []
            : ["Exported row count differs from source row count."],
      },
    };
  },
};
