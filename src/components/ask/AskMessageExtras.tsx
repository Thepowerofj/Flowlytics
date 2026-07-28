"use client";

import { useMemo, useState } from "react";
import {
  normalizeChartSpecs,
  type ChartSpec,
} from "@/modules/analyse/domain/charts";
import type { TabularData } from "@/modules/blocks/domain/types";
import { MiniChart } from "@/components/flow/MiniChart";
import { downloadTableCsv } from "@/components/flow/downloadCsv";
import { AskPipelineProgress } from "./AskPipelineProgress";
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
  currentStepType?: string | null;
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
  onGoAhead,
  liveStatus,
  liveStepType,
}: {
  role: string;
  content: string;
  runId: string | null;
  meta?: AskMessageMeta | null;
  /** Submit collected Q&A only when user confirms Go ahead */
  onGoAhead?: (mergedAnswers: string, opts: { forceBuild: boolean }) => void;
  /** Live poll overrides while this message's run is in flight */
  liveStatus?: string | null;
  liveStepType?: string | null;
}) {
  const [exportError, setExportError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const isUser = role === "user";
  const charts = useMemo(
    () => normalizeChartSpecs(meta?.charts),
    [meta?.charts],
  );
  const preview = meta?.tablePreview;
  const canCsv = Boolean(meta?.exports?.csv && runId);
  const runOk =
    !meta?.status ||
    ["SUCCEEDED", "succeeded"].includes(String(meta.status));
  // Presentation pack can be built from any successful run result
  const canDeck = Boolean(
    runId &&
      runOk &&
      (meta?.exports?.presentation ||
        charts.length > 0 ||
        meta?.kind === "run_result"),
  );
  const stepList = useMemo(() => {
    const fromMeta = meta?.steps;
    const fromPlan = meta?.plan?.steps;
    if (Array.isArray(fromMeta) && fromMeta.length) {
      return fromMeta.filter((t): t is string => typeof t === "string");
    }
    if (Array.isArray(fromPlan) && fromPlan.length) {
      return fromPlan.filter((t): t is string => typeof t === "string");
    }
    return [] as string[];
  }, [meta?.steps, meta?.plan?.steps]);
  const showPipe =
    !isUser &&
    stepList.length > 0 &&
    (meta?.kind === "run_progress" ||
      meta?.kind === "run_result" ||
      meta?.kind === "auto_heal" ||
      Boolean(liveStatus));
  const pipeStatus = liveStatus || meta?.status || null;
  const pipeStep = liveStepType || meta?.currentStepType || null;
  const isClarify = meta?.kind === "clarify";
  const questions = meta?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) init[q.id] = "";
    return init;
  });

  const allAnswered = useMemo(() => {
    if (!questions.length) return true;
    return questions.every((q) => (answers[q.id] || "").trim().length > 0);
  }, [answers, questions]);

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function submitGoAhead() {
    const lines = questions
      .map((q) => {
        const a = (answers[q.id] || "").trim();
        return a ? `${q.prompt}: ${a}` : null;
      })
      .filter(Boolean);
    const merged =
      lines.length > 0
        ? lines.join("; ")
        : meta?.suggestedGoal || "go ahead";
    onGoAhead?.(merged, { forceBuild: true });
  }

  return (
    <div className="space-y-3">
      {meta?.fileName ? (
        <p className={`text-xs ${isUser ? "text-white/70" : "text-muted"}`}>
          Attached: {meta.fileName}
        </p>
      ) : null}

      {isClarify ? (
        <div className="ask-clarify-badge">Answer each question, then Go ahead</div>
      ) : null}

      {showPipe ? (
        <AskPipelineProgress
          flowId={meta?.flowId}
          flowName={meta?.flowName}
          steps={stepList}
          runStatus={pipeStatus}
          currentStepType={pipeStep}
        />
      ) : null}

      {meta?.kind === "run_progress" ? (
        <AskRichText
          text={content.split("\n\n").slice(0, 2).join("\n\n")}
          tone="default"
        />
      ) : (
        <AskRichText text={content} tone={isUser ? "inverse" : "default"} />
      )}

      {!isUser && isClarify && questions.length ? (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="ask-clarify-block">
              <p className="ask-clarify-block__prompt">{q.prompt}</p>
              <div className="ask-clarify-block__chips">
                {q.suggestions.map((s) => {
                  const selected = answers[q.id] === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`ask-chip ${selected ? "ask-chip--selected" : ""}`}
                      onClick={() => setAnswer(q.id, s)}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <label className="mt-2 block text-xs text-muted">
                Your answer
                <input
                  className="input mt-1 text-sm"
                  value={answers[q.id] ?? ""}
                  placeholder="Type or pick a suggestion above"
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              </label>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!allAnswered && questions.length > 0}
              onClick={submitGoAhead}
            >
              Go ahead
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() =>
                onGoAhead?.(meta?.suggestedGoal || "go ahead", {
                  forceBuild: true,
                })
              }
            >
              Use defaults
            </button>
            <span className="text-[11px] text-muted">
              Pipeline only starts after Go ahead
            </span>
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
                    <th key={c} className="px-2 py-1.5 font-semibold">
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
