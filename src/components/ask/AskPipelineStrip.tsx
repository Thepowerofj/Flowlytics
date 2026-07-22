import Link from "next/link";
import { blockLabel } from "@/modules/blocks/catalog";

type Props = {
  flowId: string | null;
  flowName: string | null;
  steps: string[];
  runStatus: string | null;
};

function statusLabel(status: string | null): { text: string; className: string } {
  if (!status) return { text: "Idle", className: "text-muted" };
  const s = status.toUpperCase();
  if (s === "QUEUED") return { text: "Queued", className: "text-warning" };
  if (s === "RUNNING") return { text: "Running", className: "text-accent-deep" };
  if (s === "SUCCEEDED") return { text: "Succeeded", className: "text-success" };
  if (s === "FAILED" || s === "CANCELLED")
    return { text: s === "FAILED" ? "Failed" : "Cancelled", className: "text-danger" };
  return { text: status, className: "text-muted" };
}

export function AskPipelineStrip({ flowId, flowName, steps, runStatus }: Props) {
  const st = statusLabel(runStatus);
  const labels = steps.map((t) => blockLabel(t));

  return (
    <div className="shrink-0 rounded-xl border border-border bg-bg/80 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Connected pipeline
          </p>
          {flowId ? (
            <p className="truncate text-sm font-medium text-ink">
              {flowName || "Untitled pipeline"}
            </p>
          ) : (
            <p className="text-sm text-muted">
              None yet — send a message to create one
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${st.className}`}>{st.text}</span>
          {flowId ? (
            <Link className="btn btn-sm btn-secondary" href={`/flows/${flowId}`}>
              Open in Builder
            </Link>
          ) : null}
        </div>
      </div>
      {labels.length ? (
        <ol className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
          {labels.map((label, i) => (
            <li key={`${label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <span className="text-border" aria-hidden>→</span> : null}
              <span
                className={
                  runStatus === "RUNNING" || runStatus === "QUEUED"
                    ? "rounded-md bg-white px-1.5 py-0.5 text-ink ring-1 ring-border"
                    : "rounded-md px-1.5 py-0.5"
                }
              >
                {label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
