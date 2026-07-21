"use client";

import { useEffect, useRef } from "react";
import { formatTime as formatUiTime } from "@/shared/lib/formatUi";
import type { RunLogLine } from "./runProgress";

type Props = {
  open: boolean;
  status?: string;
  currentLabel?: string | null;
  lines: RunLogLine[];
  onClose: () => void;
};

function formatTime(iso: string): string {
  const text = formatUiTime(iso, { withSeconds: true });
  return text === "—" ? "--:--:--" : text;
}

export function RunLogPanel({
  open,
  status,
  currentLabel,
  lines,
  onClose,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  if (!open) return null;

  const live = status === "QUEUED" || status === "RUNNING";

  return (
    <section
      className={`run-log ${live ? "run-log--live" : ""}`}
      aria-label="Pipeline run log"
    >
      <header className="run-log__head">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`run-log__live-dot ${live ? "is-on" : ""}`} aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight">Run log</h2>
            {status ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {status}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {live
              ? currentLabel
                ? `Currently on · ${currentLabel}`
                : "Waiting for the worker…"
              : "Latest pipeline execution"}
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
          Hide
        </button>
      </header>
      <div className="run-log__body" ref={scroller}>
        {lines.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted">Waiting for events…</p>
        ) : (
          <ul className="run-log__list">
            {lines.map((line) => (
              <li key={line.id} className={`run-log__line run-log__line--${line.level}`}>
                <time dateTime={line.at}>{formatTime(line.at)}</time>
                <span>{line.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
