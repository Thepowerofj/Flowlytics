"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  buildChartSpec,
  suggestCharts,
  summarizeForNode,
  type ChartType,
} from "@/modules/analyse/domain/charts";
import {
  buildForecast,
  FORECAST_METHOD_OPTIONS,
  type ForecastMethod,
  type FutureHorizonMode,
} from "@/modules/analyse/domain/forecast";
import {
  PERIOD_ORDER_OPTIONS,
  type PeriodOrder,
} from "@/modules/analyse/domain/periodOrder";
import { buildForecastInsights } from "@/modules/analyse/domain/insights";
import {
  columnLooksLikeDate,
  computeStats,
  forecastMeasureColumns,
  guessPeriodColumn,
  numericColumns,
} from "@/modules/analyse/domain/stats";
import {
  formatDisplayValue,
  resolveValueFormat,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import type { ColumnTransform } from "@/modules/ingest/domain/columnTransform";
import { formatCount } from "@/shared/lib/formatUi";
import type { ActivityNodeData } from "./types";
import { tablePreview } from "./types";
import { downloadTableCsv } from "./downloadCsv";
import { ForecastKpiStrip, InsightCard } from "./InsightCard";
import { MiniChart } from "./MiniChart";
import type { AggregateMetric } from "@/modules/analyse/domain/aggregate";
import { AggregateConfig } from "./AggregateConfig";
import { ActivityErrorBoundary } from "./ActivityErrorBoundary";
import { CleanMapConfig } from "./CleanMapConfig";
import { StructureOutputPanel } from "./StructureOutputPanel";
import { availableColumns } from "./autoMap";
import { PREVIEW_SAMPLE_ROWS } from "./previewPipeline";
import { AiConfigPanel } from "./AiConfigPanel";
import { DatasetNameField } from "./DatasetNameField";
import { SourceDataPicker } from "./SourceDataPicker";
import type { AncestorSource } from "./upstreamSources";

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function asPiiFindings(
  value: unknown,
): { column: string; kind: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is { column: string; kind: string } =>
      Boolean(
        f &&
          typeof f === "object" &&
          typeof (f as { column?: unknown }).column === "string",
      ),
    )
    .map((f) => ({
      column: f.column,
      kind: typeof f.kind === "string" ? f.kind : "pii",
    }));
}
function columnFormatsOf(
  config: Record<string, unknown>,
): Record<string, ColumnDisplayFormat> {
  const raw = config._columnFormats;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, ColumnDisplayFormat>;
  }
  return {};
}

function inputFormatsOf(
  config: Record<string, unknown>,
): Record<string, ColumnDisplayFormat> {
  const raw = config._inputColumnFormats;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, ColumnDisplayFormat>;
  }
  return columnFormatsOf(config);
}

type UploadOptions = { sheet?: string; range?: string; fileId?: string };

type Props = {
  nodeId: string;
  data: ActivityNodeData;
  onClose: () => void;
  onChangeConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  onUploadFile: (
    nodeId: string,
    file: File | null,
    options?: UploadOptions,
  ) => Promise<{ ok: true } | { ok: false; error: string }> | void;
  /** Historic run inspection — show settings but ignore edits. */
  readOnly?: boolean;
  ancestors?: AncestorSource[];
  onSelectSource?: (sourceNodeId: string) => void;
};

function OutputContractSummary({ config }: { config: Record<string, unknown> }) {
  const contract = config._runContract as
    | {
        kind?: string;
        rowCount?: number;
        grain?: string;
        primaryMeasure?: string;
        warnings?: string[];
      }
    | undefined;
  if (!contract) return null;
  const warnings = Array.isArray(contract.warnings) ? contract.warnings : [];
  return (
    <section className="mb-3 rounded-xl border border-border bg-bg/80 px-3 py-2 text-xs text-muted">
      <p className="font-semibold text-ink">Output contract</p>
      <p>
        {contract.kind ?? "table"} · {formatCount(contract.rowCount ?? 0)} rows
        {contract.grain ? ` · grain: ${contract.grain}` : ""}
        {contract.primaryMeasure ? ` · measure: ${contract.primaryMeasure}` : ""}
      </p>
      {warnings.length ? (
        <ul className="mt-1 list-disc pl-4">
          {warnings.slice(0, 3).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ActivityConfigWindow(props: Props) {
  return (
    <ActivityErrorBoundary
      label={props.data.blockType}
      fallback={
        <div className="config-window-backdrop" role="presentation" onClick={props.onClose}>
          <div
            className="config-window settle"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Configure activity
                </p>
                <h2 className="text-lg font-semibold tracking-tight">{props.data.label}</h2>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={props.onClose}>
                Done
              </button>
            </header>
            <div className="px-5 py-4 text-sm text-muted">
              This activity’s settings could not be opened (bad or compacted data). Close and
              re-run the flow, or delete the activity.
            </div>
          </div>
        </div>
      }
    >
      <ActivityConfigWindowInner {...props} />
    </ActivityErrorBoundary>
  );
}

function ActivityConfigWindowInner({
  nodeId,
  data,
  onClose,
  onChangeConfig,
  onUploadFile,
  readOnly = false,
  ancestors = [],
  onSelectSource,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const table = tablePreview(data.config);
  // Prefer materialised table columns (post Clean/Map). Never offer dropped upstream fields.
  const sourceColumns = availableColumns(data.config);
  const formats = columnFormatsOf(data.config);
  const previewSample =
    data.blockType !== "ingest.csv_excel" && data.config._previewSample === true;
  const applyPatch = (id: string, next: Record<string, unknown>) => {
    if (readOnly) return;
    onChangeConfig(id, next);
  };
  const upload = (
    id: string,
    file: File | null,
    options?: UploadOptions,
  ) => {
    if (readOnly) {
      return Promise.resolve({
        ok: false as const,
        error: "Historic view is read-only",
      });
    }
    return Promise.resolve(onUploadFile(id, file, options)).then(
      (result) => result ?? ({ ok: true as const }),
    );
  };

  return (
    <div className="config-window-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`config-window settle ${
          data.blockType === "transform.clean_map" ? "config-window--wide" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-window-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {readOnly ? "Historic activity" : "Configure activity"}
            </p>
            <h2 id="config-window-title" className="text-lg font-semibold tracking-tight">
              {data.label}
            </h2>
          </div>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {readOnly ? (
            <p className="mb-3 rounded-xl border border-border bg-bg/80 px-3 py-2 text-xs leading-relaxed text-muted">
              Read-only historic snapshot — switch back to the live editor to change settings.
            </p>
          ) : null}
          {previewSample ? (
            <p className="mb-3 text-[11px] text-muted" role="status">
              Preview sample (up to {PREVIEW_SAMPLE_ROWS} rows) · Run for full data
            </p>
          ) : null}
          <OutputContractSummary config={data.config} />
          {onSelectSource ? (
            <SourceDataPicker
              blockType={data.blockType}
              ancestors={ancestors}
              selectedId={
                (data.config.sourceNodeId as string) ||
                ancestors[0]?.id ||
                ""
              }
              readOnly={readOnly}
              onSelect={onSelectSource}
            />
          ) : null}
          {data.blockType === "ingest.csv_excel" && (
            <IngestConfig
              fileName={(data.config.fileName as string) || ""}
              fileId={(data.config.fileId as string) || ""}
              table={table}
              sheetNames={asStringList(data.config.sheetNames)}
              excelSheet={(data.config.excelSheet as string) || ""}
              excelRange={(data.config.excelRange as string) || ""}
              uploadError={(data.config.uploadError as string) || ""}
              piiFindings={asPiiFindings(data.config.piiFindings)}
              piiAcknowledged={Boolean(data.config.piiAcknowledged)}
              readOnly={readOnly}
              fileRef={fileRef}
              onBrowse={() => fileRef.current?.click()}
              onAck={(v) => applyPatch(nodeId, { piiAcknowledged: v })}
              onUpload={(file, options) => upload(nodeId, file, options)}
              onPatch={(patch) => applyPatch(nodeId, patch)}
            />
          )}

          {data.blockType === "ingest.url" && (
            <div className="space-y-3">
              <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                Each Run fetches a fresh CSV/Excel from this HTTPS URL — useful for schedules.
              </p>
              <label className="block text-sm">
                <span className="font-medium text-ink">File URL</span>
                <input
                  className="input mt-1 text-sm"
                  disabled={readOnly}
                  value={(data.config.url as string) ?? ""}
                  placeholder="https://example.com/sales.csv"
                  onChange={(e) => applyPatch(nodeId, { url: e.target.value })}
                />
              </label>
              <DatasetNameField
                value={(data.config.datasetName as string) ?? ""}
                placeholder="e.g. Weekly sales feed"
                readOnly={readOnly}
                onChange={(next) => applyPatch(nodeId, { datasetName: next })}
              />
            </div>
          )}

          {data.blockType === "output.email" && (
            <div className="space-y-3">
              <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                Sends a branded summary via SMTP when the pipeline runs.
              </p>
              <label className="block text-sm">
                <span className="font-medium text-ink">To</span>
                <input
                  className="input mt-1 text-sm"
                  disabled={readOnly}
                  value={(data.config.to as string) ?? ""}
                  placeholder="you@company.com"
                  onChange={(e) => applyPatch(nodeId, { to: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Subject</span>
                <input
                  className="input mt-1 text-sm"
                  disabled={readOnly}
                  value={(data.config.subject as string) ?? "Flowlytics results"}
                  onChange={(e) => applyPatch(nodeId, { subject: e.target.value })}
                />
              </label>
            </div>
          )}

          {data.blockType === "output.presentation" && (
            <div className="space-y-3">
              <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                Prepares a slide pack from run insights. Download PDF or PowerPoint from Results
                after Run.
              </p>
              <label className="block text-sm">
                <span className="font-medium text-ink">Deck title</span>
                <input
                  className="input mt-1 text-sm"
                  disabled={readOnly}
                  value={(data.config.deckTitle as string) ?? ""}
                  placeholder="Q3 outlook"
                  onChange={(e) => applyPatch(nodeId, { deckTitle: e.target.value })}
                />
              </label>
            </div>
          )}

          {data.blockType === "transform.clean_map" && (
            <div className="space-y-3">
              <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
                Canvas previews use up to {PREVIEW_SAMPLE_ROWS} cleaned rows. Dropped or
                renamed columns update every downstream activity automatically. Click{" "}
                <strong>Run</strong> to process the full dataset.
              </p>
              <CleanMapConfig
                columns={
                  table?.columns?.length
                    ? table.columns
                    : Array.isArray(data.config._sourceColumns) &&
                        (data.config._sourceColumns as string[]).length
                      ? (data.config._sourceColumns as string[]).filter(
                          (c): c is string => typeof c === "string",
                        )
                      : sourceColumns
                }
                columnMap={
                  data.config.columnMap &&
                  typeof data.config.columnMap === "object" &&
                  !Array.isArray(data.config.columnMap)
                    ? (data.config.columnMap as Record<string, string>)
                    : {}
                }
                dropColumns={asStringList(data.config.dropColumns)}
                transforms={
                  data.config.transforms &&
                  typeof data.config.transforms === "object" &&
                  !Array.isArray(data.config.transforms)
                    ? (data.config.transforms as Record<string, ColumnTransform>)
                    : {}
                }
                sampleRows={
                  // Input sample only (pre-transform). Preview applies cleans live.
                  Array.isArray(table?.rows) ? table.rows.slice(0, 12) : []
                }
                datasetName={(data.config.datasetName as string) ?? ""}
                onChange={(next) => applyPatch(nodeId, next)}
              />
            </div>
          )}

          {data.blockType === "transform.aggregate" && (
            <AggregateConfig
              columns={sourceColumns}
              table={table}
              groupBy={
                Array.isArray(data.config.groupBy)
                  ? (data.config.groupBy as string[])
                  : []
              }
              metrics={
                Array.isArray(data.config.metrics)
                  ? (data.config.metrics as AggregateMetric[])
                  : []
              }
              inputFormats={inputFormatsOf(data.config)}
              datasetName={(data.config.datasetName as string) ?? ""}
              onChange={(next) => applyPatch(nodeId, next)}
            />
          )}

          {data.blockType === "output.structure" && (
            <StructureConfig
              columns={sourceColumns}
              selected={
                Array.isArray(data.config.selectedColumns)
                  ? (data.config.selectedColumns as string[])
                  : sourceColumns
              }
              fileName={(data.config.fileName as string) || "flowlytics-export.csv"}
              table={table}
              columnFormats={formats}
              previewSample={previewSample}
              onChange={(next) => applyPatch(nodeId, next)}
            />
          )}

          {data.blockType === "analyse.projection" && (
            <ProjectionConfig
              columns={sourceColumns}
              table={table}
              column={(data.config.column as string) ?? ""}
              periodColumn={(data.config.periodColumn as string) ?? ""}
              periods={Number(data.config.periods ?? 3)}
              futureMode={
                (data.config.futureMode as FutureHorizonMode) || "count"
              }
              untilDate={(data.config.untilDate as string) ?? ""}
              customFutureDates={(data.config.customFutureDates as string) ?? ""}
              method={(data.config.method as string) || "trend"}
              window={Number(data.config.window ?? 3)}
              seasonLength={Number(data.config.seasonLength ?? 12)}
              alpha={Number(data.config.alpha ?? 0.3)}
              confidenceBand={data.config.confidenceBand !== false}
              periodOrder={(data.config.periodOrder as string) || "auto"}
              compareMethods={
                Array.isArray(data.config.compareMethods)
                  ? (data.config.compareMethods as string[])
                  : []
              }
              outputShape={
                data.config.outputShape === "wide" ? "wide" : "long"
              }
              goalPrompt={(data.config.goalPrompt as string) ?? ""}
              columnFormats={formats}
              onChange={(next) =>
                applyPatch(nodeId, {
                  ...next,
                  nodeWidth: 480,
                  nodeHeight: 400,
                })
              }
            />
          )}

          {data.blockType.startsWith("ai.") && (
            <AiConfigPanel
              blockType={data.blockType}
              config={data.config}
              readOnly={readOnly}
              onChange={(patch) => applyPatch(nodeId, patch)}
            />
          )}

          {data.blockType === "analyse.chart" && (
            <ChartConfig
              table={table}
              chartType={(data.config.chartType as ChartType) || "bar"}
              xColumn={(data.config.xColumn as string) || ""}
              yColumn={(data.config.yColumn as string) || ""}
              suggestionId={(data.config.suggestionId as string) || ""}
              columnFormats={formats}
              onChange={(next) => applyPatch(nodeId, next)}
            />
          )}

          {data.blockType === "analyse.stats" && (
            <StatsConfig table={table} columnFormats={formats} previewSample={previewSample} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChartConfig({
  table,
  chartType,
  xColumn,
  yColumn,
  suggestionId,
  columnFormats,
  onChange,
}: {
  table: ReturnType<typeof tablePreview>;
  chartType: ChartType;
  xColumn: string;
  yColumn: string;
  suggestionId: string;
  columnFormats: Record<string, ColumnDisplayFormat>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  if (!table?.columns.length) {
    return (
      <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
        Connect a table upstream first. We’ll suggest bar, line, or pie charts from your columns.
      </p>
    );
  }

  const suggestions = suggestCharts(table);
  const preview = buildChartSpec(table, {
    chartType,
    xColumn,
    yColumn,
    suggestionId,
    columnFormats,
  });
  const numericCols = numericColumns(table);
  const numericSet = new Set(numericCols);

  const xOptions = ["__row__", ...table.columns];
  const yOptions = ["__count__", ...table.columns];
  const safeX = xOptions.includes(xColumn)
    ? xColumn
    : xColumn === ""
      ? "__row__"
      : table.columns[0] ?? "__row__";
  const safeY = yOptions.includes(yColumn)
    ? yColumn
    : yColumn === ""
      ? numericCols[0] ?? "__count__"
      : numericCols[0] ?? "__count__";

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold">Suggested for this data</h3>
        <p className="mt-0.5 text-xs text-muted">Pick one — the canvas node updates immediately.</p>
        <div className="mt-2 grid gap-2">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                suggestionId === s.id
                  ? "border-accent bg-accent-soft/50"
                  : "border-border bg-white hover:border-accent/40"
              }`}
              onClick={() =>
                onChange({
                  suggestionId: s.id,
                  chartType: s.type,
                  xColumn: s.xColumn,
                  yColumn: s.yColumn,
                  // Grow the canvas showcase when a chart is chosen
                  nodeWidth: 480,
                  nodeHeight: 400,
                })
              }
            >
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="mt-0.5 text-xs text-muted">{s.reason}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-muted">Chart type</span>
          <select
            className="input mt-1 text-sm"
            value={chartType}
            onChange={(e) =>
              onChange({
                chartType: e.target.value,
                suggestionId: "",
                nodeWidth: 480,
                nodeHeight: 400,
              })
            }
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Category / X</span>
          <select
            className="input mt-1 text-sm"
            value={safeX}
            onChange={(e) => onChange({ xColumn: e.target.value, suggestionId: "" })}
          >
            <option value="__row__">Row number</option>
            {table.columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">Value / Y</span>
          <select
            className="input mt-1 text-sm"
            value={safeY}
            onChange={(e) => onChange({ yColumn: e.target.value, suggestionId: "" })}
          >
            <option value="__count__">Count of rows</option>
            {table.columns.map((c) => (
              <option key={c} value={c}>
                {numericSet.has(c) ? `${c} (number)` : c}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-xl border border-border bg-bg/60 p-3">
        <h3 className="mb-2 text-sm font-semibold">Live preview</h3>
        <p className="mb-2 text-[11px] text-muted">
          Preview uses upstream output (cleaned and/or aggregated). Pick X/Y from those
          columns only. Full data on Run.
        </p>
        <MiniChart chart={preview} size="lg" />
      </section>
    </div>
  );
}

function StatsConfig({
  table,
  columnFormats,
  previewSample,
}: {
  table: ReturnType<typeof tablePreview>;
  columnFormats: Record<string, ColumnDisplayFormat>;
  previewSample: boolean;
}) {
  if (!table?.columns.length) {
    return (
      <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
        Connect a table upstream to see a plain-language summary of your columns.
      </p>
    );
  }
  const summary = summarizeForNode(table, columnFormats);
  const stats = computeStats(table);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {previewSample ? "Preview sample" : "Full run"} · {summary.rows} rows ·{" "}
        {summary.columns} columns. Highlights also show on the canvas
        {previewSample ? ". Click Run for the full dataset." : "."}
      </p>
      <ul className="space-y-2">
        {stats.map((s) => {
          const fmt = columnFormats[s.column];
          return (
            <li key={s.column} className="rounded-xl border border-border px-3 py-2 text-sm">
              <div className="font-semibold">{s.column}</div>
              {s.kind === "numeric" ? (
                <p className="mt-0.5 text-xs text-muted">
                  Number · avg{" "}
                  {formatDisplayValue(
                    s.mean,
                    fmt ?? { kind: "number", useGrouping: true, decimals: 2 },
                  )}{" "}
                  · median{" "}
                  {formatDisplayValue(
                    s.median,
                    fmt ?? { kind: "number", useGrouping: true, decimals: 2 },
                  )}{" "}
                  · std{" "}
                  {formatDisplayValue(
                    s.stddev,
                    fmt ?? { kind: "number", useGrouping: true, decimals: 2 },
                  )}{" "}
                  · P25–P75{" "}
                  {formatDisplayValue(s.p25, fmt ?? { kind: "number", useGrouping: true })}–
                  {formatDisplayValue(s.p75, fmt ?? { kind: "number", useGrouping: true })}
                  {s.nullPct != null ? ` · ${s.nullPct}% blank` : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-muted">
                  Category · top:{" "}
                  {(s.topValues ?? [])
                    .slice(0, 3)
                    .map((t) => `${t.value} (${t.count})`)
                    .join(", ") || "—"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function IngestConfig({
  fileName,
  fileId,
  table,
  sheetNames,
  excelSheet,
  excelRange,
  uploadError,
  piiFindings,
  piiAcknowledged,
  readOnly,
  fileRef,
  onBrowse,
  onAck,
  onUpload,
  onPatch,
}: {
  fileName: string;
  fileId: string;
  table: ReturnType<typeof tablePreview>;
  sheetNames: string[];
  excelSheet: string;
  excelRange: string;
  uploadError: string;
  piiFindings: { column: string; kind: string }[];
  piiAcknowledged: boolean;
  readOnly: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onBrowse: () => void;
  onAck: (v: boolean) => void;
  onUpload: (
    file: File | null,
    options?: UploadOptions,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [rangeDraft, setRangeDraft] = useState(excelRange);
  const isExcel = sheetNames.length > 0 || /\.xlsx?$/i.test(fileName);
  const error = localError || uploadError;

  useEffect(() => {
    setRangeDraft(excelRange);
  }, [excelRange, fileId]);

  useEffect(() => {
    if (!uploadError) setLocalError("");
  }, [uploadError]);

  async function handleFile(file: File) {
    if (readOnly) return;
    setBusy(true);
    setLocalError("");
    onPatch({ uploadError: null });
    const result = await onUpload(file);
    if (!result.ok) setLocalError(result.error);
    setBusy(false);
  }

  async function applyExcelSelection(nextSheet?: string, nextRange?: string) {
    if (readOnly || !fileId) return;
    setBusy(true);
    setLocalError("");
    const sheet = nextSheet ?? excelSheet;
    const range = nextRange ?? rangeDraft;
    const result = await onUpload(null, { fileId, sheet, range });
    if (!result.ok) setLocalError(result.error);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        disabled={readOnly || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <div
        className={`rounded-xl border border-dashed px-4 py-8 text-center ${
          error ? "border-danger/50 bg-danger/5" : "border-border bg-bg"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (readOnly || busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        <p className="font-medium text-ink">
          {busy
            ? "Uploading…"
            : fileName
              ? fileName
              : "Drop CSV or Excel here"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {table
            ? `${formatCount(table.rows.length)} rows · ${table.columns.length} columns · full file kept for Run`
            : "Max 20 MB · CSV or Excel (.xlsx / .xls)"}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-primary mt-4"
          onClick={onBrowse}
          disabled={readOnly || busy}
        >
          {busy ? "Working…" : fileName ? "Replace file" : "Choose file"}
        </button>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-danger/35 bg-danger/10 px-3 py-2.5 text-sm text-danger"
          role="alert"
        >
          <strong className="font-semibold">Upload issue</strong>
          <p className="mt-1 text-xs leading-relaxed">{error}</p>
        </div>
      ) : null}

      {isExcel && fileId ? (
        <div className="space-y-3 rounded-xl border border-border bg-bg/60 px-3 py-3">
          <div>
            <h3 className="text-sm font-semibold">Excel sheet & range</h3>
            <p className="mt-0.5 text-xs text-muted">
              Pick the worksheet (page) and optional A1 range. The first row in the
              range is treated as headers.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-muted">Sheet</span>
            <select
              className="input mt-1 text-sm"
              value={excelSheet || sheetNames[0] || ""}
              disabled={readOnly || busy || !sheetNames.length}
              onChange={(e) => {
                const sheet = e.target.value;
                onPatch({ excelSheet: sheet });
                void applyExcelSelection(sheet, rangeDraft);
              }}
            >
              {sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">Data range (optional)</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <input
                className="input min-w-[10rem] flex-1 text-sm"
                placeholder="e.g. A1:D50"
                value={rangeDraft}
                disabled={readOnly || busy}
                onChange={(e) => setRangeDraft(e.target.value)}
                onBlur={() => {
                  if (rangeDraft.trim() !== (excelRange || "").trim()) {
                    onPatch({ excelRange: rangeDraft.trim() });
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={readOnly || busy}
                onClick={() => {
                  onPatch({ excelRange: rangeDraft.trim() });
                  void applyExcelSelection(excelSheet, rangeDraft.trim());
                }}
              >
                Apply range
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Leave blank to use the whole sheet. Example: <code>B2:F200</code>
            </p>
          </label>
        </div>
      ) : null}

      {table && table.columns.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Preview</h3>
          {excelSheet ? (
            <p className="mt-0.5 text-xs text-muted">
              Sheet “{excelSheet}”
              {excelRange ? ` · range ${excelRange}` : " · full sheet"}
            </p>
          ) : null}
          <div className="mt-2 overflow-auto rounded-xl border border-border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-bg text-muted">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {table.columns.map((c) => (
                      <td key={c} className="max-w-[140px] truncate px-2 py-1.5">
                        {row[c] == null ? "" : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {piiFindings.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
          <div className="font-semibold text-warning">Possible personal data detected</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted">
            {piiFindings.map((f) => (
              <li key={`${f.column}-${f.kind}`}>
                {f.column} ({f.kind})
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={piiAcknowledged}
              disabled={readOnly}
              onChange={(e) => onAck(e.target.checked)}
            />
            I understand and want to proceed
          </label>
        </div>
      )}
    </div>
  );
}

function StructureConfig({
  columns,
  selected,
  fileName,
  table,
  columnFormats,
  previewSample,
  onChange,
}: {
  columns: string[];
  selected: string[];
  fileName: string;
  table: ReturnType<typeof tablePreview>;
  columnFormats: Record<string, ColumnDisplayFormat>;
  previewSample: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const set = new Set(selected.length ? selected : columns);

  function move(col: string, dir: -1 | 1) {
    const list = selected.length ? [...selected] : [...columns];
    const i = list.indexOf(col);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
    onChange({ selectedColumns: list });
  }

  return (
    <div className="space-y-4">
      <StructureOutputPanel
        columns={columns}
        selectedColumns={selected.length ? selected : columns}
        fileName={fileName}
        table={table}
        columnFormats={columnFormats}
        previewSample={previewSample}
      />

      {!columns.length ? (
        <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
          Connect upstream to choose which columns appear in the export. The preview above
          shows the CSV layout you’ll get.
        </p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="text-muted">Download filename</span>
            <input
              className="input mt-1 text-sm"
              value={fileName}
              onChange={(e) => onChange({ fileName: e.target.value })}
              placeholder="flowlytics-export.csv"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Columns in export</h3>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => onChange({ selectedColumns: [...columns] })}
              >
                Select all
              </button>
            </div>
            <p className="mb-2 text-xs text-muted">
              Check columns to include. Use arrows to set CSV column order — the preview updates
              to match.
            </p>
            <div className="space-y-1.5">
              {(selected.length ? selected.filter((c) => columns.includes(c)) : columns)
                .concat(columns.filter((c) => !set.has(c)))
                .map((col) => {
                  const checked = set.has(col);
                  return (
                    <div
                      key={col}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                        checked
                          ? "border-border bg-white"
                          : "border-transparent bg-bg/50 opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const base = selected.length ? [...selected] : [...columns];
                          if (e.target.checked) {
                            onChange({
                              selectedColumns: base.includes(col) ? base : [...base, col],
                            });
                          } else {
                            onChange({ selectedColumns: base.filter((c) => c !== col) });
                          }
                        }}
                        aria-label={`Include ${col}`}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{col}</span>
                      {checked && (
                        <span className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost px-2"
                            onClick={() => move(col, -1)}
                            aria-label={`Move ${col} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost px-2"
                            onClick={() => move(col, 1)}
                            aria-label={`Move ${col} down`}
                          >
                            ↓
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectionConfig({
  columns,
  table,
  column,
  periodColumn,
  periods,
  futureMode,
  untilDate,
  customFutureDates,
  method,
  window,
  seasonLength,
  alpha,
  confidenceBand,
  periodOrder,
  compareMethods,
  outputShape,
  goalPrompt,
  columnFormats,
  onChange,
}: {
  columns: string[];
  table: ReturnType<typeof tablePreview>;
  column: string;
  periodColumn: string;
  periods: number;
  futureMode: FutureHorizonMode;
  untilDate: string;
  customFutureDates: string;
  method: string;
  window: number;
  seasonLength: number;
  alpha: number;
  confidenceBand: boolean;
  periodOrder: string;
  compareMethods: string[];
  outputShape: "long" | "wide";
  goalPrompt: string;
  columnFormats: Record<string, ColumnDisplayFormat>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const measureCols = table ? forecastMeasureColumns(table) : columns;
  const valueOptions = measureCols.length ? measureCols : columns;
  const labelOptions = columns.filter((c) => c !== column);
  const safeMethod = (FORECAST_METHOD_OPTIONS.some((m) => m.id === method)
    ? method
    : "trend") as ForecastMethod;
  const methodMeta = FORECAST_METHOD_OPTIONS.find((m) => m.id === safeMethod);
  const safeColumn =
    column && valueOptions.includes(column)
      ? column
      : valueOptions[0] || "";
  const suggestedPeriod =
    table && safeColumn ? guessPeriodColumn(table, safeColumn) : "";
  const safePeriod =
    periodColumn &&
    periodColumn !== safeColumn &&
    labelOptions.includes(periodColumn)
      ? periodColumn
      : suggestedPeriod && labelOptions.includes(suggestedPeriod)
        ? suggestedPeriod
        : "";
  const valueFmt =
    resolveValueFormat(columnFormats, safeColumn) ??
    ({ kind: "number", useGrouping: true } as ColumnDisplayFormat);

  let preview: ReturnType<typeof buildForecast> | null = null;
  let previewHint = "";
  const safeFutureMode: FutureHorizonMode =
    futureMode === "until" || futureMode === "custom" ? futureMode : "count";

  if (table && safeColumn) {
    try {
      preview = buildForecast(table, {
        column: safeColumn,
        periodColumn: safePeriod || undefined,
        periods,
        futureMode: safeFutureMode,
        untilDate,
        customFutureDates,
        method: safeMethod,
        window,
        seasonLength,
        alpha,
        confidenceBand,
        periodOrder: (periodOrder as PeriodOrder) || "auto",
        compareMethods: compareMethods.length ? compareMethods : undefined,
        outputShape,
      });
      if (preview.actual.length < 2) {
        previewHint =
          preview.actual.length === 0
            ? `“${safeColumn}” has no readable numbers. Dates belong in period labels, not the value to forecast.`
            : `Need at least 2 numeric history points in “${safeColumn}” (found ${preview.actual.length}).`;
        preview = null;
      }
    } catch {
      preview = null;
      previewHint = "Could not build a forecast preview from the current columns.";
    }
  } else if (!safeColumn) {
    previewHint =
      "No numeric measure column found. Forecast a number (Sales, Qty) — not a date/month column.";
  }

  const forecastRows = preview?.points.filter((p) => p.series === "Forecast") ?? [];
  const forecastNarr = preview
    ? buildForecastInsights(preview, valueFmt)
    : null;
  const chartPreview = preview
    ? {
        type: "line" as const,
        title: `Forecast · ${safeColumn}`,
        xLabel: "Period",
        yLabel: safeColumn,
        forecastSplit: true,
        valueFormat: valueFmt,
        insights: forecastNarr?.insights.map((i) => `${i.title}: ${i.detail}`),
        points: preview.points.map((p) => ({
          x: p.period,
          y: p.value,
          series: p.series,
          low: p.low,
          high: p.high,
        })),
      }
    : null;

  const needsWindow = safeMethod === "moving_average";
  const needsSeason = safeMethod === "seasonal_naive";
  const needsAlpha = safeMethod === "smooth";
  const needsBand = safeMethod === "trend" || safeMethod === "smooth";

  // Heal stale / date-as-value selections
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!safeColumn || column === safeColumn) return;
    onChangeRef.current({ column: safeColumn });
  }, [safeColumn, column]);
  useEffect(() => {
    if (safePeriod === periodColumn) return;
    if (!safePeriod && !periodColumn) return;
    onChangeRef.current({ periodColumn: safePeriod });
  }, [safePeriod, periodColumn]);

  if (!columns.length) {
    return (
      <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted">
        Connect upstream data first, then pick a numeric measure to forecast (dates stay as
        labels).
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">
        Forecast playground: pick a goal, measure, period order, and compare techniques.
        Dates are axis labels — history is solid; forecast is dashed.
      </p>

      <label className="block text-sm">
        <span className="font-medium text-ink">What should we predict?</span>
        <input
          className="input mt-1 text-sm"
          value={goalPrompt}
          placeholder="e.g. Next 3 months of sales"
          onChange={(e) => onChange({ goalPrompt: e.target.value })}
        />
      </label>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-ink">What to forecast (numeric)</span>
          <select
            className="input mt-1 text-sm"
            value={safeColumn}
            onChange={(e) => onChange({ column: e.target.value })}
          >
            {!valueOptions.length ? (
              <option value="">No numeric columns</option>
            ) : (
              valueOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            )}
          </select>
          <span className="mt-1 block text-[11px] text-muted">
            Measure column only. Date fields are hidden here on purpose.
          </span>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">Period labels (dates / months — optional)</span>
          <select
            className="input mt-1 text-sm"
            value={safePeriod}
            onChange={(e) => onChange({ periodColumn: e.target.value })}
          >
            <option value="">Period 1, 2, 3…</option>
            {labelOptions.map((c) => (
              <option key={c} value={c}>
                {c}
                {table && columnLooksLikeDate(table, c) ? " (date)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-ink">Period / x-axis order</span>
          <select
            className="input mt-1 text-sm"
            value={periodOrder || "auto"}
            onChange={(e) => onChange({ periodOrder: e.target.value })}
          >
            {PERIOD_ORDER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">
            {PERIOD_ORDER_OPTIONS.find((o) => o.id === (periodOrder || "auto"))
              ?.hint}
            {preview?.chronologyWarning
              ? " Warning: row order is not chronological — switch to Auto or Date ascending."
              : ""}
            {preview?.periodReordered
              ? ` Sorted (${preview.periodOrderApplied}).`
              : ""}
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-border bg-white p-3">
        <label className="block text-sm">
          <span className="font-medium text-ink">Forecast technique</span>
          <select
            className="input mt-1 text-sm"
            value={safeMethod}
            onChange={(e) => onChange({ method: e.target.value })}
          >
            {FORECAST_METHOD_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">{methodMeta?.hint}</span>
        </label>

        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ink">Compare techniques</legend>
          <p className="mt-0.5 text-[11px] text-muted">
            Run holdout MAE side-by-side; recommended method is highlighted after preview.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORECAST_METHOD_OPTIONS.filter((m) => m.id !== "ensemble").map((m) => {
              const on = compareMethods.includes(m.id) || m.id === safeMethod;
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={m.id === safeMethod}
                    onChange={(e) => {
                      const next = new Set(compareMethods);
                      if (e.target.checked) next.add(m.id);
                      else next.delete(m.id);
                      next.add(safeMethod);
                      onChange({ compareMethods: [...next] });
                    }}
                  />
                  {m.label}
                  {preview?.recommendedMethod === m.id ? " ★" : ""}
                </label>
              );
            })}
          </div>
          {preview?.compare?.length ? (
            <ul className="mt-2 space-y-1 text-[11px] text-muted">
              {preview.compare.map((c) => (
                <li key={c.method}>
                  {c.method}
                  {c.backtest
                    ? ` — MAE ${c.backtest.mae}${
                        c.backtest.mape != null ? `, MAPE ${c.backtest.mape}%` : ""
                      }`
                    : ""}
                  {preview.recommendedMethod === c.method ? " (recommended)" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        <label className="mt-3 block text-sm">
          <span className="font-medium text-ink">Output table shape</span>
          <select
            className="input mt-1 text-sm"
            value={outputShape}
            onChange={(e) => onChange({ outputShape: e.target.value })}
          >
            <option value="long">Long (period, value, series)</option>
            <option value="wide">Wide (period, actual, forecast)</option>
          </select>
        </label>

        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <fieldset>
            <legend className="text-sm font-medium text-ink">Future dates</legend>
            <p className="mt-0.5 text-[11px] text-muted">
              Choose how far ahead to forecast — by count, until a date, or your own
              dates.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["count", "Periods ahead"],
                  ["until", "Until date"],
                  ["custom", "Custom dates"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`btn btn-sm ${
                    safeFutureMode === id ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => onChange({ futureMode: id })}
                  aria-pressed={safeFutureMode === id}
                >
                  {label}
                </button>
              ))}
            </div>

            {safeFutureMode === "count" ? (
              <label className="mt-2 block text-sm sm:max-w-[12rem]">
                <span className="text-muted">How many periods ahead</span>
                <input
                  className="input mt-1 text-sm"
                  type="number"
                  min={1}
                  max={24}
                  value={periods}
                  onChange={(e) => onChange({ periods: Number(e.target.value) })}
                />
              </label>
            ) : null}

            {safeFutureMode === "until" ? (
              <label className="mt-2 block text-sm sm:max-w-[16rem]">
                <span className="text-muted">Forecast until</span>
                <input
                  className="input mt-1 text-sm"
                  type="date"
                  value={untilDate.slice(0, 10)}
                  onChange={(e) => onChange({ untilDate: e.target.value })}
                />
                <span className="mt-1 block text-[11px] text-muted">
                  Steps follow your history spacing (month/day).
                </span>
              </label>
            ) : null}

            {safeFutureMode === "custom" ? (
              <label className="mt-2 block text-sm">
                <span className="text-muted">Future dates (one per line)</span>
                <textarea
                  className="input mt-1 min-h-[88px] text-sm"
                  placeholder={"2024-04-01\n2024-05-01\n2024-06-01"}
                  value={customFutureDates}
                  onChange={(e) => onChange({ customFutureDates: e.target.value })}
                />
                <span className="mt-1 block text-[11px] text-muted">
                  Accepts ISO dates, Jan-24, or DD/MM/YYYY — up to 24 points.
                </span>
              </label>
            ) : null}

            {forecastRows.length > 0 ? (
              <p className="mt-2 text-[11px] text-muted">
                Horizon:{" "}
                <span className="font-semibold text-ink">
                  {forecastRows.map((r) => r.period).join(" · ")}
                </span>
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
          {needsWindow ? (
            <label className="block text-sm">
              <span className="text-muted">Average of last N periods</span>
              <input
                className="input mt-1 text-sm"
                type="number"
                min={2}
                max={24}
                value={window}
                onChange={(e) => onChange({ window: Number(e.target.value) })}
              />
            </label>
          ) : null}

          {needsSeason ? (
            <label className="block text-sm">
              <span className="text-muted">Cycle length (season)</span>
              <select
                className="input mt-1 text-sm"
                value={seasonLength}
                onChange={(e) => onChange({ seasonLength: Number(e.target.value) })}
              >
                <option value={4}>4 — quarters</option>
                <option value={7}>7 — days of week</option>
                <option value={12}>12 — months</option>
              </select>
            </label>
          ) : null}

          {needsAlpha ? (
            <label className="block text-sm">
              <span className="text-muted">Smoothness (0.05–0.95)</span>
              <input
                className="input mt-1 text-sm"
                type="number"
                min={0.05}
                max={0.95}
                step={0.05}
                value={alpha}
                onChange={(e) => onChange({ alpha: Number(e.target.value) })}
              />
              <span className="mt-1 block text-[11px] text-muted">
                Higher = react faster to recent changes
              </span>
            </label>
          ) : null}

          {needsBand ? (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={confidenceBand}
                onChange={(e) => onChange({ confidenceBand: e.target.checked })}
              />
              <span>
                Show likely range (confidence band) on the chart and table
                <span className="mt-0.5 block text-[11px] text-muted">
                  Shaded band from residual spread (Trend / Smooth only) — plan for a range, not a single point.
                </span>
              </span>
            </label>
          ) : null}
          </div>
        </div>
      </section>

      {chartPreview ? (
        <section className="rounded-xl border border-border bg-bg/60 p-3">
          <h3 className="mb-1 text-sm font-semibold">Chart preview</h3>
          <p className="mb-2 text-[11px] text-muted">
            Teal solid = history · orange dashed = forecast for{" "}
            <strong>{safeColumn}</strong>
            {preview?.band ? " · shaded band = likely range" : ""}
          </p>
          <MiniChart chart={chartPreview} size="lg" />
          {forecastNarr?.kpis ? (
            <ForecastKpiStrip
              lastActual={forecastNarr.kpis.lastActual}
              nextForecast={forecastNarr.kpis.nextForecast}
              changePct={forecastNarr.kpis.changePct}
              valueFormat={valueFmt}
            />
          ) : null}
          {forecastNarr?.insights?.length ? (
            <div className="mt-2">
              <InsightCard
                title="What this means"
                lines={forecastNarr.insights.map(
                  (i) => `${i.title}: ${i.detail}`,
                )}
              />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-muted">
          {previewHint ||
            "Need at least two numeric values in the measure column to preview a forecast."}
        </p>
      )}

      {forecastRows.length > 0 && preview ? (
        <section className="forecast-values rounded-xl border p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Forecasted values</h3>
              <p className="mt-0.5 text-[11px] text-muted">
                Next {forecastRows.length} period
                {forecastRows.length === 1 ? "" : "s"} for{" "}
                <strong>{safeColumn}</strong> using{" "}
                {methodMeta?.label ?? safeMethod}.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary shrink-0"
              onClick={() => {
                void downloadTableCsv(
                  preview.table,
                  `forecast-${safeColumn || "series"}.csv`,
                );
              }}
            >
              Download CSV
            </button>
          </div>
          <div className="mt-2 overflow-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-2 py-1.5 font-semibold">Period</th>
                  <th className="px-2 py-1.5 font-semibold">Forecast</th>
                  {preview?.band ? (
                    <>
                      <th className="px-2 py-1.5 font-semibold">Low</th>
                      <th className="px-2 py-1.5 font-semibold">High</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {forecastRows.map((row) => (
                  <tr key={row.period} className="border-b border-border/70">
                    <td className="px-2 py-1.5 font-medium text-ink">{row.period}</td>
                    <td className="forecast-values__value px-2 py-1.5">
                      {formatDisplayValue(row.value, valueFmt)}
                    </td>
                    {preview?.band ? (
                      <>
                        <td className="px-2 py-1.5 text-muted">
                          {formatDisplayValue(row.low, valueFmt)}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          {formatDisplayValue(row.high, valueFmt)}
                        </td>
                      </>
                    ) : null}
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
