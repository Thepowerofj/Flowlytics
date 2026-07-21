"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/shared/lib/formatUi";

export type FlowLastRun = {
  id: string;
  status: string;
  queuePosition?: number | null;
  etaSeconds?: number | null;
  createdAt: string | Date;
  finishedAt?: string | Date | null;
  errorMessage?: string | null;
};

export type FlowListItem = {
  id: string;
  name: string;
  updatedAt: string | Date;
  lastRun?: FlowLastRun | null;
};

type Props = {
  flows: FlowListItem[];
};

function statusLabel(run: FlowLastRun): string {
  if (run.status === "QUEUED") {
    return `Queued #${run.queuePosition ?? "?"}`;
  }
  if (run.status === "RUNNING") return "Running";
  if (run.status === "SUCCEEDED") return "Succeeded";
  if (run.status === "FAILED") return "Failed";
  return run.status;
}

function isActive(status: string) {
  return status === "QUEUED" || status === "RUNNING";
}

export function FlowList({ flows: initial }: Props) {
  const router = useRouter();
  const [flows, setFlows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    setFlows(initial);
  }, [initial]);

  useEffect(() => {
    return () => {
      for (const t of pollTimers.current.values()) clearInterval(t);
      pollTimers.current.clear();
    };
  }, []);

  function stopPoll(flowId: string) {
    const t = pollTimers.current.get(flowId);
    if (t) {
      clearInterval(t);
      pollTimers.current.delete(flowId);
    }
  }

  function startPoll(flowId: string, runId: string, flowName: string) {
    stopPoll(flowId);
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        const body = await res.json();
        if (!res.ok) return;
        setFlows((prev) =>
          prev.map((f) =>
            f.id === flowId
              ? {
                  ...f,
                  lastRun: {
                    id: body.id,
                    status: body.status,
                    queuePosition: body.queuePosition,
                    etaSeconds: body.etaSeconds,
                    createdAt: body.createdAt,
                    finishedAt: body.finishedAt,
                    errorMessage: body.errorMessage,
                  },
                }
              : f,
          ),
        );
        if (!isActive(body.status)) {
          stopPoll(flowId);
          if (body.status === "SUCCEEDED") {
            setNotice(
              `“${flowName}” finished — open the canvas History panel to review results.`,
            );
          } else if (body.status === "FAILED") {
            setNotice(body.errorMessage ?? "Run failed — open the flow to retry.");
          }
        }
      } catch {
        /* soft poll */
      }
    }, 1200);
    pollTimers.current.set(flowId, timer);
  }

  // Soft-poll any runs already in progress when landing on home
  useEffect(() => {
    for (const flow of initial) {
      if (flow.lastRun && isActive(flow.lastRun.status)) {
        startPoll(flow.id, flow.lastRun.id, flow.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per server payload
  }, [initial]);

  async function onRun(flow: FlowListItem) {
    setBusyId(flow.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/flows/${flow.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start run");
        return;
      }
      const lastRun: FlowLastRun = {
        id: data.id,
        status: data.status ?? "QUEUED",
        queuePosition: data.queuePosition,
        etaSeconds: data.etaSeconds,
        createdAt: data.createdAt ?? new Date().toISOString(),
        finishedAt: data.finishedAt ?? null,
        errorMessage: data.errorMessage ?? null,
      };
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, lastRun } : f)));
      setNotice(
        `“${flow.name}” queued in the background (ETA ~${data.etaSeconds ?? "?"}s). You can leave this page — results appear in run history.`,
      );
      startPoll(flow.id, data.id, flow.name);
    } catch {
      setError("Could not start run");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(flow: FlowListItem) {
    const ok = window.confirm(
      `Delete “${flow.name}”? This removes the pipeline, its run history, and schedules.`,
    );
    if (!ok) return;
    setBusyId(flow.id);
    setError(null);
    stopPoll(flow.id);
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not delete flow");
        return;
      }
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      router.refresh();
    } catch {
      setError("Could not delete flow");
    } finally {
      setBusyId(null);
    }
  }

  if (!flows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white/70 px-6 py-10 text-center settle">
        <p className="brand text-2xl text-accent">No flows yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Create one to open the workspace canvas — it should feel as clear as a modern node
          editor from the first click.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {notice ? (
        <p className="rounded-xl border border-border bg-accent-soft/40 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      ) : null}
      {flows.map((flow) => {
        const last = flow.lastRun;
        const running = last ? isActive(last.status) : false;
        return (
          <div
            key={flow.id}
            className="flow-list-row group flex items-stretch gap-2 rounded-2xl border border-border bg-white shadow-soft transition hover:border-accent/40 settle"
          >
            <Link
              href={`/flows/${flow.id}`}
              className="min-w-0 flex-1 px-5 py-4 transition group-hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tracking-tight group-hover:text-accent-deep">
                  {flow.name}
                </span>
                {last ? (
                  <span
                    className={`flow-run-chip flow-run-chip--${last.status.toLowerCase()}`}
                    title={
                      last.errorMessage ||
                      (last.finishedAt
                        ? `Finished ${formatDateTime(last.finishedAt)}`
                        : `Started ${formatDateTime(last.createdAt)}`)
                    }
                  >
                    {statusLabel(last)}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-muted">
                Updated {formatDateTime(flow.updatedAt)}
                {last ? (
                  <>
                    {" · "}
                    <span className="text-ink/70">
                      Last run {formatDateTime(last.createdAt)}
                    </span>
                  </>
                ) : null}
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1 pr-3">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={busyId === flow.id || running}
                onClick={() => void onRun(flow)}
                title={
                  running
                    ? "A run is already in progress in the background"
                    : "Run the last saved pipeline in the background"
                }
                aria-label={`Run ${flow.name}`}
              >
                {busyId === flow.id && !running
                  ? "Starting…"
                  : running
                    ? "Running…"
                    : "Run"}
              </button>
              <Link
                href={`/flows/${flow.id}`}
                className="btn btn-sm btn-ghost"
                title="Open canvas — use History for past results"
              >
                Open
              </Link>
              <button
                type="button"
                className="btn btn-sm btn-ghost text-danger"
                disabled={busyId === flow.id}
                onClick={() => void onDelete(flow)}
                aria-label={`Delete ${flow.name}`}
              >
                {busyId === flow.id && !running ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
