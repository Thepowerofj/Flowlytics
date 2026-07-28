import type { TabularData } from "@/modules/blocks/domain/types";
import { columnLooksLikeDate, numericColumns, toNumeric } from "./stats";

export type DatasetQualityProfile = {
  rowCount: number;
  columnCount: number;
  nullCells: number;
  nullPct: number;
  duplicateRows: number;
  duplicatePeriods: number;
  periodColumn?: string;
  measureColumn?: string;
  rowGrain: "period" | "transaction" | "category" | "record";
  warnings: string[];
  recommendedAggregation?: {
    grain: "period" | "category";
    groupBy: string[];
    measure?: string;
    op: "sum" | "count";
  };
};

export function profileDataset(
  table: TabularData,
  opts: { periodColumn?: string; measureColumn?: string; categoryColumn?: string } = {},
): DatasetQualityProfile {
  const rows = table.rows;
  const cells = Math.max(1, rows.length * Math.max(1, table.columns.length));
  let nullCells = 0;
  const seenRows = new Set<string>();
  let duplicateRows = 0;

  for (const row of rows) {
    const key = JSON.stringify(table.columns.map((c) => row[c] ?? null));
    if (seenRows.has(key)) duplicateRows += 1;
    seenRows.add(key);
    for (const col of table.columns) {
      const value = row[col];
      if (value == null || value === "") nullCells += 1;
    }
  }

  const numeric = numericColumns(table);
  const periodColumn =
    opts.periodColumn ||
    table.columns.find((c) => columnLooksLikeDate(table, c)) ||
    "";
  const measureColumn =
    opts.measureColumn && numeric.includes(opts.measureColumn)
      ? opts.measureColumn
      : numeric[0] || "";

  const periodCounts = new Map<string, number>();
  if (periodColumn) {
    for (const row of rows) {
      const key = String(row[periodColumn] ?? "").trim();
      if (!key) continue;
      periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
    }
  }
  const duplicatePeriods = [...periodCounts.values()].filter((n) => n > 1).length;

  const warnings: string[] = [];
  if (nullCells) warnings.push(`${nullCells} blank cell(s) detected.`);
  if (duplicateRows) warnings.push(`${duplicateRows} duplicate row(s) detected.`);
  if (duplicatePeriods && periodColumn) {
    warnings.push(
      `${duplicatePeriods} period label(s) have multiple rows and should be aggregated before forecasting.`,
    );
  }
  if (measureColumn) {
    const parsed = rows.filter((r) => toNumeric(r[measureColumn]) != null).length;
    if (parsed < rows.length) {
      warnings.push(
        `${rows.length - parsed} row(s) could not be parsed as ${measureColumn}.`,
      );
    }
  }

  const rowGrain =
    periodColumn && duplicatePeriods
      ? "transaction"
      : periodColumn
        ? "period"
        : opts.categoryColumn
          ? "category"
          : "record";

  return {
    rowCount: rows.length,
    columnCount: table.columns.length,
    nullCells,
    nullPct: nullCells / cells,
    duplicateRows,
    duplicatePeriods,
    periodColumn: periodColumn || undefined,
    measureColumn: measureColumn || undefined,
    rowGrain,
    warnings,
    recommendedAggregation:
      rowGrain === "transaction" && periodColumn
        ? {
            grain: "period",
            groupBy: [periodColumn],
            measure: measureColumn || undefined,
            op: measureColumn ? "sum" : "count",
          }
        : opts.categoryColumn && measureColumn
          ? {
              grain: "category",
              groupBy: [opts.categoryColumn],
              measure: measureColumn,
              op: "sum",
            }
          : undefined,
  };
}
