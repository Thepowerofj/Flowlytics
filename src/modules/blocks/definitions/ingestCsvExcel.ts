import type { BlockDefinition, TabularData } from "../domain/types";
import { ingestCsvExcelMeta } from "../catalog";

export const ingestCsvExcelBlock: BlockDefinition = {
  ...ingestCsvExcelMeta,
  async run(config, _inputs, ctx) {
    let table = config.table as TabularData | null;
    const meta = table as {
      _compacted?: boolean;
      _rowCount?: number;
    } | null;
    const needsReload =
      Boolean(meta?._compacted) ||
      (typeof meta?._rowCount === "number" &&
        Array.isArray(table?.rows) &&
        meta._rowCount > table!.rows.length);
    const fileId =
      typeof config.fileId === "string" && config.fileId
        ? config.fileId
        : null;

    // Backup: reload full file when graph only kept a sample (stack-recovery path)
    if (fileId && ctx?.userId && (!table?.columns?.length || needsReload)) {
      try {
        const { loadUploadedTable } = await import(
          "@/modules/ingest/application/loadUploadedTable"
        );
        const loaded = await loadUploadedTable(ctx.userId, fileId, {
          sheet:
            typeof config.excelSheet === "string" ? config.excelSheet : null,
          range:
            typeof config.excelRange === "string" ? config.excelRange : null,
        });
        if (loaded?.table?.columns?.length) {
          table = loaded.table;
        }
      } catch {
        // fall through to inline table / error
      }
    }

    if (!table?.columns?.length) {
      throw new Error("No ingested table. Upload a CSV or Excel file first.");
    }
    if ((config.piiFindings as unknown[])?.length && !config.piiAcknowledged) {
      throw new Error("Acknowledge the personal-data warning before running.");
    }
    return { table };
  },
};
