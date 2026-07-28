/** True for call-stack / serialization blow-ups we can recover from. */
export function isStackOverflowError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  return (
    error.name === "RangeError" ||
    /maximum call stack size exceeded/i.test(msg) ||
    /call stack/i.test(msg) ||
    /too much recursion/i.test(msg)
  );
}

type CompactOptions = {
  maxDepth?: number;
  maxTableRows?: number;
  maxArrayItems?: number;
  maxStringChars?: number;
};

const DEFAULT_COMPACT: Required<CompactOptions> = {
  maxDepth: 8,
  maxTableRows: 40,
  maxArrayItems: 80,
  maxStringChars: 2000,
};

/**
 * Shrink large run/graph payloads for Prisma JSON — drops debug tables,
 * caps row samples, and hard-limits nesting so stringify cannot stack-overflow.
 */
export function compactJsonValue(
  value: unknown,
  options: CompactOptions = {},
): unknown {
  const opts = { ...DEFAULT_COMPACT, ...options };
  const seen = new WeakSet<object>();

  function walk(v: unknown, depth: number): unknown {
    if (v == null) return v;
    if (typeof v === "string") {
      return v.length > opts.maxStringChars
        ? `${v.slice(0, opts.maxStringChars)}…`
        : v;
    }
    if (typeof v !== "object") return v;
    if (depth > opts.maxDepth) return "[Truncated: depth]";

    const obj = v as object;
    if (seen.has(obj)) return "[Circular]";
    seen.add(obj);

    if (Array.isArray(v)) {
      // Never push marker strings into typed arrays (breaks insights/points .map in UI)
      return v
        .slice(0, opts.maxArrayItems)
        .map((item) => walk(item, depth + 1));
    }

    const rec = v as Record<string, unknown>;

    // Tabular shape → keep schema + small sample
    if (
      Array.isArray(rec.columns) &&
      Array.isArray(rec.rows) &&
      rec.columns.every((c) => typeof c === "string")
    ) {
      const rows = rec.rows as unknown[];
      return {
        columns: rec.columns,
        rows: rows
          .slice(0, opts.maxTableRows)
          .map((row) => walk(row, depth + 1)),
        _rowCount: rows.length,
        _compacted: rows.length > opts.maxTableRows,
      };
    }

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(rec)) {
      // Never persist full upstream copies / huge debug blobs
      if (key === "_sourceTable") {
        const t = child as { columns?: string[]; rows?: unknown[] } | null;
        if (t?.columns?.length) {
          out._sourceTableSummary = {
            columns: t.columns.slice(0, 24),
            rowCount: Array.isArray(t.rows) ? t.rows.length : 0,
          };
        }
        continue;
      }
      if (key === "points" && Array.isArray(child)) {
        out.points = child
          .slice(0, 48)
          .map((p) => walk(p, depth + 1));
        if (child.length > 48) out._pointsTruncated = child.length;
        continue;
      }
      out[key] = walk(child, depth + 1);
    }
    return out;
  }

  return walk(value, 0);
}

/** Serialize a value into a plain JSON-compatible structure for Prisma Json columns. */
export function toJsonValue<T>(value: T): object {
  const seen = new WeakSet<object>();
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      return v;
    }),
  ) as object;
}

/**
 * Serialize for DB; on stack overflow / serialize failure, compact and retry.
 * Always returns something persistable — never throws stack overflow outward.
 */
export function toJsonValueSafe<T>(
  value: T,
  label = "payload",
): { value: object; compacted: boolean; backupSummary?: string } {
  try {
    return { value: toJsonValue(value), compacted: false };
  } catch (error) {
    if (!isStackOverflowError(error) && !(error instanceof TypeError)) {
      // Still try compact for other stringify failures
    }
  }

  try {
    const compacted = compactJsonValue(value, {
      maxDepth: 6,
      maxTableRows: 20,
      maxArrayItems: 40,
    });
    return {
      value: toJsonValue(compacted),
      compacted: true,
      backupSummary: `Compacted ${label} after serialize stress (tables sampled, depth capped).`,
    };
  } catch {
    return {
      value: {
        _backup: true,
        label,
        note: "Payload omitted after Maximum call stack / serialize failure. Newest context kept in conversation summary instead.",
      },
      compacted: true,
      backupSummary: `Dropped heavy ${label}; using backup stub.`,
    };
  }
}

/** Bounded JSON for LLM prompts — cycle-safe. */
export function safeJsonSlice(value: unknown, maxChars: number): string {
  try {
    const seen = new WeakSet<object>();
    const raw = JSON.stringify(value, (_key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      return v;
    });
    if (!raw) return "null";
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
  } catch (error) {
    if (isStackOverflowError(error)) {
      try {
        return safeJsonSlice(compactJsonValue(value, { maxDepth: 4, maxTableRows: 8 }), maxChars);
      } catch {
        return '"[unserializable: stack overflow]"';
      }
    }
    return '"[unserializable]"';
  }
}
