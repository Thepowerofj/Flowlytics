"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ScheduleEarlyAccessNotice } from "./ScheduleEarlyAccessNotice";
import type { ScheduleRecord } from "./scheduleTypes";

type FlowOption = {
  id: string;
  name: string;
};

type Props = {
  onCreated: (schedule: ScheduleRecord) => void;
};

export function ScheduleCreateForm({ onCreated }: Props) {
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [flowsLoading, setFlowsLoading] = useState(true);
  const [flowId, setFlowId] = useState("");
  const [mode, setMode] = useState<"daily" | "weekly" | "custom">("daily");
  const [every, setEvery] = useState(6);
  const [unit, setUnit] = useState<"h" | "d">("h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFlowsLoading(true);
      try {
        const res = await fetch("/api/flows");
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Could not load pipelines");
          return;
        }
        const list = (Array.isArray(data) ? data : []) as FlowOption[];
        if (cancelled) return;
        setFlows(list);
        setFlowId((current) => current || list[0]?.id || "");
      } catch {
        if (!cancelled) setError("Could not load pipelines");
      } finally {
        if (!cancelled) setFlowsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!flowId) {
      setError("Select a pipeline to schedule");
      return;
    }
    setBusy(true);
    try {
      const body =
        mode === "custom"
          ? { flowId, cronKind: "custom" as const, every, unit }
          : { flowId, cronKind: mode };

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create schedule");
        return;
      }
      onCreated(data as ScheduleRecord);
      const name = flows.find((f) => f.id === flowId)?.name ?? "Pipeline";
      setOk(`Scheduled “${name}” · ${data.label ?? mode}`);
    } catch {
      setError("Could not create schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="schedule-create" onSubmit={(e) => void submit(e)}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Schedule a pipeline</h2>
        <p className="mt-0.5 text-xs text-muted">
          Pick a flow and how often to re-run it. Same uploads each time until connectors
          ship.
        </p>
      </div>

      <div className="mb-3">
        <ScheduleEarlyAccessNotice />
      </div>

      {flowsLoading ? (
        <p className="text-xs text-muted">Loading pipelines…</p>
      ) : !flows.length ? (
        <p className="rounded-xl border border-dashed border-border bg-bg/50 px-3 py-3 text-xs text-muted">
          No pipelines yet.{" "}
          <Link href="/home" className="font-medium text-accent-deep underline">
            Create a flow
          </Link>{" "}
          first, then come back to schedule it.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">Pipeline</span>
            <select
              className="input mt-1 text-sm"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
              aria-label="Select pipeline"
            >
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm text-muted">Frequency</legend>
            <div className="schedule-create__modes">
              {(
                [
                  ["daily", "Daily"],
                  ["weekly", "Weekly"],
                  ["custom", "Custom"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm ${mode === value ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {mode === "custom" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Every</span>
              <input
                className="input w-16 py-1 text-center text-sm"
                type="number"
                min={1}
                max={unit === "h" ? 168 : 30}
                value={every}
                onChange={(e) => setEvery(Number(e.target.value) || 1)}
                aria-label="Interval amount"
              />
              <select
                className="input py-1 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value as "h" | "d")}
                aria-label="Interval unit"
              >
                <option value="h">hours</option>
                <option value="d">days</option>
              </select>
            </div>
          ) : (
            <p className="text-xs text-muted">
              {mode === "daily"
                ? "Runs about once every 24 hours from when you create the schedule."
                : "Runs about once every 7 days from when you create the schedule."}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={busy || !flowId}
            >
              {busy ? "Scheduling…" : "Add schedule"}
            </button>
            {flowId ? (
              <Link href={`/flows/${flowId}`} className="btn btn-sm btn-ghost">
                Open pipeline
              </Link>
            ) : null}
          </div>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      {ok ? <p className="mt-2 text-xs text-success">{ok}</p> : null}
    </form>
  );
}
