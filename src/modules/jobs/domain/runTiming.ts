/** Human-readable duration between two timestamps (ms). */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remM = mins % 60;
  return remM ? `${hours}h ${remM}m` : `${hours}h`;
}

export function runDurationMs(input: {
  status: string;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  now?: number;
}): number | null {
  const start = input.startedAt
    ? new Date(input.startedAt).getTime()
    : new Date(input.createdAt).getTime();
  if (!Number.isFinite(start)) return null;

  if (input.finishedAt) {
    const end = new Date(input.finishedAt).getTime();
    return Number.isFinite(end) ? Math.max(0, end - start) : null;
  }

  if (input.status === "RUNNING" || input.status === "QUEUED") {
    const now = input.now ?? Date.now();
    return Math.max(0, now - start);
  }

  return null;
}
