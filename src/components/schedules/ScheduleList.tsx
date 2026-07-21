"use client";

import Link from "next/link";
import { formatDateTime } from "@/shared/lib/formatUi";
import type { ScheduleRecord } from "./scheduleTypes";

type Props = {
  schedules: ScheduleRecord[];
  showFlowName?: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  busyId?: string | null;
};

function formatNext(iso: string): string {
  return formatDateTime(iso);
}

export function ScheduleList({
  schedules,
  showFlowName,
  onToggle,
  onDelete,
  busyId,
}: Props) {
  if (!schedules.length) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-bg/50 px-3 py-4 text-xs text-muted">
        No schedules yet. Use the form to pick a pipeline and set Daily, Weekly, or
        Custom.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {schedules.map((s) => {
        const busy = busyId === s.id;
        return (
          <li key={s.id} className={`schedule-card ${s.enabled ? "" : "is-paused"}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-ink">{s.label}</strong>
                <span className={`schedule-pill ${s.enabled ? "is-on" : "is-off"}`}>
                  {s.enabled ? "On" : "Paused"}
                </span>
              </div>
              {showFlowName && s.flow && (
                <Link
                  href={`/flows/${s.flow.id}`}
                  className="mt-0.5 block truncate text-xs font-medium text-accent-deep hover:underline"
                >
                  {s.flow.name}
                </Link>
              )}
              <p className="mt-1 text-[11px] text-muted">
                Next run · {s.enabled ? formatNext(s.nextRunAt) : "paused"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={busy}
                onClick={() => onToggle(s.id, !s.enabled)}
              >
                {s.enabled ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost text-danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${s.label} schedule${s.flow ? ` for “${s.flow.name}”` : ""}?`,
                    )
                  ) {
                    onDelete(s.id);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
