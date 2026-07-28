"use client";

import {
  normalizeInsightReport,
  parseInsightReportReply,
} from "@/modules/ai/domain/insightReport";
import {
  STRUCTURE_SCHEMA_TEMPLATES,
  normalizeOutputColumns,
  schemasEqual,
  type OutputColumnSpec,
  type OutputColumnType,
} from "@/modules/ai/domain/structuredOutput";
import type { TabularData } from "@/modules/blocks/domain/types";
import { AiInsightShowcase } from "./AiInsightShowcase";
import { DatasetNameField } from "./DatasetNameField";

type Props = {
  blockType: string;
  config: Record<string, unknown>;
  readOnly?: boolean;
  onChange: (patch: Record<string, unknown>) => void;
};

function blurb(blockType: string): string {
  switch (blockType) {
    case "ai.structure":
      return "Wire messy data in (or paste notes). Leave the column builder empty to let AI invent a schema — it fills the builder when the run returns. Or set columns yourself so the next Run must follow your structure.";
    case "ai.explain":
      return "After Run, a styled explanation card expands on the canvas. The Out table is structured findings you can Chart or Structure next.";
    case "ai.analyse":
      return "After Run, ranked findings expand on the activity (like a chart showcase). Downstream steps receive a structured insights table (kind, title, detail, metric).";
    case "ai.chart":
      return "Suggest the best chart type and axes. Connect a Chart activity next — axes apply automatically.";
    default:
      return "Optional AI step — uses your API key from Settings when you Run.";
  }
}

export function AiConfigPanel({ blockType, config, readOnly, onChange }: Props) {
  const columns = normalizeOutputColumns(config.outputColumns);
  const suggested = normalizeOutputColumns(config.suggestedOutputColumns);
  const upstreamColumns = Array.isArray(config._upstreamColumns)
    ? (config._upstreamColumns as string[])
    : [];
  const runTableRaw =
    (config._runOutputTable as TabularData | undefined) ??
    (config._previewSample === false
      ? (config.table as TabularData | undefined)
      : undefined);
  const runTable =
    runTableRaw &&
    Array.isArray(runTableRaw.columns) &&
    Array.isArray(runTableRaw.rows)
      ? runTableRaw
      : undefined;
  const upstreamPreviewRaw = config._upstreamPreview as TabularData | null | undefined;
  const upstreamPreview =
    upstreamPreviewRaw &&
    Array.isArray(upstreamPreviewRaw.columns) &&
    Array.isArray(upstreamPreviewRaw.rows)
      ? upstreamPreviewRaw
      : null;
  const hasInput = upstreamColumns.length > 0 || Boolean((config.rawText as string)?.trim());
  const builderLocksAi = columns.length > 0;
  const suggestionDiffers =
    suggested.length > 0 && !schemasEqual(columns, suggested);

  function setColumns(next: OutputColumnSpec[]) {
    onChange({
      outputColumns: normalizeOutputColumns(next),
      _previewSample: true,
      schemaAutoFilled: false,
    });
  }

  function updateColumn(index: number, patch: Partial<OutputColumnSpec>) {
    const next = columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setColumns(next);
  }

  function removeColumn(index: number) {
    setColumns(columns.filter((_, i) => i !== index));
  }

  function addColumn() {
    let n = 1;
    const names = new Set(columns.map((c) => c.name));
    while (names.has(`column_${n}`)) n += 1;
    setColumns([...columns, { name: `column_${n}`, type: "string" }]);
  }

  function applyTemplate(id: string) {
    const tpl = STRUCTURE_SCHEMA_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    onChange({
      outputColumns: normalizeOutputColumns(tpl.columns),
      _previewSample: true,
      schemaAutoFilled: false,
      lockSchema: true,
      ...(!config.datasetName ? { datasetName: tpl.label } : {}),
    });
  }

  function useUpstreamAsSchema() {
    if (!upstreamColumns.length) return;
    onChange({
      outputColumns: normalizeOutputColumns(
        upstreamColumns.map((name) => ({
          name,
          type: "string" as const,
          description: "From upstream input",
        })),
      ),
      _previewSample: true,
      schemaAutoFilled: false,
      lockSchema: true,
    });
  }

  function applySuggestion() {
    if (!suggested.length) return;
    onChange({
      outputColumns: suggested,
      _previewSample: true,
      schemaAutoFilled: false,
      lockSchema: true,
    });
  }

  function clearBuilder() {
    onChange({
      outputColumns: [],
      lockSchema: false,
      schemaAutoFilled: false,
      _previewSample: true,
    });
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-bg px-3 py-2 text-xs text-muted">{blurb(blockType)}</p>

      <DatasetNameField
        value={(config.datasetName as string) ?? ""}
        placeholder={
          blockType === "ai.structure" ? "e.g. Structured notes" : "e.g. AI insights"
        }
        readOnly={readOnly}
        onChange={(next) => onChange({ datasetName: next })}
      />

      <label className="flex items-start gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          checked={Boolean(config.aiOptIn)}
          onChange={(e) => onChange({ aiOptIn: e.target.checked })}
          disabled={readOnly}
        />
        <span>
          <span className="font-medium text-ink">Use AI on Run</span>
          <span className="mt-0.5 block text-xs text-muted">
            Calls your encrypted API key from Settings (not wallet credits).
          </span>
        </span>
      </label>

      {(blockType === "ai.analyse" || blockType === "ai.explain") && (
        <section className="space-y-2 rounded-xl border border-border bg-white px-3 py-3">
          <label className="block text-sm">
            <span className="font-medium text-ink">Your question (optional)</span>
            <input
              className="input mt-1 text-sm"
              disabled={readOnly}
              value={(config.userQuestion as string) ?? ""}
              placeholder="e.g. Where are we losing margin?"
              onChange={(e) => onChange({ userQuestion: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Answer style</span>
            <select
              className="input mt-1 text-sm"
              disabled={readOnly}
              value={(config.answerStyle as string) || "exec"}
              onChange={(e) => onChange({ answerStyle: e.target.value })}
            >
              <option value="exec">Executive summary</option>
              <option value="bullets">Bullet findings</option>
              <option value="actions">Next actions</option>
            </select>
          </label>
        </section>
      )}

      {blockType === "ai.structure" && (
        <>
          <section className="rounded-xl border border-border bg-white px-3 py-3">
            <h3 className="text-sm font-semibold">Input</h3>
            <p className="mt-0.5 text-[11px] text-muted">
              Prefer a wired upstream table. Paste notes only when you have no In
              connection (or to add context).
            </p>
            {upstreamColumns.length > 0 ? (
              <div className="mt-2 rounded-lg bg-bg px-2.5 py-2 text-xs">
                <p className="font-medium text-ink">
                  Upstream table · {upstreamColumns.length} columns
                </p>
                <p className="mt-0.5 text-muted">{upstreamColumns.join(", ")}</p>
                {upstreamPreview?.rows?.length ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Sample:{" "}
                    {upstreamPreview.rows
                      .slice(0, 2)
                      .map((r) =>
                        upstreamPreview.columns
                          .slice(0, 3)
                          .map((c) => String(r[c] ?? "—"))
                          .join(" · "),
                      )
                      .join(" | ")}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                No table wired yet — connect an Ingest/Clean step, or paste text below.
              </p>
            )}

            <label className="mt-3 block text-sm">
              <span className="text-muted">
                Extra notes{upstreamColumns.length ? " (optional)" : ""}
              </span>
              <textarea
                className="input mt-1 min-h-[88px] text-sm"
                placeholder={
                  upstreamColumns.length
                    ? "Optional context for the model…"
                    : "Paste unstructured notes, emails, or free-form lines…"
                }
                value={(config.rawText as string) ?? ""}
                onChange={(e) => onChange({ rawText: e.target.value })}
                disabled={readOnly}
              />
            </label>

            {!hasInput ? (
              <p className="mt-2 text-[11px] text-muted">
                AI Structure needs an input before Run.
              </p>
            ) : null}
          </section>

          <label className="block text-sm">
            <span className="text-muted">Extra instructions (optional)</span>
            <textarea
              className="input mt-1 min-h-[56px] text-sm"
              placeholder="e.g. Amounts are in ZAR; treat “qty” as integers"
              value={(config.instructions as string) ?? ""}
              onChange={(e) => onChange({ instructions: e.target.value })}
              disabled={readOnly}
            />
          </label>

          <section className="rounded-xl border border-border bg-white px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Output column builder</h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  {builderLocksAi
                    ? "Builder has columns — AI will use this structure on Run (not invent new ones)."
                    : "Builder empty — AI invents columns on Run, then fills this builder with a typed suggestion."}
                </p>
              </div>
              {!readOnly && (
                <div className="flex flex-wrap gap-1.5">
                  {STRUCTURE_SCHEMA_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] font-medium hover:border-accent/40"
                      onClick={() => applyTemplate(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                  {upstreamColumns.length > 0 && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg px-2 py-1 text-[11px] font-medium hover:border-accent/40"
                      onClick={useUpstreamAsSchema}
                    >
                      From upstream
                    </button>
                  )}
                </div>
              )}
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-lg bg-bg px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={Boolean(config.lockSchema) || builderLocksAi}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange({ lockSchema: true });
                  } else {
                    onChange({ lockSchema: false, outputColumns: [] });
                  }
                }}
                disabled={readOnly}
              />
              <span>
                <span className="font-medium text-ink">Use my schema from the builder</span>
                <span className="mt-0.5 block text-muted">
                  Turn off to clear the builder and let AI invent columns again on the next
                  Run.
                </span>
              </span>
            </label>

            {config.schemaAutoFilled ? (
              <p className="mt-2 rounded-lg border border-accent/30 bg-accent-soft/40 px-2.5 py-1.5 text-[11px] text-ink">
                Schema was suggested from the last AI result and loaded into the builder.
                Edit types below, then Run again to keep this shape.
              </p>
            ) : null}

            {suggestionDiffers && !readOnly ? (
              <div className="mt-2 rounded-lg border border-border bg-bg/70 px-2.5 py-2 text-[11px]">
                <p className="font-medium text-ink">AI suggested a different structure</p>
                <p className="mt-0.5 text-muted">
                  {suggested.map((c) => `${c.name} (${c.type})`).join(" · ")}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary mt-2 text-xs"
                  onClick={applySuggestion}
                >
                  Apply suggestion to builder
                </button>
              </div>
            ) : null}

            {columns.length === 0 ? (
              <p className="mt-3 text-xs text-muted">
                No schema yet — pick a template, copy upstream columns, or leave empty for AI
                to suggest after Run.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {columns.map((col, index) => (
                  <li key={`${col.name}-${index}`} className="space-y-1">
                    <div className="grid grid-cols-[1fr_7.5rem_auto] items-center gap-2">
                      <input
                        className="input text-sm"
                        value={col.name}
                        disabled={readOnly}
                        aria-label={`Column ${index + 1} name`}
                        onChange={(e) => updateColumn(index, { name: e.target.value })}
                      />
                      <select
                        className="input text-sm"
                        value={col.type}
                        disabled={readOnly}
                        aria-label={`Column ${index + 1} type`}
                        onChange={(e) =>
                          updateColumn(index, {
                            type: e.target.value as OutputColumnType,
                          })
                        }
                      >
                        <option value="string">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Yes/No</option>
                        <option value="date">Date</option>
                      </select>
                      {!readOnly && (
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-ink"
                          onClick={() => removeColumn(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {col.description ? (
                      <p className="px-0.5 text-[10px] text-muted">{col.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={addColumn}
                >
                  Add column
                </button>
                {columns.length > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-ink"
                    onClick={clearBuilder}
                  >
                    Clear builder (let AI invent)
                  </button>
                ) : null}
              </div>
            )}

            {columns.length > 0 && (
              <p className="mt-3 text-[11px] text-muted">
                Downstream activities can already pick:{" "}
                <span className="font-medium text-ink">
                  {columns.map((c) => c.name).join(", ")}
                </span>
              </p>
            )}
          </section>

          {runTable?.columns?.length ? (
            <section className="rounded-xl border border-border bg-bg/60 px-3 py-2.5">
              <h3 className="text-sm font-semibold">Last structured table</h3>
              <p className="mt-0.5 text-[11px] text-muted">
                {runTable.rows.length} rows · {runTable.columns.join(", ")}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-muted">
                      {runTable.columns.map((c) => (
                        <th key={c} className="px-1.5 py-1 font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runTable.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-border/70">
                        {runTable.columns.map((c) => (
                          <td key={c} className="px-1.5 py-1 text-ink">
                            {row[c] == null ? "—" : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}

      {(() => {
        const report =
          normalizeInsightReport(config.insightReport) ??
          (typeof config.explanation === "string" && config.explanation.trim()
            ? parseInsightReportReply(config.explanation)
            : null);
        if (!report) return null;
        return (
          <div className="rounded-xl border border-border bg-white px-3 py-2.5">
            <h3 className="mb-2 text-sm font-semibold">Latest AI output</h3>
            <AiInsightShowcase report={report} variant="panel" />
            {(blockType === "ai.analyse" || blockType === "ai.explain") &&
            config.table &&
            typeof config.table === "object" &&
            Array.isArray((config.table as TabularData).columns) ? (
              <p className="mt-2 text-[11px] text-muted">
                Out table has {(config.table as TabularData).rows?.length ?? 0} structured
                rows (section, kind, title, detail…) for Chart, Stats, or Structure.
              </p>
            ) : null}
          </div>
        );
      })()}

      {blockType === "ai.chart" &&
      config.suggestedChart &&
      typeof config.suggestedChart === "object" ? (
        <div className="rounded-xl border border-border bg-bg/60 px-3 py-2 text-xs text-muted">
          Suggested:{" "}
          <strong className="text-ink">
            {String(
              (config.suggestedChart as { chartType?: string }).chartType ?? "chart",
            )}
          </strong>{" "}
          · x=
          {String((config.suggestedChart as { xColumn?: string }).xColumn ?? "—")} · y=
          {String((config.suggestedChart as { yColumn?: string }).yColumn ?? "—")}
          <span className="mt-1 block">
            Connect a Chart activity to apply these axes automatically.
          </span>
        </div>
      ) : null}
    </div>
  );
}
