import type { BlockDefinition, TabularData } from "../domain/types";
import { ingestCsvExcelMeta } from "../catalog";

export const ingestCsvExcelBlock: BlockDefinition = {
  ...ingestCsvExcelMeta,
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
