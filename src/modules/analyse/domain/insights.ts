import type { ColumnDisplayFormat } from "@/modules/ingest/domain/columnFormat";
import { formatDisplayValue } from "@/modules/ingest/domain/columnFormat";
import type { TabularData } from "@/modules/blocks/domain/types";
import type { ForecastResult } from "./forecast";
import {
  columnLooksLikeDate,
  computeStats,
  toNumeric,
  type ColumnStats,
} from "./stats";

export type BusinessInsight = {
  /** Short label for cards / Results headings */
  title: string;
  /** Plain-language finding a non-analyst can act on */
  detail: string;
  kind: "trend" | "driver" | "quality" | "outlook" | "mix" | "action";
};

function fmt(
  value: number | null | undefined,
  format?: ColumnDisplayFormat,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayValue(
    value,
    format ?? { kind: "number", useGrouping: true, decimals: 1 },
  );
}

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Split AI / free-text explanations into readable bullets. */
export function parseInsightBullets(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(0, 8);
  // Single paragraph — split on sentence boundaries when useful
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (sentences.length > 1 && raw.length > 80) return sentences.slice(0, 6);
  return [raw];
}

/**
 * Deterministic business insights from a table — Julius/Power-BI style
 * “what should I notice?” without requiring an LLM.
 */
export function buildBusinessInsights(
  table: TabularData,
  formats?: Record<string, ColumnDisplayFormat>,
  statsIn?: ColumnStats[],
): BusinessInsight[] {
  const stats = statsIn ?? computeStats(table);
  const out: BusinessInsight[] = [];
  const numeric = stats.filter((s) => s.kind === "numeric");
  const categorical = stats.filter((s) => s.kind === "categorical");

  if (!table.rows.length) {
    return [
      {
        title: "No rows yet",
        detail: "Connect upstream data or Run the flow to populate this table.",
        kind: "action",
      },
    ];
  }

  // Quality: missing data
  const dirty = stats
    .filter((s) => (s.nullPct ?? 0) >= 10)
    .sort((a, b) => (b.nullPct ?? 0) - (a.nullPct ?? 0));
  if (dirty[0]) {
    out.push({
      title: "Data gaps",
      detail: `${dirty[0].column} is missing in ${dirty[0].nullPct}% of rows — clean or filter before you decide.`,
      kind: "quality",
    });
  }

  // Primary numeric driver: range + typical band
  const primary = numeric[0];
  if (primary && primary.mean != null) {
    const f = formats?.[primary.column];
    const spread =
      primary.p25 != null && primary.p75 != null
        ? ` Typical values sit between ${fmt(primary.p25, f)} and ${fmt(primary.p75, f)}.`
        : "";
    out.push({
      title: `${primary.column} snapshot`,
      detail: `Average ${fmt(primary.mean, f)} (median ${fmt(primary.median, f)}), from ${fmt(primary.min, f)} to ${fmt(primary.max, f)}.${spread}`,
      kind: "driver",
    });

    // Volatility / consistency
    if (
      primary.stddev != null &&
      primary.mean !== 0 &&
      Math.abs(primary.mean) > 0
    ) {
      const cv = Math.abs(primary.stddev / primary.mean);
      if (cv >= 0.35) {
        out.push({
          title: "High variability",
          detail: `${primary.column} swings a lot relative to its average — look for outliers or seasonality before forecasting.`,
          kind: "trend",
        });
      } else if (cv <= 0.12 && primary.count >= 5) {
        out.push({
          title: "Stable series",
          detail: `${primary.column} is fairly consistent — a simple average or trend forecast is usually enough.`,
          kind: "trend",
        });
      }
    }
  }

  // Category concentration (Pareto-ish)
  const cat = categorical[0];
  if (cat?.topValues?.[0] && cat.count > 0) {
    const top = cat.topValues[0];
    const share = Math.round((top.count / cat.count) * 100);
    out.push({
      title: "Top category",
      detail:
        share >= 45
          ? `${cat.column} is dominated by “${top.value}” (${share}% of rows) — decisions may over-index on that segment.`
          : `Most common ${cat.column}: “${top.value}” (${share}% of rows).`,
      kind: "mix",
    });
  }

  // Time-series style trend when a date column + measure exist
  const dateCol = table.columns.find((c) => columnLooksLikeDate(table, c));
  if (dateCol && primary) {
    const pairs = table.rows
      .map((r) => ({
        t: String(r[dateCol] ?? ""),
        v: toNumeric(r[primary.column]),
      }))
      .filter((p): p is { t: string; v: number } => p.v != null)
      .sort((a, b) => a.t.localeCompare(b.t));
    if (pairs.length >= 3) {
      const first = pairs[0]!.v;
      const last = pairs[pairs.length - 1]!.v;
      const change = pctChange(first, last);
      if (change != null) {
        const direction =
          change > 3 ? "up" : change < -3 ? "down" : "roughly flat";
        out.push({
          title: "Period trend",
          detail: `${primary.column} is ${direction} across ${dateCol} (${change > 0 ? "+" : ""}${change.toFixed(0)}% from first to last point).`,
          kind: "trend",
        });
      }
    }
  }

  // Actionable next step
  if (primary && dateCol) {
    out.push({
      title: "Suggested next step",
      detail: `Forecast ${primary.column} or chart it over ${dateCol} to see the outlook and plan inventory / cash.`,
      kind: "action",
    });
  } else if (primary && cat) {
    out.push({
      title: "Suggested next step",
      detail: `Chart ${primary.column} by ${cat.column} (bar) to see which segment drives the total.`,
      kind: "action",
    });
  } else if (primary) {
    out.push({
      title: "Suggested next step",
      detail: `Add a Chart or Forecast on ${primary.column}, or run AI Analyse for a written read-out.`,
      kind: "action",
    });
  }

  return out.slice(0, 6);
}

/** Plain strings for Stats canvas / summarizeForNode compatibility. */
export function businessInsightLines(
  table: TabularData,
  formats?: Record<string, ColumnDisplayFormat>,
  statsIn?: ColumnStats[],
): string[] {
  return buildBusinessInsights(table, formats, statsIn).map(
    (i) => `${i.title}: ${i.detail}`,
  );
}

/** Forecast-specific KPIs and narrative (answer-first, like Julius). */
export function buildForecastInsights(
  result: ForecastResult,
  format?: ColumnDisplayFormat,
): {
  insights: BusinessInsight[];
  kpis: {
    lastActual: number | null;
    nextForecast: number | null;
    changePct: number | null;
    horizonTotal: number | null;
    bandLow: number | null;
    bandHigh: number | null;
  };
} {
  const lastActual =
    result.actual.length > 0
      ? result.actual[result.actual.length - 1]!
      : null;
  const nextForecast = result.forecast[0] ?? null;
  const changePct =
    lastActual != null && nextForecast != null
      ? pctChange(lastActual, nextForecast)
      : null;
  const horizonTotal = result.forecast.length
    ? result.forecast.reduce((a, b) => a + b, 0)
    : null;
  const bandLow = result.band?.low[0] ?? null;
  const bandHigh = result.band?.high[0] ?? null;

  const insights: BusinessInsight[] = [];
  const methodLabel = result.method.replace(/_/g, " ");

  if (lastActual != null && nextForecast != null) {
    const dir =
      changePct == null
        ? "holds near"
        : changePct > 2
          ? "rises to"
          : changePct < -2
            ? "softens to"
            : "stays near";
    insights.push({
      title: "Next period outlook",
      detail: `${result.column} ${dir} ${fmt(nextForecast, format)} after ${fmt(lastActual, format)} (last history)${
        changePct != null
          ? ` · ${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}%`
          : ""
      }.`,
      kind: "outlook",
    });
  }

  if (horizonTotal != null && result.periods > 1) {
    insights.push({
      title: `Next ${result.periods} periods`,
      detail: `Combined outlook totals about ${fmt(horizonTotal, format)} using ${methodLabel}.`,
      kind: "outlook",
    });
  }

  if (bandLow != null && bandHigh != null) {
    insights.push({
      title: "Uncertainty range",
      detail: `First forecast period may land between ${fmt(bandLow, format)} and ${fmt(bandHigh, format)} (≈95% residual band).`,
      kind: "outlook",
    });
  }

  if (result.actual.length >= 4) {
    const mid = Math.floor(result.actual.length / 2);
    const firstHalf =
      result.actual.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf =
      result.actual.slice(mid).reduce((a, b) => a + b, 0) /
      (result.actual.length - mid);
    const hist = pctChange(firstHalf, secondHalf);
    if (hist != null && Math.abs(hist) >= 8) {
      insights.push({
        title: "History momentum",
        detail: `Recent history is ${hist > 0 ? "stronger" : "weaker"} than earlier periods (${hist > 0 ? "+" : ""}${hist.toFixed(0)}% average).`,
        kind: "trend",
      });
    }
  }

  insights.push({
    title: "How to use this",
    detail:
      "Treat the dashed line as a planning baseline — check the band, then compare actuals next period and adjust.",
    kind: "action",
  });

  return {
    insights: insights.slice(0, 5),
    kpis: {
      lastActual,
      nextForecast,
      changePct,
      horizonTotal,
      bandLow,
      bandHigh,
    },
  };
}
