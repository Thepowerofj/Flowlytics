import type { RunState, RunStepState } from "./types";

export type NodeRunVisual =
  | "idle"
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

export type RunLogLevel = "info" | "ok" | "warn" | "error";

export type RunLogLine = {
  id: string;
  at: string;
  level: RunLogLevel;
  message: string;
};

export function nodeRunVisual(
  nodeId: string,
  run: RunState | null,
): NodeRunVisual {
  if (!run) return "idle";

  const step = run.steps?.find((s) => s.blockId === nodeId);
  if (run.failedBlockId === nodeId || step?.status === "FAILED") return "failed";
  if (step?.status === "SUCCEEDED") return "succeeded";
  if (
    (run.status === "RUNNING" && run.currentBlockId === nodeId) ||
    step?.status === "RUNNING"
  ) {
    return "running";
  }

  if (run.status === "QUEUED" || run.status === "RUNNING") {
    return "pending";
  }

  return "idle";
}

export function edgeRunVisual(
  sourceId: string,
  targetId: string,
  run: RunState | null,
): NodeRunVisual {
  if (!run || (run.status !== "QUEUED" && run.status !== "RUNNING" && run.status !== "SUCCEEDED" && run.status !== "FAILED")) {
    return "idle";
  }
  const source = nodeRunVisual(sourceId, run);
  const target = nodeRunVisual(targetId, run);
  if (target === "failed" || source === "failed") return "failed";
  if (target === "running") return "running";
  if (source === "succeeded" && target === "succeeded") return "succeeded";
  if (source === "succeeded" && target === "pending") return "pending";
  if (run.status === "QUEUED" || run.status === "RUNNING") return "pending";
  return "idle";
}

function iso(value?: string | null): string {
  if (value) return value;
  return new Date().toISOString();
}

function stepLabel(
  step: RunStepState,
  labels: Record<string, string>,
): string {
  return labels[step.blockId] ?? step.blockType;
}

/** Build a chronological run log from the latest polled run payload. */
export function buildRunLog(
  run: RunState | null,
  labels: Record<string, string>,
): RunLogLine[] {
  if (!run) return [];
  const lines: RunLogLine[] = [];

  lines.push({
    id: `${run.id}-queued`,
    at: iso(run.createdAt),
    level: "info",
    message:
      run.status === "QUEUED"
        ? `Queued${run.queuePosition != null ? ` · position #${run.queuePosition}` : ""}${
            run.etaSeconds != null ? ` · ETA ~${run.etaSeconds}s` : ""
          }`
        : "Run accepted",
  });

  if (run.startedAt || run.status === "RUNNING" || run.status === "SUCCEEDED" || run.status === "FAILED") {
    lines.push({
      id: `${run.id}-started`,
      at: iso(run.startedAt ?? run.createdAt),
      level: "info",
      message: "Worker started the pipeline",
    });
  }

  for (const step of run.steps ?? []) {
    const name = stepLabel(step, labels);
    lines.push({
      id: `${step.id}-start`,
      at: iso(step.startedAt),
      level: "info",
      message: `Running · ${name}`,
    });
    if (step.status === "SUCCEEDED") {
      lines.push({
        id: `${step.id}-ok`,
        at: iso(step.finishedAt ?? step.startedAt),
        level: "ok",
        message: `Finished · ${name}`,
      });
    } else if (step.status === "FAILED") {
      lines.push({
        id: `${step.id}-err`,
        at: iso(step.finishedAt ?? step.startedAt),
        level: "error",
        message: `Failed · ${name}${step.errorMessage ? ` — ${step.errorMessage}` : ""}`,
      });
    }
  }

  if (run.status === "RUNNING" && run.currentBlockId) {
    const current = labels[run.currentBlockId] ?? "activity";
    const already = (run.steps ?? []).some(
      (s) => s.blockId === run.currentBlockId && s.status === "RUNNING",
    );
    if (!already) {
      lines.push({
        id: `${run.id}-current`,
        at: new Date().toISOString(),
        level: "info",
        message: `Now on · ${current}`,
      });
    }
  }

  if (run.status === "SUCCEEDED") {
    lines.push({
      id: `${run.id}-done`,
      at: iso(run.finishedAt),
      level: "ok",
      message: "Pipeline finished successfully",
    });
  } else if (run.status === "FAILED") {
    lines.push({
      id: `${run.id}-failed`,
      at: iso(run.finishedAt),
      level: "error",
      message: run.errorMessage
        ? `Pipeline failed — ${run.errorMessage}`
        : "Pipeline failed",
    });
  }

  return lines;
}
