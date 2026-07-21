import type { TabularData } from "@/modules/blocks/domain/types";
import { formatsFromCleanMap } from "./columnFormat";
import {
  defaultColumnTransform,
  type ColumnTransform,
  type CurrencyCode,
} from "./columnTransform";

const SAMPLE_LIMIT = 48;

function nonEmptySamples(
  table: TabularData,
  column: string,
): string[] {
  const out: string[] = [];
  for (const row of table.rows) {
    const v = row[column];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    out.push(s);
    if (out.length >= SAMPLE_LIMIT) break;
  }
  return out;
}

function scoreBoolean(samples: string[]): number {
  let n = 0;
  for (const s of samples) {
    const t = s.toLowerCase();
    if (["true", "false", "yes", "no", "y", "n", "0", "1"].includes(t)) n += 1;
  }
  return samples.length ? n / samples.length : 0;
}

function scoreCurrency(samples: string[]): number {
  let n = 0;
  for (const s of samples) {
    if (/[$€£R¥]/.test(s) || /\bZAR\b/i.test(s) || /\bUSD\b/i.test(s)) n += 1;
  }
  return samples.length ? n / samples.length : 0;
}

function scoreNumber(samples: string[]): number {
  let n = 0;
  for (const s of samples) {
    const cleaned = s
      .replace(/[$€£R¥]/gi, "")
      .replace(/\bZAR\b/gi, "")
      .replace(/%/g, "")
      .replace(/\s/g, "")
      .replace(/,(?=\d{3}(\D|$))/g, "");
    if (/^-?\d+(\.\d+)?$/.test(cleaned) || /^-?\d+,\d{1,2}$/.test(s.trim())) {
      n += 1;
    }
  }
  return samples.length ? n / samples.length : 0;
}

function scoreDate(samples: string[]): number {
  let n = 0;
  for (const s of samples) {
    if (
      /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?/.test(s) ||
      /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s) ||
      /^[A-Za-z]{3,9}[\s,\-]+\d{1,2}/.test(s) ||
      /^\d{1,2}[\s\-]+[A-Za-z]{3,9}/.test(s) ||
      /^[A-Za-z]{3,9}[-/\s.]+\d{2,4}$/.test(s)
    ) {
      n += 1;
    }
  }
  return samples.length ? n / samples.length : 0;
}

function guessCurrencyCode(samples: string[]): CurrencyCode {
  const joined = samples.join(" ");
  if (/€/.test(joined) || /\bEUR\b/i.test(joined)) return "EUR";
  if (/£/.test(joined) || /\bGBP\b/i.test(joined)) return "GBP";
  if (/¥/.test(joined) || /\bJPY\b/i.test(joined)) return "JPY";
  if (/\$/.test(joined) || /\bUSD\b/i.test(joined)) return "USD";
  if (/R\s*\d|^\s*R\b|\bZAR\b/i.test(joined)) return "ZAR";
  return "ZAR";
}

function guessDateFormat(samples: string[]): ColumnTransform["dateFormat"] {
  let iso = 0;
  let dmyHint = 0;
  let mdyHint = 0;
  for (const s of samples) {
    if (/^\d{4}[-/.]\d{1,2}/.test(s)) {
      iso += 1;
      continue;
    }
    const slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!slash) continue;
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    if (a > 12 && b <= 12) dmyHint += 1;
    else if (b > 12 && a <= 12) mdyHint += 1;
  }
  if (iso >= samples.length * 0.5) return "iso";
  if (dmyHint > mdyHint && dmyHint > 0) return "dmy";
  if (mdyHint > dmyHint && mdyHint > 0) return "mdy";
  return "auto";
}

function looksInteger(samples: string[]): boolean {
  let n = 0;
  for (const s of samples) {
    const cleaned = s
      .replace(/[$€£R¥]/gi, "")
      .replace(/\bZAR\b/gi, "")
      .replace(/\s/g, "")
      .replace(/,(?=\d{3}(\D|$))/g, "");
    if (/^-?\d+$/.test(cleaned)) n += 1;
  }
  return samples.length > 0 && n / samples.length >= 0.85;
}

/**
 * Infer an explicit Clean/Map cast for one column from sample values.
 * Prefer decisive types over leaving everything as `auto`.
 */
export function suggestColumnTransform(
  table: TabularData,
  column: string,
): ColumnTransform {
  const base = defaultColumnTransform();
  const samples = nonEmptySamples(table, column);
  if (!samples.length) return base;

  const boolScore = scoreBoolean(samples);
  const currencyScore = scoreCurrency(samples);
  const dateScore = scoreDate(samples);
  const numberScore = scoreNumber(samples);

  // Prefer currency when symbols appear; dates before loose numbers (Excel serials aside)
  if (currencyScore >= 0.35 && numberScore >= 0.5) {
    return {
      ...base,
      type: "currency",
      stripCurrency: true,
      decimals: 2,
      useGrouping: true,
      currencyCode: guessCurrencyCode(samples),
    };
  }
  if (dateScore >= 0.55 && dateScore >= numberScore) {
    return {
      ...base,
      type: "date",
      dateFormat: guessDateFormat(samples),
    };
  }
  if (boolScore >= 0.8) {
    return { ...base, type: "boolean" };
  }
  if (numberScore >= 0.7) {
    return {
      ...base,
      type: "number",
      stripCurrency: /[$€£R¥,]/.test(samples.join("")),
      decimals: looksInteger(samples) ? 0 : null,
      useGrouping: true,
    };
  }
  // Categorical / free text
  return {
    ...base,
    type: "string",
    trim: true,
  };
}

export type SuggestedCleanMapConfig = {
  columnMap: Record<string, string>;
  dropColumns: string[];
  transforms: Record<string, ColumnTransform>;
  _columnFormats: ReturnType<typeof formatsFromCleanMap>;
};

/**
 * Seed Clean/Map with per-column casts (and drop fully empty columns).
 */
export function suggestCleanMapConfig(table: TabularData): SuggestedCleanMapConfig {
  const columnMap: Record<string, string> = {};
  const transforms: Record<string, ColumnTransform> = {};
  const dropColumns: string[] = [];

  for (const col of table.columns) {
    columnMap[col] = col;
    const samples = nonEmptySamples(table, col);
    if (!samples.length && table.rows.length > 0) {
      dropColumns.push(col);
      transforms[col] = defaultColumnTransform();
      continue;
    }
    transforms[col] = suggestColumnTransform(table, col);
  }

  const cfg = { columnMap, dropColumns, transforms, _sourceColumns: table.columns };
  return {
    ...cfg,
    _columnFormats: formatsFromCleanMap(cfg),
  };
}
