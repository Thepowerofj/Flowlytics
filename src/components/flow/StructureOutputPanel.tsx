"use client";

import { useState } from "react";
import type { TabularData } from "@/modules/blocks/domain/types";
import {
  formatDisplayValue,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import { downloadTableCsv, projectColumns } from "./downloadCsv";

const EXAMPLE_HEADERS = ["Region", "Category", "Amount"];

type PreviewModel = {
  headers: string[];
  rows: Record<string, string | number | null>[];
  /** Real upstream/run data vs illustrative placeholder. */
  kind: "data" | "example";
  totalRows: number;
};

function exampleCell(header: string, rowIndex: number): string {
  const key = header.toLowerCase();
  if (key.includes("region") || key.includes("area") || key.includes("city")) {
    return ["North", "South", "East"][rowIndex] ?? `Region ${rowIndex + 1}`;
  }
  if (key.includes("categor") || key.includes("type") || key.includes("name")) {
    return ["Retail", "Online", "Wholesale"][rowIndex] ?? `Item ${rowIndex + 1}`;
  }
  if (
    key.includes("amount") ||
    key.includes("sales") ||
    key.includes("total") ||
    key.includes("price") ||
    key.includes("sum")
  ) {
    return String([1240, 890, 1560][rowIndex] ?? (rowIndex + 1) * 100);
  }
  if (key.includes("date") || key.includes("day")) {
    return ["2026-01-12", "2026-01-13", "2026-01-14"][rowIndex] ?? "2026-01-15";
  }
  return `Sample ${rowIndex + 1}`;
}

function buildPreview(
  columns: string[],
  selectedColumns: string[],
  table: TabularData | null,
  maxRows: number,
): PreviewModel {
  const headers =
    selectedColumns.length > 0
      ? selectedColumns.filter((c) => columns.includes(c) || table?.columns.includes(c))
      : columns.length > 0
        ? [...columns]
        : [...EXAMPLE_HEADERS];

  if (headers.length === 0) {
    return {
      headers: [...EXAMPLE_HEADERS],
      rows: EXAMPLE_HEADERS.map((_, rowIndex) =>
        Object.fromEntries(
          EXAMPLE_HEADERS.map((h) => [h, exampleCell(h, rowIndex)]),
        ),
      ),
      kind: "example",
      totalRows: 3,
    };
  }

  if (table?.rows.length) {
    const projected = projectColumns(table, headers);
    if (projected.columns.length) {
      return {
        headers: projected.columns,
        rows: projected.rows.slice(0, maxRows),
        kind: "data",
        totalRows: projected.rows.length,
      };
    }
  }

  const rows = [0, 1, 2].slice(0, maxRows).map((rowIndex) => {
    const row: Record<string, string | number | null> = {};
    for (const h of headers) row[h] = exampleCell(h, rowIndex);
    return row;
  });

  return {
    headers,
    rows,
    kind: "example",
    totalRows: rows.length,
  };
}

function cellDisplay(
  value: string | number | null | undefined,
  fmt?: ColumnDisplayFormat,
): string {
  if (value == null || value === "") return "—";
  if (fmt) return formatDisplayValue(value, fmt);
  return String(value);
}

function StructureCsvPreview({
  preview,
  fileName,
  compact,
  columnFormats,
  previewSample,
}: {
  preview: PreviewModel;
  fileName: string;
  compact?: boolean;
  columnFormats?: Record<string, ColumnDisplayFormat>;
  previewSample?: boolean;
}) {
  const more =
    preview.kind === "data" && preview.totalRows > preview.rows.length
      ? preview.totalRows - preview.rows.length
      : 0;

  return (
    <div
      className={`structure-preview ${compact ? "structure-preview--compact" : ""}`}
      aria-label="CSV export preview"
    >
      <div className="structure-preview__meta">
        <span className="structure-preview__file" title={fileName}>
          {fileName || "flowlytics-export.csv"}
        </span>
        <span
          className="structure-preview__badge"
          title={
            preview.kind === "data" && previewSample
              ? "Preview sample — click Run for the full dataset"
              : undefined
          }
        >
          {preview.kind === "data"
            ? previewSample
              ? "Sample"
              : "Your data"
            : "Example layout"}
        </span>
      </div>
      <div className="structure-preview__scroll">
        <table className="structure-preview__table">
          <thead>
            <tr>
              {preview.headers.map((h) => (
                <th key={h} title={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i}>
                {preview.headers.map((h) => {
                  const text = cellDisplay(row[h], columnFormats?.[h]);
                  return (
                    <td key={h} title={text}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="structure-preview__caption">
        {preview.kind === "data"
          ? more > 0
            ? `Preview · first ${preview.rows.length} of ${preview.totalRows} rows · column order as exported${
                previewSample ? " · Run for full dataset" : ""
              }`
            : `Preview · ${preview.totalRows} row${preview.totalRows === 1 ? "" : "s"} · column order as exported${
                previewSample ? " · Run for full dataset" : ""
              }`
          : columnsHint(preview.headers)}
      </p>
    </div>
  );
}

function columnsHint(headers: string[]): string {
  if (headers.join() === EXAMPLE_HEADERS.join()) {
    return "Example of how the CSV will look — wire data and pick columns to preview yours.";
  }
  return "Example values · headers match your selected export columns.";
}

type Props = {
  columns: string[];
  selectedColumns: string[];
  fileName: string;
  table: TabularData | null;
  /** True when a successful run produced a table */
  hasRunResult?: boolean;
  compact?: boolean;
  columnFormats?: Record<string, ColumnDisplayFormat>;
  /** Canvas is showing a preview sample — Run still needed for full data. */
  previewSample?: boolean;
  onEdit?: () => void;
};

export function StructureOutputPanel({
  columns,
  selectedColumns,
  fileName,
  table,
  hasRunResult,
  compact,
  columnFormats,
  previewSample,
  onEdit,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected =
    selectedColumns.length > 0
      ? selectedColumns.filter((c) => columns.includes(c) || table?.columns.includes(c))
      : columns;
  const exportTable = table ? projectColumns(table, selected) : null;
  const preview = buildPreview(
    columns,
    selectedColumns,
    table,
    compact ? 3 : 6,
  );

  async function onDownload() {
    if (!exportTable?.columns.length) {
      setError("No table yet — connect data and run the flow, or open Configure.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await downloadTableCsv(exportTable, fileName || "flowlytics-export.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="structure-panel structure-panel--compact nodrag nopan">
        <StructureCsvPreview
          preview={preview}
          fileName={fileName || "flowlytics-export.csv"}
          compact
          columnFormats={columnFormats}
          previewSample={previewSample}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary w-full"
          disabled={busy || !exportTable}
          onClick={onDownload}
        >
          {busy ? "Preparing…" : "Download CSV"}
        </button>
        {onEdit && (
          <button type="button" className="btn btn-sm btn-secondary w-full" onClick={onEdit}>
            Edit columns
          </button>
        )}
        {error && <p className="text-[10px] text-danger">{error}</p>}
        {!exportTable && (
          <p className="text-[10px] text-muted">
            Wire upstream data{hasRunResult ? "" : ", then Run"} to enable download.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="structure-panel space-y-3">
      <StructureCsvPreview
        preview={preview}
        fileName={fileName || "flowlytics-export.csv"}
        columnFormats={columnFormats}
        previewSample={previewSample}
      />

      <div className="rounded-xl border border-border bg-bg/70 px-3 py-2.5 text-xs leading-relaxed text-muted">
        <strong className="text-ink">Where output goes</strong>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li>Choose columns here — saved on this flow when you edit.</li>
          <li>
            <strong className="text-ink">Run</strong> stores the shaped table with that run
            (Results panel).
          </li>
          <li>
            <strong className="text-ink">Download CSV</strong> generates the file in your browser
            — nothing is emailed or shared.
          </li>
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || !exportTable}
          onClick={onDownload}
        >
          {busy ? "Preparing…" : "Download CSV"}
        </button>
        <span className="text-[11px] text-muted truncate">
          as {fileName || "flowlytics-export.csv"}
          {exportTable ? ` · ${exportTable.rows.length} rows` : ""}
        </span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
