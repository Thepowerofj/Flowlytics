/** Default client + server limit (overridden server-side by MAX_UPLOAD_BYTES). */
export const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function fileTooLargeMessage(sizeBytes: number, maxBytes: number): string {
  return `File is too large (${formatBytes(sizeBytes)}). Maximum allowed is ${formatBytes(maxBytes)}.`;
}

/** A1-style range, e.g. A1:D50 — optional whitespace ignored. */
export function normalizeExcelRange(range: string | undefined | null): string | undefined {
  if (!range) return undefined;
  const trimmed = range.trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed) return undefined;
  if (!/^[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(trimmed)) {
    throw new Error(
      `Invalid Excel range “${range.trim()}”. Use A1 notation such as A1:D50.`,
    );
  }
  return trimmed;
}
