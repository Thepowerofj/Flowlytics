import type { TabularData } from "@/modules/blocks/domain/types";

export type OutputColumnType = "string" | "number" | "boolean" | "date";

export type OutputColumnSpec = {
  name: string;
  type: OutputColumnType;
  /** Short hint for the model (and UI). */
  description?: string;
};

export const OUTPUT_COLUMN_TYPES: OutputColumnType[] = [
  "string",
  "number",
  "boolean",
  "date",
];

/** Common starter schemas for messy SMB notes. */
export const STRUCTURE_SCHEMA_TEMPLATES: {
  id: string;
  label: string;
  columns: OutputColumnSpec[];
}[] = [
  {
    id: "sales",
    label: "Sales lines",
    columns: [
      { name: "date", type: "date", description: "Sale or invoice date" },
      { name: "item", type: "string", description: "Product or service" },
      { name: "qty", type: "number", description: "Quantity" },
      { name: "amount", type: "number", description: "Line total" },
      { name: "customer", type: "string", description: "Customer name if present" },
    ],
  },
  {
    id: "contacts",
    label: "Contacts",
    columns: [
      { name: "name", type: "string" },
      { name: "email", type: "string" },
      { name: "phone", type: "string" },
      { name: "company", type: "string" },
      { name: "notes", type: "string" },
    ],
  },
  {
    id: "expenses",
    label: "Expenses",
    columns: [
      { name: "date", type: "date" },
      { name: "category", type: "string" },
      { name: "vendor", type: "string" },
      { name: "amount", type: "number" },
      { name: "notes", type: "string" },
    ],
  },
];

export function sanitizeColumnName(raw: string, fallback = "column"): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .replace(/^(\d)/, "_$1");
  return cleaned || fallback;
}

export function normalizeOutputColumns(
  raw: unknown,
): OutputColumnSpec[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OutputColumnSpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = sanitizeColumnName(String(row.name ?? ""), "");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const type = OUTPUT_COLUMN_TYPES.includes(row.type as OutputColumnType)
      ? (row.type as OutputColumnType)
      : "string";
    const description =
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim().slice(0, 120)
        : undefined;
    out.push(description ? { name, type, description } : { name, type });
  }
  return out;
}

export function schemaColumnNames(schema: OutputColumnSpec[]): string[] {
  return schema.map((c) => c.name);
}

/** Empty table shaped like the configured output — for canvas auto-map before Run. */
export function previewTableFromSchema(schema: OutputColumnSpec[]): TabularData | null {
  const columns = schemaColumnNames(normalizeOutputColumns(schema));
  if (!columns.length) return null;
  return { columns, rows: [] };
}

export function parseLlmJson(reply: string): unknown {
  const trimmed = String(reply ?? "").trim();
  if (!trimmed) throw new Error("AI returned an empty response");

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.search(/[\[{]/);
    const endObj = unfenced.lastIndexOf("}");
    const endArr = unfenced.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON");
  }
}

function coerceCell(
  value: unknown,
  type: OutputColumnType,
): string | number | null {
  if (value == null || value === "") return null;
  if (type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const stripped = String(value).replace(/[^0-9.\-]/g, "");
    if (!stripped || stripped === "-" || stripped === "." || stripped === "-.") {
      return null;
    }
    const n = Number(stripped);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value ? 1 : 0;
    const s = String(value).trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(s)) return 1;
    if (["false", "no", "n", "0"].includes(s)) return 0;
    return null;
  }
  // string + date stored as ISO/date text for spreadsheet friendliness
  return String(value);
}

/**
 * Force model output into a stable TabularData.
 * When a schema is provided, columns follow that order and missing cells become null.
 */
export function normalizeStructuredTable(
  raw: unknown,
  schema: OutputColumnSpec[] = [],
): TabularData {
  const specs = normalizeOutputColumns(schema);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  let columns: string[] = [];
  let rowsIn: Record<string, unknown>[] = [];

  if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
    columns = obj.columns.map((c, i) => sanitizeColumnName(String(c), `col_${i + 1}`));
    rowsIn = (obj.rows as unknown[]).filter(
      (r): r is Record<string, unknown> => Boolean(r) && typeof r === "object",
    );
  } else if (Array.isArray(raw)) {
    // Array of objects
    rowsIn = raw.filter(
      (r): r is Record<string, unknown> => Boolean(r) && typeof r === "object",
    );
    const keys = new Set<string>();
    for (const r of rowsIn.slice(0, 50)) {
      for (const k of Object.keys(r)) keys.add(sanitizeColumnName(k));
    }
    columns = [...keys];
  } else {
    throw new Error('AI JSON must be {"columns":string[],"rows":object[]}');
  }

  if (specs.length) {
    columns = specs.map((s) => s.name);
  } else {
    // de-dupe while preserving order
    const seen = new Set<string>();
    columns = columns.filter((c) => {
      if (!c || seen.has(c)) return false;
      seen.add(c);
      return true;
    });
  }

  if (!columns.length) {
    throw new Error("AI returned no columns");
  }

  const typeByCol = new Map(specs.map((s) => [s.name, s.type] as const));

  const rows = rowsIn.slice(0, 500).map((row) => {
    const out: Record<string, string | number | null> = {};
    for (const col of columns) {
      const type = typeByCol.get(col) ?? "string";
      // Accept both exact and loosely matched keys from the model
      const direct = row[col];
      const loose =
        direct !== undefined
          ? direct
          : Object.entries(row).find(([k]) => {
              const key = sanitizeColumnName(k);
              return key === col || key.toLowerCase() === col.toLowerCase();
            })?.[1];
      out[col] = coerceCell(loose, type);
    }
    return out;
  });

  return { columns, rows };
}

export function buildStructurePrompt(opts: {
  raw: string;
  schema: OutputColumnSpec[];
  instructions?: string;
}): string {
  const schema = normalizeOutputColumns(opts.schema);
  const schemaBlock = schema.length
    ? `Use EXACTLY these columns (in this order):\n${JSON.stringify(
        schema.map((c) => ({
          name: c.name,
          type: c.type,
          description: c.description ?? "",
        })),
        null,
        0,
      )}\nCoerce values to the given types. Use null when a value is missing.`
    : "Infer sensible snake_case column names from the data.";

  const extra =
    opts.instructions?.trim()
      ? `\nEXTRA INSTRUCTIONS:\n${opts.instructions.trim().slice(0, 800)}`
      : "";

  return `You clean messy small-business notes into a spreadsheet table.
Reply with JSON only (no markdown): {"columns":string[],"rows":object[]}.
${schemaBlock}
Keep at most 200 rows. Prefer short cell values.${extra}

DATA:
${opts.raw.slice(0, 6000)}`;
}

/** Build a short raw payload from an upstream table for structure/analyse prompts. */
export function tableToPromptSample(table: TabularData, maxRows = 20): string {
  const header = `COLUMNS: ${table.columns.join(", ")}`;
  const body = table.rows
    .slice(0, maxRows)
    .map((r) => JSON.stringify(r))
    .join("\n");
  return body ? `${header}\n${body}` : header;
}

/** Combine wired table + optional pasted notes into one LLM payload. */
export function buildStructureRawInput(opts: {
  table?: TabularData | null;
  rawText?: string;
  textInput?: string;
}): string {
  const parts: string[] = [];
  if (opts.table?.columns?.length) {
    parts.push(tableToPromptSample(opts.table));
  }
  const notes = [opts.rawText, opts.textInput]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (notes.length) {
    parts.push(`NOTES:\n${notes.join("\n\n")}`);
  }
  return parts.join("\n\n").slice(0, 6000);
}

function looksLikeDate(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return true;
  return false;
}

function looksLikeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  const s = String(value).trim().toLowerCase();
  return ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(s);
}

function looksLikeNumber(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;
  const cleaned = s.replace(/[R$€£¥,\s]/gi, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned));
}

export function inferColumnType(
  values: unknown[],
): OutputColumnType {
  const sample = values.filter((v) => v != null && v !== "").slice(0, 40);
  if (!sample.length) return "string";
  const dateHits = sample.filter(looksLikeDate).length;
  if (dateHits / sample.length >= 0.6) return "date";
  const boolHits = sample.filter(looksLikeBoolean).length;
  if (boolHits / sample.length >= 0.8) return "boolean";
  const numHits = sample.filter(looksLikeNumber).length;
  if (numHits / sample.length >= 0.7) return "number";
  return "string";
}

/**
 * Suggest a builder schema from a structured table (after AI Run).
 * Types are inferred from sample values so the builder stays useful for the next run.
 */
export function inferSchemaFromTable(table: TabularData): OutputColumnSpec[] {
  return table.columns.map((name) => {
    const values = table.rows.map((r) => r[name]);
    const type = inferColumnType(values);
    const nonNull = values.filter((v) => v != null && v !== "").length;
    const description =
      nonNull > 0
        ? `Suggested from ${nonNull} filled values · type ${type}`
        : `Suggested column · type ${type}`;
    return { name, type, description };
  });
}

export function schemasEqual(
  a: OutputColumnSpec[],
  b: OutputColumnSpec[],
): boolean {
  const left = normalizeOutputColumns(a);
  const right = normalizeOutputColumns(b);
  if (left.length !== right.length) return false;
  return left.every(
    (col, i) => col.name === right[i]!.name && col.type === right[i]!.type,
  );
}
