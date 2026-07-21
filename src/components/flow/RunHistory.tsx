"use client";

import {
  formatDurationMs,
  runDurationMs,
} from "@/modules/jobs/domain/runTiming";
import { formatDateTime } from "@/shared/lib/formatUi";

export type RunHistoryStep = {
  id: string;
  blockId: string;
  blockType: string;
  status: string;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type RunHistoryItem = {
  id: string;
  status: string;
  failedBlockId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  /** True when a pipeline graph was frozen at enqueue. */
  hasSnapshot?: boolean;
  steps?: RunHistoryStep[];
};

type Props = {
  runs: RunHistoryItem[];
  selectedId?: string | null;
  nodeLabels: Record<string, string>;
  onSelect: (runId: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
};

function statusClass(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "run-history__badge--ok";
    case "FAILED":
      return "run-history__badge--err";
    case "RUNNING":
      return "run-history__badge--run";
    case "QUEUED":
      return "run-history__badge--queue";
    default:
      return "";
  }
}

function formatWhen(iso: string): string {
  return formatDateTime(iso);
}

export function RunHistory({
  runs,
  selectedId,
  nodeLabels,
  onSelect,
  onRefresh,
  loading,
}: Props) {
  return (
    <section className="run-history">
      <div className="run-history__head">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Run history</h2>
          <p className="mt-0.5 text-xs text-muted">Past runs · duration · errors</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onRefresh}
            disabled={loading}
          >
            Refresh
          </button>
        )}
      </div>

      <div className="run-history__list">
        {loading && !runs.length ? (
          <p className="px-1 py-2 text-[11px] text-muted">Loading history…</p>
        ) : null}
        {!loading && !runs.length ? (
          <p className="px-1 py-2 text-[11px] leading-snug text-muted">
            No runs yet. Click Run to execute the full pipeline — results and errors
            will show up here.
          </p>
        ) : null}
        <ul className="space-y-1.5">
          {runs.map((run) => {
            const duration = runDurationMs(run);
            const failedLabel = run.failedBlockId
              ? nodeLabels[run.failedBlockId] ??
                run.steps?.find((s) => s.blockId === run.failedBlockId)?.blockType ??
                "block"
              : null;
            const stepErrors =
              run.steps?.filter((s) => s.status === "FAILED" || s.errorMessage) ?? [];
            const selected = selectedId === run.id;

            return (
              <li key={run.id}>
                <button
                  type="button"
                  className={`run-history__item ${selected ? "is-selected" : ""}`}
                  onClick={() => onSelect(run.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`run-history__badge ${statusClass(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="tabular-nums text-[10px] text-muted">
                      {duration != null ? formatDurationMs(duration) : "—"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted">
                    <span>{formatWhen(run.startedAt ?? run.createdAt)}</span>
                    {failedLabel ? (
                      <span className="truncate text-danger">Failed · {failedLabel}</span>
                    ) : run.hasSnapshot ? (
                      <span className="truncate">Has snapshot</span>
                    ) : null}
                  </div>
                  {run.errorMessage ? (
                    <p className="run-history__error" title={run.errorMessage}>
                      {run.errorMessage}
                    </p>
                  ) : null}
                  {selected && stepErrors.length > 0 ? (
                    <ul className="mt-1.5 space-y-1 border-t border-border/70 pt-1.5">
                      {stepErrors.map((step) => (
                        <li key={step.id} className="text-[10px] leading-snug text-danger">
                          <strong className="font-semibold text-ink">
                            {nodeLabels[step.blockId] ?? step.blockType}
                          </strong>
                          {step.errorMessage ? ` — ${step.errorMessage}` : " — failed"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
