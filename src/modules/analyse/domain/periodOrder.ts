import { parseDate } from "@/modules/ingest/domain/columnTransform";
import { toNumeric } from "./stats";

export type PeriodOrder =
  | "as_is"
  | "date_asc"
  | "date_desc"
  | "label_asc"
  | "value_asc"
  | "value_desc"
  | "auto";

export const PERIOD_ORDER_OPTIONS: {
  id: PeriodOrder;
  label: string;
  hint: string;
}[] = [
  {
    id: "auto",
    label: "Auto (dates first → oldest first)",
    hint: "If periods look like dates, sort chronologically; otherwise keep row order",
  },
  {
    id: "as_is",
    label: "Keep row order",
    hint: "Use the table order as uploaded (risky if dates are shuffled)",
  },
  {
    id: "date_asc",
    label: "Date ascending",
    hint: "Oldest period first — required for correct forecasts",
  },
  {
    id: "date_desc",
    label: "Date descending",
    hint: "Newest period first (then reversed for forecasting)",
  },
  {
    id: "label_asc",
    label: "Label A→Z",
    hint: "Sort period labels alphabetically",
  },
  {
    id: "value_asc",
    label: "Value low→high",
    hint: "Sort by measure value ascending (not chronological)",
  },
  {
    id: "value_desc",
    label: "Value high→low",
    hint: "Sort by measure value descending (not chronological)",
  },
];

export type HistoryPoint = { label: string; value: number; rowIndex: number };

function dateMs(label: string): number | null {
  const iso = parseDate(label, "auto");
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).getTime();
}

/** True when most labels parse as dates. */
export function periodsLookLikeDates(labels: string[]): boolean {
  if (!labels.length) return false;
  let ok = 0;
  for (const l of labels) {
    if (dateMs(l) != null) ok += 1;
  }
  return ok / labels.length >= 0.6;
}

/** Whether current row order already matches chronological ascending. */
export function isChronologicallySorted(labels: string[]): boolean {
  if (!periodsLookLikeDates(labels) || labels.length < 2) return true;
  let prev = -Infinity;
  for (const l of labels) {
    const ms = dateMs(l);
    if (ms == null) continue;
    if (ms < prev) return false;
    prev = ms;
  }
  return true;
}

export function resolvePeriodOrder(
  order: PeriodOrder | string | undefined,
  labels: string[],
): Exclude<PeriodOrder, "auto"> {
  const o = (order as PeriodOrder) || "auto";
  if (o !== "auto") return o;
  return periodsLookLikeDates(labels) ? "date_asc" : "as_is";
}

/**
 * Sort history points for forecasting. `date_desc` is flipped to ascending
 * after sort so the series still runs oldest→newest into the model.
 */
export function orderHistoryPoints(
  points: HistoryPoint[],
  order: PeriodOrder | string | undefined,
): { ordered: HistoryPoint[]; applied: Exclude<PeriodOrder, "auto">; reordered: boolean } {
  const labels = points.map((p) => p.label);
  const applied = resolvePeriodOrder(order, labels);
  if (applied === "as_is" || points.length < 2) {
    return { ordered: points, applied, reordered: false };
  }

  const copy = [...points];
  const cmp = (a: HistoryPoint, b: HistoryPoint): number => {
    switch (applied) {
      case "date_asc":
      case "date_desc": {
        const am = dateMs(a.label);
        const bm = dateMs(b.label);
        if (am != null && bm != null) return am - bm;
        if (am != null) return -1;
        if (bm != null) return 1;
        return a.label.localeCompare(b.label);
      }
      case "label_asc":
        return a.label.localeCompare(b.label);
      case "value_asc":
        return a.value - b.value;
      case "value_desc":
        return b.value - a.value;
      default:
        return 0;
    }
  };
  copy.sort(cmp);
  if (applied === "date_desc") copy.reverse();

  const reordered = copy.some((p, i) => p.rowIndex !== points[i]?.rowIndex);
  return { ordered: copy, applied, reordered };
}

/** Chronological compare for chart axis keys (ISO dates preferred). */
export function comparePeriodKeys(a: string, b: string): number {
  const am = dateMs(a);
  const bm = dateMs(b);
  if (am != null && bm != null) return am - bm;
  return a.localeCompare(b);
}

export function extractHistoryPoints(
  rows: Record<string, unknown>[],
  valueColumn: string,
  periodColumn: string,
): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  rows.forEach((row, i) => {
    const n = toNumeric(row[valueColumn]);
    if (n == null) return;
    const label =
      periodColumn && row[periodColumn] != null && row[periodColumn] !== ""
        ? String(row[periodColumn])
        : `Period ${i + 1}`;
    out.push({ label, value: n, rowIndex: i });
  });
  return out;
}
