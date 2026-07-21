export type ColumnDataType =
  | "auto"
  | "string"
  | "number"
  | "currency"
  | "boolean"
  | "date";

export type TextCase = "none" | "lower" | "upper" | "title";

export type CurrencyCode = "ZAR" | "USD" | "EUR" | "GBP" | "JPY" | "NONE";

export type ColumnTransform = {
  /** Target logical type after cleaning */
  type: ColumnDataType;
  trim: boolean;
  textCase: TextCase;
  /** Replace null/blank with this string (empty = leave null) */
  fillNull: string;
  /** Drop row if this column is empty after clean (applied per-column; any true drops) */
  dropIfEmpty: boolean;
  /** For numbers/currency: fixed decimal places; empty = no change (currency defaults to 2 in UI) */
  decimals: number | null;
  /** Strip non-numeric chars before number parse (currency symbols, thousands separators) */
  stripCurrency: boolean;
  /** Display / parse currency (ISO code); used when type is currency */
  currencyCode: CurrencyCode;
  /** Show thousand separators when displaying numbers/currency */
  useGrouping: boolean;
  /** Date parse hint: auto | iso | dmy | mdy */
  dateFormat: "auto" | "iso" | "dmy" | "mdy";
};

export const defaultColumnTransform = (): ColumnTransform => ({
  type: "auto",
  trim: true,
  textCase: "none",
  fillNull: "",
  dropIfEmpty: false,
  decimals: null,
  stripCurrency: false,
  currencyCode: "ZAR",
  useGrouping: true,
  dateFormat: "auto",
});

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

function looksLikeCurrency(value: unknown): boolean {
  const s = String(value ?? "").trim();
  if (!s) return false;
  // Symbols common in SMB sheets (incl. South African Rand)
  if (!/[$€£R¥]/.test(s) && !/\bZAR\b/i.test(s)) return false;
  return parseNumber(s, true) != null;
}

function parseNumber(value: unknown, stripCurrency: boolean): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let s = String(value ?? "").trim();
  if (!s) return null;
  if (stripCurrency) {
    // Drop currency codes/symbols and spaces; keep digits, sign, decimal point
    s = s
      .replace(/\bZAR\b/gi, "")
      .replace(/[$€£R¥]/gi, "")
      .replace(/\s/g, "")
      .replace(/,(?=\d{3}(\D|$))/g, "") // thousands separators
      .replace(/[^0-9.\-]/g, "");
  }
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumberValue(
  value: unknown,
  t: ColumnTransform,
  forceStrip: boolean,
): number | null {
  let n = parseNumber(value, forceStrip || t.stripCurrency);
  if (n == null) return null;
  const decimals =
    t.decimals != null && Number.isFinite(t.decimals)
      ? t.decimals
      : forceStrip && t.decimals == null
        ? 2
        : null;
  if (decimals != null) n = Number(n.toFixed(decimals));
  return n;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(y: number, month: number, day: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (y < 100) y += 2000;
  if (y < 1900 || y > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

/** Excel serial date (days since 1899-12-30); also accepts fractional time-of-day. */
function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null;
  const whole = Math.floor(n);
  // 25569 = Excel serial for 1970-01-01 (UTC)
  const ms = Math.round((whole - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseYmdParts(
  a: number,
  b: number,
  y: number,
  format: ColumnTransform["dateFormat"],
): string | null {
  if (format === "mdy") return toIsoDate(y, a, b);
  if (format === "dmy") return toIsoDate(y, b, a);
  // auto: prefer DMY (common outside US / matches ZAR locale), but if first
  // part can't be a day, try MDY; if day>12, DMY is unambiguous.
  if (a > 12 && b <= 12) return toIsoDate(y, b, a);
  if (b > 12 && a <= 12) return toIsoDate(y, a, b);
  return toIsoDate(y, b, a) ?? toIsoDate(y, a, b);
}

/** Parse cell values into ISO YYYY-MM-DD (UTC calendar date). */
export function parseDate(
  value: unknown,
  format: ColumnTransform["dateFormat"] = "auto",
): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Whole / fractional Excel serials are far more common in sheets than Unix ms
    if (value >= 1 && value < 100_000) return excelSerialToIso(value);
    if (value > 1e11) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Numeric string that looks like an Excel serial
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n >= 20000 && n < 100_000) return excelSerialToIso(n);
  }

  // ISO / SQL date or datetime (prefer before loose Date.parse)
  const iso = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/,
  );
  if (iso && (format === "iso" || format === "auto")) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // Year-month only → first day of month (2024-01, 2024/01)
  const ymIso = raw.match(/^(\d{4})[\/\-.](\d{1,2})$/);
  if (ymIso && (format === "iso" || format === "auto")) {
    return toIsoDate(Number(ymIso[1]), Number(ymIso[2]), 1);
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymd = raw.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})(?:\s+.*)?$/);
  if (ymd && (format === "iso" || format === "auto")) {
    return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  // Strict ISO mode: only accept unambiguous year-first forms above
  if (format === "iso") {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
    return null;
  }

  // Month-year without day → 1st of that month (Jan-24, Jan 2024, January-24)
  const monYear = raw.match(/^([A-Za-z]{3,9})[\/\-\s.]+(\d{2,4})$/);
  if (monYear) {
    const month = MONTHS[monYear[1]!.toLowerCase()];
    if (month) return toIsoDate(Number(monYear[2]), month, 1);
  }

  // Numeric month-year → 1st (01-2024, 1/24)
  const numMonYear = raw.match(/^(\d{1,2})[\/\-.](\d{2,4})$/);
  if (numMonYear) {
    const month = Number(numMonYear[1]);
    const yearToken = numMonYear[2]!;
    const year = Number(yearToken);
    const yearLooksValid =
      yearToken.length === 4 ? year >= 1900 && year <= 2200 : yearToken.length === 2;
    if (month >= 1 && month <= 12 && yearLooksValid) {
      return toIsoDate(year, month, 1);
    }
  }

  // D/M/Y or M/D/Y with optional time suffix (do NOT use Date.parse — US-biased)
  const slash = raw.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+.*)?$/,
  );
  if (slash) {
    return parseYmdParts(
      Number(slash[1]),
      Number(slash[2]),
      Number(slash[3]),
      format,
    );
  }

  // 21 Jan 2024 / 21 January 2024 / Jan 21, 2024 / January 21 2024
  const monName = raw.match(
    /^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s,\-]+(\d{2,4})(?:\s+.*)?$/,
  );
  if (monName) {
    const month = MONTHS[monName[2]!.toLowerCase()];
    if (month) return toIsoDate(Number(monName[3]), month, Number(monName[1]));
  }
  const monFirst = raw.match(
    /^([A-Za-z]{3,9})[\s,\-]+(\d{1,2})(?:st|nd|rd|th)?[\s,\-]+(\d{2,4})(?:\s+.*)?$/,
  );
  if (monFirst) {
    const month = MONTHS[monFirst[1]!.toLowerCase()];
    if (month) return toIsoDate(Number(monFirst[3]), month, Number(monFirst[2]));
  }

  // Last resort for named months / RFC strings — never for numeric slash dates
  if (format === "auto" && /[A-Za-z]/.test(raw)) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }

  return null;
}

export function transformCell(
  value: string | number | null,
  t: ColumnTransform,
): string | number | boolean | null {
  let current: unknown = value;

  if (current == null || current === "") {
    if (t.fillNull !== "") return t.fillNull;
    return null;
  }

  if (typeof current === "string" || t.type === "string" || t.type === "auto") {
    let s = String(current);
    if (t.trim) s = s.trim();
    if (t.textCase === "lower") s = s.toLowerCase();
    if (t.textCase === "upper") s = s.toUpperCase();
    if (t.textCase === "title") s = titleCase(s);
    current = s;
  }

  const target = t.type === "auto" ? inferType(current) : t.type;

  switch (target) {
    case "currency": {
      const n = toNumberValue(current, t, true);
      return n == null ? (t.fillNull !== "" ? t.fillNull : null) : n;
    }
    case "number": {
      const n = toNumberValue(current, t, false);
      return n == null ? (t.fillNull !== "" ? t.fillNull : null) : n;
    }
    case "boolean": {
      const b = parseBoolean(current);
      return b == null ? (t.fillNull !== "" ? t.fillNull : null) : b;
    }
    case "date": {
      const d = parseDate(current, t.dateFormat);
      return d ?? (t.fillNull !== "" ? t.fillNull : null);
    }
    case "string":
    default:
      return current == null ? null : String(current);
  }
}

function inferType(value: unknown): ColumnDataType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  const s = String(value).trim();
  if (parseBoolean(s) != null && ["true", "false", "yes", "no"].includes(s.toLowerCase())) {
    return "boolean";
  }
  if (looksLikeCurrency(s)) return "currency";
  if (parseNumber(s, true) != null && /^-?[\d,.]+%?$/.test(s)) return "number";
  if (parseDate(s, "auto")) return "date";
  return "string";
}

export function applyTableTransforms(
  table: {
    columns: string[];
    rows: Record<string, string | number | null>[];
  },
  options: {
    dropColumns: string[];
    columnMap: Record<string, string>;
    transforms: Record<string, ColumnTransform>;
  },
): {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
} {
  const drop = new Set(options.dropColumns);
  const kept = table.columns.filter((c) => !drop.has(c));
  const columns = kept.map((c) => options.columnMap[c] || c);

  const rows: Record<string, string | number | boolean | null>[] = [];
  for (const row of table.rows) {
    let dropRow = false;
    const next: Record<string, string | number | boolean | null> = {};
    for (const c of kept) {
      const t = options.transforms[c] ?? defaultColumnTransform();
      const outName = options.columnMap[c] || c;
      const cell = transformCell(row[c] ?? null, t);
      if (t.dropIfEmpty && (cell == null || cell === "")) {
        dropRow = true;
        break;
      }
      next[outName] = cell;
    }
    if (!dropRow) rows.push(next);
  }

  return { columns, rows };
}
