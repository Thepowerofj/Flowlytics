"use client";

import { useState } from "react";
import type { ChartSpec } from "@/modules/analyse/domain/charts";
import type { TabularData } from "@/modules/blocks/domain/types";
import { MiniChart } from "@/components/flow/MiniChart";
import { downloadTableCsv } from "@/components/flow/downloadCsv";
import { AskRichText } from "./AskRichText";

export type ClarifyQuestion = {
  id: string;
  prompt: string;
  suggestions: string[];
};

export type AskMessageMeta = {
  kind?: string;
  flowId?: string;
  flowName?: string;
  status?: string;
  openBuilder?: boolean;
  fileId?: string;
  fileName?: string;
  steps?: string[];
  plan?: { title?: string; steps?: string[]; archetype?: string };
  charts?: ChartSpec[];
  tablePreview?: {
    columns: string[];
    rows: Record<string, string | number | null>[];
    rowCount: number;
    fileName?: string;
  };
  exports?: { csv?: boolean; presentation?: boolean };
  questions?: ClarifyQuestion[];
  datasetBrief?: string;
  suggestedGoal?: string;
};

async function downloadRunCsv(runId: string, fileName: string) {
  const res = await fetch(`/api/runs/${runId}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not load run");
  const result = json.resultJson as Record<string, unknown> | null;
  let table: TabularData | null = null;
  const byBlock = result?.byBlockId as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (byBlock) {
    for (const out of Object.values(byBlock)) {
      const t = out.table as TabularData | undefined;
      if (t?.columns?.length) table = t;
    }
  }
  if (!table) {
    const top = result?.table as TabularData | undefined;
    if (top?.columns?.length) table = top;
  }
  if (!table) throw new Error("No table in this run");
  await downloadTableCsv(table, fileName);
}

async function downloadPresentation(runId: string, format: "pdf" | "pptx") {
  const res = await fetch("/api/export/presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId, format }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? "Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flowlytics-${runId.slice(-6)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AskMessageExtras({
  role,
  content,
  runId,
  meta,
  onSuggest,
}: {
  role: string;
  content: string;
  runId: string | null;
  meta?: AskMessageMeta | null;
  onSuggest?: (text: string, opts?: { forceBuild?: boolean }) => void;
}) {
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const isUser = role === "user";
  const charts = meta?.charts?.filter(Boolean) ?? [];
  const preview = meta?.tablePreview;
  const canCsv = Boolean(meta?.exports?.csv && runId);
  const canDeck = Boolean(meta?.exports?.presentation && runId);
  const isClarify = meta?.kind === "clarify";
  const questions = meta?.questions ?? [];

  return (
    <div className="space-y-3">
      {meta?.fileName ? (
        <p className={`text-xs ${isUser ? "text-white/70" : "ask-chip-label"}`}>
          Attached: {meta.fileName}
        </p>
      ) : null}

      {isClarify ? (
        <div className="ask-clarify-badge">Quick scan before we build</div>
      ) : null}

      <AskRichText text={content} tone={isUser ? "inverse" : "default"} />

      {!isUser && isClarify && questions.length ? (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="ask-clarify-block">
              <p className="ask-clarify-block__prompt">{q.prompt}</p>
              <div className="ask-clarify-block__chips">
                {q.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ask-chip"
                    onClick={() => onSuggest?.(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                onSuggest?.(meta?.suggestedGoal || "go ahead", {
                  forceBuild: true,
                })
              }
            >
              Build with defaults
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => onSuggest?.("go ahead", { forceBuild: true })}
            >
              Go ahead
            </button>
          </div>
        </div>
      ) : null}

      {!isUser && charts.length
        ? charts.map((chart, i) => (
            <div key={`${chart.title}-${i}`} className="ask-chart-card">
              <MiniChart chart={chart} size="lg" interactive />
            </div>
          ))
        : null}

      {!isUser && preview?.columns?.length ? (
        <div className="ask-table-card">
          <div className="ask-table-card__head">
            Table preview · {preview.rowCount} row
            {preview.rowCount === 1 ? "" : "s"}
          </div>
          <div className="max-h-40 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-white text-muted">
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-semibold text-accent-deep">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} className="border-t border-border/70">
                    {preview.columns.map((c) => (
                      <td
                        key={c}
                        className="max-w-[9rem] truncate px-2 py-1 text-ink"
                      >
                        {row[c] == null ? "" : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!isUser && (canCsv || canDeck) ? (
        <div className="flex flex-wrap items-center gap-2">
          {canCsv ? (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={exportBusy}
              onClick={() => {
                setExportBusy(true);
                setExportError("");
                void downloadRunCsv(
                  runId!,
                  preview?.fileName || "flowlytics-export.csv",
                )
                  .catch((e) =>
                    setExportError(
                      e instanceof Error ? e.message : "CSV export failed",
                    ),
                  )
                  .finally(() => setExportBusy(false));
              }}
            >
              Download CSV
            </button>
          ) : null}
          {canDeck ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={exportBusy}
                onClick={() => {
                  setExportBusy(true);
                  setExportError("");
                  void downloadPresentation(runId!, "pdf")
                    .catch((e) =>
                      setExportError(
                        e instanceof Error ? e.message : "PDF export failed",
                      ),
                    )
                    .finally(() => setExportBusy(false));
                }}
              >
                Insight PDF
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={exportBusy}
                onClick={() => {
                  setExportBusy(true);
                  setExportError("");
                  void downloadPresentation(runId!, "pptx")
                    .catch((e) =>
                      setExportError(
                        e instanceof Error
                          ? e.message
                          : "PowerPoint export failed",
                      ),
                    )
                    .finally(() => setExportBusy(false));
                }}
              >
                Presentation
              </button>
            </>
          ) : null}
          {exportError ? (
            <span className="text-xs text-danger">{exportError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
