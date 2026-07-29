"use client";

import {
  aggregateTable,
  defaultMetricAs,
  type AggregateMetric,
  type AggregateOp,
} from "@/modules/analyse/domain/aggregate";
import { numericColumns } from "@/modules/analyse/domain/stats";
import type { TabularData } from "@/modules/blocks/domain/types";
import {
  formatDisplayValue,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import { formatsForAggregate } from "./autoMap";
import { DatasetNameField } from "./DatasetNameField";

type Props = {
  columns: string[];
  /** Upstream *input* table only — never the aggregated output. */
  table: TabularData | null;
  groupBy: string[];
  metrics: AggregateMetric[];
  inputFormats?: Record<string, ColumnDisplayFormat>;
  datasetName?: string;
  onChange: (patch: Record<string, unknown>) => void;
};

const OPS: { value: AggregateOp; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count rows" },
  { value: "count_distinct", label: "Count distinct" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "pct_total", label: "% of total" },
];

export function AggregateConfig({
  columns,
  table,
  groupBy,
  metrics,
  inputFormats = {},
  datasetName = "",
  onChange,
}: Props) {
  const safeGroupBy = Array.isArray(groupBy)
    ? groupBy.filter((c): c is string => typeof c === "string")
    : [];
  const inputColumns = (Array.isArray(columns) ? columns : []).filter((c) =>
    table && Array.isArray(table.columns) ? table.columns.includes(c) : true,
  );
  const numeric = table ? numericColumns(table) : inputColumns;
  const safeMetrics =
    Array.isArray(metrics) && metrics.length > 0
      ? metrics
      : [{ column: numeric[0] ?? "", op: "sum" as const, as: "" }];

  function emit(patch: { groupBy?: string[]; metrics?: AggregateMetric[] }) {
    const nextGroup = patch.groupBy ?? safeGroupBy;
    const nextMetrics = patch.metrics ?? safeMetrics;
    onChange({
      ...patch,
      _columnFormats: formatsForAggregate(inputFormats, nextGroup, nextMetrics),
    });
  }

  function setGroupBy(next: string[]) {
    emit({ groupBy: next });
  }

  function patchMetric(index: number, patch: Partial<AggregateMetric>) {
    const next = safeMetrics.map((m, i) => (i === index ? { ...m, ...patch } : m));
    emit({ metrics: next });
  }

  function addMetric() {
    emit({
      metrics: [
        ...safeMetrics,
        { column: numeric[0] ?? inputColumns[0] ?? "", op: "sum", as: "" },
      ],
    });
  }

  function removeMetric(index: number) {
    if (safeMetrics.length <= 1) return;
    emit({ metrics: safeMetrics.filter((_, i) => i !== index) });
  }

  if (!inputColumns.length) {
    return (
      <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
        Connect upstream data first (usually after Clean/Map). Then choose group-by and
        metrics — the aggregated table feeds charts and exports.
      </p>
    );
  }

  const previewCols = [
    ...safeGroupBy,
    ...safeMetrics.map((m) => m.as?.trim() || defaultMetricAs(m.op, m.column)),
  ];

  // Read-only result preview — computed from input table, never used as picker source
  let resultPreview: TabularData | null = null;
  try {
    resultPreview =
      table && (safeGroupBy.length || safeMetrics.length)
        ? aggregateTable(table, { groupBy: safeGroupBy, metrics: safeMetrics })
        : null;
  } catch {
    resultPreview = null;
  }
  const outFormats = formatsForAggregate(inputFormats, safeGroupBy, safeMetrics);

  return (
    <div className="space-y-5">
      <DatasetNameField
        value={datasetName}
        placeholder="e.g. Sales by region"
        onChange={(next) => onChange({ datasetName: next })}
      />
      <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
        Build a summary table (e.g. Region → sum of Sales). Group-by and metric columns are
        chosen from the <strong className="text-ink">upstream input</strong> only — the
        preview below is the result, not a source for pickers.
      </p>

      <section>
        <h3 className="text-sm font-semibold">Group by</h3>
        <p className="mt-0.5 text-xs text-muted">
          Categories to keep as rows (select one or more).
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {inputColumns.map((col) => {
            const checked = safeGroupBy.includes(col);
            return (
              <label
                key={col}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  checked
                    ? "border-accent bg-accent-soft/40 text-ink"
                    : "border-border bg-white text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) setGroupBy([...safeGroupBy, col]);
                    else setGroupBy(safeGroupBy.filter((c) => c !== col));
                  }}
                />
                {col}
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Metrics</h3>
            <p className="mt-0.5 text-xs text-muted">
              Values to calculate per group.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-secondary" onClick={addMetric}>
            Add metric
          </button>
        </div>

        {safeMetrics.map((m, index) => {
          const needsColumn = m.op !== "count";
          const columnOptional = m.op === "pct_total";
          return (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <label className="block text-[11px] text-muted">
                Operation
                <select
                  className="input mt-1 py-1.5 text-sm text-ink"
                  value={m.op}
                  onChange={(e) =>
                    patchMetric(index, { op: e.target.value as AggregateOp })
                  }
                >
                  {OPS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-muted">
                Column
                <select
                  className="input mt-1 py-1.5 text-sm text-ink"
                  value={m.column}
                  disabled={m.op === "count"}
                  onChange={(e) => patchMetric(index, { column: e.target.value })}
                >
                  {m.op === "count" ? (
                    <option value="">All rows</option>
                  ) : (
                    <>
                      {columnOptional ? (
                        <option value="">Row count share</option>
                      ) : (
                        <option value="">Select…</option>
                      )}
                      {(m.op === "count_distinct"
                        ? inputColumns
                        : numeric.length
                          ? numeric
                          : inputColumns
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      {needsColumn &&
                      m.op !== "count_distinct" &&
                      numeric.length
                        ? inputColumns
                            .filter((c) => !numeric.includes(c))
                            .map((c) => (
                              <option key={c} value={c}>
                                {c} (text)
                              </option>
                            ))
                        : null}
                    </>
                  )}
                </select>
              </label>
              <label className="block text-[11px] text-muted">
                Output name
                <input
                  className="input mt-1 py-1.5 text-sm text-ink"
                  value={m.as ?? ""}
                  placeholder={defaultMetricAs(m.op, m.column)}
                  onChange={(e) => patchMetric(index, { as: e.target.value })}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost text-danger"
                  disabled={safeMetrics.length <= 1}
                  onClick={() => removeMetric(index)}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-border bg-bg/60 px-3 py-2.5">
        <h3 className="text-xs font-semibold text-ink">Output columns for downstream</h3>
        <p className="mt-1.5 text-xs font-medium text-accent-deep">
          {previewCols.filter(Boolean).join(" · ") || "—"}
        </p>
      </section>

      {resultPreview && resultPreview.rows.length > 0 ? (
        <section className="rounded-xl border border-border bg-white p-3">
          <h3 className="text-sm font-semibold">Result preview</h3>
          <p className="mt-0.5 text-[11px] text-muted">
            Sample of the aggregated table (read-only). Run for the full dataset.
          </p>
          <div className="mt-2 max-h-40 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  {resultPreview.columns.map((c) => (
                    <th key={c} className="px-1.5 py-1 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultPreview.rows.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {resultPreview.columns.map((c) => (
                      <td key={c} className="px-1.5 py-1 text-ink">
                        {formatDisplayValue(row[c], outFormats[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
