import type { BlockDefinition, TabularData } from "../domain/types";

export const structureOutputBlock: BlockDefinition = {
  type: "output.structure",
  label: "Structure Output",
  description: "Choose and order output columns for export",
  category: "output",
  inputs: [{ id: "table", label: "Table", dataType: "table" }],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    selectedColumns: [] as string[],
    /** Suggested download filename (client uses this on export) */
    fileName: "flowlytics-export.csv",
  },
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
    return { table: { columns, rows } };
  },
};
