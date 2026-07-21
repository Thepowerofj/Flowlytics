import type { TabularData } from "@/modules/blocks/domain/types";

/** Download a table as CSV via the export API (auth-required). */
export async function downloadTableCsv(
  table: TabularData,
  fileName = "flowlytics-export.csv",
): Promise<void> {
  const safeName = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  const res = await fetch("/api/export/csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns: table.columns,
      rows: table.rows,
      fileName: safeName,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Shape a table to selected columns (Structure Output preview / download). */
export function projectColumns(
  table: TabularData,
  selectedColumns: string[],
): TabularData {
  const columns =
    selectedColumns.length > 0
      ? selectedColumns.filter((c) => table.columns.includes(c))
      : [...table.columns];
  const rows = table.rows.map((row) => {
    const next: Record<string, string | number | null> = {};
    for (const c of columns) next[c] = row[c] ?? null;
    return next;
  });
  return { columns, rows };
}
