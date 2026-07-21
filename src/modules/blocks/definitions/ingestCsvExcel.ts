import type { BlockDefinition, TabularData } from "../domain/types";

export const ingestCsvExcelBlock: BlockDefinition = {
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
  async run(config) {
    const table = config.table as TabularData | null;
    if (!table?.columns?.length) {
      throw new Error("No ingested table. Upload a CSV or Excel file first.");
    }
    if ((config.piiFindings as unknown[])?.length && !config.piiAcknowledged) {
      throw new Error("Acknowledge the personal-data warning before running.");
    }
    return { table };
  },
};
