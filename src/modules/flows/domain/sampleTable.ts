import type { TabularData } from "@/modules/blocks/domain/types";
import { columnLooksLikeDate } from "@/modules/analyse/domain/stats";

/**
 * Truncate a table for planning / LLM — first N rows is fine (profile still works).
 */
export function sampleTable(table: TabularData, maxRows: number): TabularData {
  if (table.rows.length <= maxRows) return table;
  return {
    columns: table.columns,
    rows: table.rows.slice(0, maxRows),
  };
}

/**
 * Graph seeds must preserve period diversity when a date/period column exists.
 * Taking only the first N rows of transactional Excel extracts often yields a
 * single month — Aggregate then has one period and Forecast/canvas previews break.
 */
export function stratifiedGraphSample(
  table: TabularData,
  maxRows: number,
): TabularData {
  if (table.rows.length <= maxRows) return table;

  const periodCol =
    table.columns.find((c) => columnLooksLikeDate(table, c)) ?? null;
  if (!periodCol) {
    return sampleTable(table, maxRows);
  }

  const byPeriod = new Map<string, TabularData["rows"]>();
  for (const row of table.rows) {
    if (!row || typeof row !== "object") continue;
    const key = String(row[periodCol] ?? "");
    let list = byPeriod.get(key);
    if (!list) {
      list = [];
      byPeriod.set(key, list);
    }
    list.push(row);
  }

  const periods = [...byPeriod.keys()];
  if (periods.length <= 1) {
    return sampleTable(table, maxRows);
  }

  const out: TabularData["rows"] = [];
  let round = 0;
  while (out.length < maxRows) {
    let added = false;
    for (const p of periods) {
      const list = byPeriod.get(p);
      if (!list || round >= list.length) continue;
      out.push(list[round]!);
      added = true;
      if (out.length >= maxRows) break;
    }
    if (!added) break;
    round += 1;
  }

  return { columns: table.columns, rows: out };
}
