import { DISPLAY_LOCALE } from "@/shared/lib/formatUi";
import type { ColumnTransform, CurrencyCode } from "./columnTransform";

export type { CurrencyCode };

export const CURRENCY_OPTIONS: { code: CurrencyCode; label: string }[] = [
  { code: "ZAR", label: "South African Rand (R)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "JPY", label: "Japanese Yen (¥)" },
  { code: "NONE", label: "Number only (no currency symbol)" },
];

export type ColumnDisplayFormat = {
  kind: "number" | "currency" | "date" | "string" | "boolean";
  currencyCode?: CurrencyCode;
  decimals?: number | null;
  /** Show thousand separators (e.g. 1,234.56). */
  useGrouping?: boolean;
};

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  ZAR: "en-ZA",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  NONE: "en-US",
};

export function displayFormatFromTransform(t: ColumnTransform): ColumnDisplayFormat {
  const type = t.type === "auto" ? "string" : t.type;
  if (type === "currency") {
    return {
      kind: "currency",
      currencyCode: t.currencyCode ?? "ZAR",
      decimals: t.decimals ?? 2,
      useGrouping: t.useGrouping ?? true,
    };
  }
  if (type === "number") {
    return {
      kind: "number",
      decimals: t.decimals,
      useGrouping: t.useGrouping ?? true,
    };
  }
  if (type === "date") return { kind: "date" };
  if (type === "boolean") return { kind: "boolean" };
  return { kind: "string" };
}

/** Build output-column formats from Clean/Map transforms (after rename/drop). */
export function formatsFromCleanMap(config: {
  columnMap?: Record<string, string>;
  dropColumns?: string[];
  transforms?: Record<string, ColumnTransform>;
  _sourceColumns?: string[];
  table?: { columns?: string[] } | null;
}): Record<string, ColumnDisplayFormat> {
  const drop = new Set(config.dropColumns ?? []);
  const columnMap = config.columnMap ?? {};
  const transforms = config.transforms ?? {};
  const sources =
    config._sourceColumns ??
    config.table?.columns ??
    Object.keys(transforms);

  const out: Record<string, ColumnDisplayFormat> = {};
  for (const src of sources) {
    if (drop.has(src)) continue;
    const name = columnMap[src] || src;
    const t = transforms[src];
    out[name] = t
      ? displayFormatFromTransform(t)
      : { kind: "string" };
  }
  return out;
}

export function formatDisplayValue(
  value: unknown,
  fmt?: ColumnDisplayFormat | null,
): string {
  if (value == null || value === "") return "—";

  if (fmt?.kind === "boolean") {
    return value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : String(value);
  }

  if (fmt?.kind === "date") {
    const s = String(value).trim();
    // Prefer a clear calendar form when we already have ISO YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
      if (!Number.isNaN(d.getTime())) {
        try {
          return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(d);
        } catch {
          return `${iso[1]}-${iso[2]}-${iso[3]}`;
        }
      }
    }
    return s;
  }

  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))
        ? Number(value)
        : null;

  if (n != null && Number.isFinite(n) && (fmt?.kind === "number" || fmt?.kind === "currency")) {
    const decimals =
      fmt.decimals != null && Number.isFinite(fmt.decimals) ? fmt.decimals : fmt.kind === "currency" ? 2 : undefined;
    const useGrouping = fmt.useGrouping !== false;

    if (fmt.kind === "currency" && fmt.currencyCode && fmt.currencyCode !== "NONE") {
      try {
        return new Intl.NumberFormat(CURRENCY_LOCALE[fmt.currencyCode], {
          style: "currency",
          currency: fmt.currencyCode,
          minimumFractionDigits: decimals ?? 2,
          maximumFractionDigits: decimals ?? 2,
          useGrouping,
        }).format(n);
      } catch {
        /* fall through */
      }
    }

    return new Intl.NumberFormat(CURRENCY_LOCALE[fmt.currencyCode ?? "NONE"], {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? (Number.isInteger(n) ? 0 : 2),
      useGrouping,
    }).format(n);
  }

  return String(value);
}

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  ZAR: "R",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  NONE: "",
};

/** Deterministic compact number (avoids Node vs browser Intl compact mismatches). */
function compactMagnitude(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (Number.isInteger(abs)) return `${sign}${abs}`;
  return `${sign}${abs.toFixed(1)}`;
}

/**
 * Compact axis/tooltip form. Large totals shorten (12.5k / 1.2M) but keep
 * currency symbols when the column is currency-typed.
 */
export function formatChartValue(
  value: number,
  fmt?: ColumnDisplayFormat | null,
): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const compact = abs >= 1000;

  if (fmt?.kind === "currency" && fmt.currencyCode && fmt.currencyCode !== "NONE") {
    if (compact) {
      const sym = CURRENCY_SYMBOL[fmt.currencyCode] || `${fmt.currencyCode} `;
      const sign = value < 0 ? "-" : "";
      return `${sign}${sym}${compactMagnitude(Math.abs(value))}`;
    }
    return formatDisplayValue(value, fmt);
  }

  if (fmt?.kind === "number" || fmt?.kind === "currency") {
    if (compact) return compactMagnitude(value);
    return formatDisplayValue(value, {
      ...fmt,
      kind: "number",
      useGrouping: fmt.useGrouping !== false,
    });
  }

  if (compact) return compactMagnitude(value);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

/** Prefer the measure column format, then a shared `value` key (forecast series). */
export function resolveValueFormat(
  formats: Record<string, ColumnDisplayFormat> | undefined | null,
  column?: string | null,
): ColumnDisplayFormat | undefined {
  if (!formats) return undefined;
  if (column && formats[column]) return formats[column];
  if (formats.value) return formats.value;
  // After Aggregate → Forecast, keep any single currency measure if names drifted
  const currency = Object.values(formats).filter((f) => f?.kind === "currency");
  if (currency.length === 1) return currency[0];
  return undefined;
}
