"use client";

import Link from "next/link";
import { blockLabel } from "@/modules/blocks/catalog";

export type AskPipelineProgressProps = {
  flowId?: string | null;
  flowName?: string | null;
  steps: string[];
  runStatus?: string | null;
  /** Block type currently executing (e.g. analyse.projection) */
  currentStepType?: string | null;
  compact?: boolean;
};

function asStepList(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((t): t is string => typeof t === "string" && t.length > 0);
}

function activeIndex(
  steps: string[],
  status: string | null | undefined,
  currentStepType: string | null | undefined,
): number {
  const s = (status || "").toUpperCase();
  if (s === "SUCCEEDED") return steps.length;
  if (s === "FAILED" || s === "CANCELLED") {
    const i = currentStepType ? steps.indexOf(currentStepType) : -1;
    return i >= 0 ? i : Math.max(0, steps.length - 1);
  }
  if (!steps.length) return -1;
  if (currentStepType) {
    const i = steps.indexOf(currentStepType);
    if (i >= 0) return i;
  }
  if (s === "QUEUED") return 0;
  if (s === "RUNNING") return 0;
  return -1;
}

export function AskPipelineProgress({
  flowId,
  flowName,
  steps,
  runStatus,
  currentStepType,
  compact,
}: AskPipelineProgressProps) {
  const list = asStepList(steps);
  if (!list.length) return null;

  const status = (runStatus || "").toUpperCase();
  const running = status === "QUEUED" || status === "RUNNING";
  const failed = status === "FAILED" || status === "CANCELLED";
  const done = status === "SUCCEEDED";
  const active = activeIndex(list, status, currentStepType);
  const activeLabel =
    active >= 0 && active < list.length
      ? blockLabel(list[active]!)
      : running
        ? "Starting…"
        : done
          ? "Complete"
          : failed
            ? "Stopped"
            : "";

  return (
    <div
      className={`ask-pipe ${running ? "ask-pipe--live" : ""} ${
        compact ? "ask-pipe--compact" : ""
      }`}
      aria-live="polite"
    >
      <div className="ask-pipe__head">
        <div className="min-w-0">
          <p className="ask-pipe__eyebrow">
            {running ? (
              <>
                <span className="ask-pipe__pulse" aria-hidden />
                Processing your data
              </>
            ) : done ? (
              "Pipeline complete"
            ) : failed ? (
              "Pipeline stopped"
            ) : (
              "Connected pipeline"
            )}
          </p>
          <p className="ask-pipe__title truncate">
            {flowName || "Analysis pipeline"}
            {running && activeLabel ? (
              <span className="ask-pipe__now"> · {activeLabel}</span>
            ) : null}
          </p>
        </div>
        {flowId ? (
          <Link className="btn btn-sm btn-secondary shrink-0" href={`/flows/${flowId}`}>
            Open in Builder
          </Link>
        ) : null}
      </div>

      {running ? (
        <div className="ask-pipe__track" aria-hidden>
          <div className="ask-pipe__track-bar" />
        </div>
      ) : null}

      <ol className="ask-pipe__steps">
        {list.map((type, i) => {
          const label = blockLabel(type);
          const isDone = done || i < active;
          const isActive = running && i === active;
          const isFailed = failed && i === active;
          return (
            <li
              key={`${type}-${i}`}
              className={[
                "ask-pipe__step",
                isDone ? "ask-pipe__step--done" : "",
                isActive ? "ask-pipe__step--active" : "",
                isFailed ? "ask-pipe__step--failed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {i > 0 ? (
                <span className="ask-pipe__arrow" aria-hidden>
                  →
                </span>
              ) : null}
              <span className="ask-pipe__chip">
                {isActive ? (
                  <span className="ask-pipe__spinner" aria-hidden />
                ) : isDone ? (
                  <span className="ask-pipe__check" aria-hidden>
                    ✓
                  </span>
                ) : null}
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
