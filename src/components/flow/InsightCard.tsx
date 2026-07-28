"use client";

import { asInsightLines } from "@/modules/analyse/domain/charts";
import { parseInsightBullets } from "@/modules/analyse/domain/insights";
import {
  formatDisplayValue,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";

type Props = {
  title?: string;
  /** Free-text AI / forecast explanation */
  explanation?: string;
  /** Pre-split insight lines (may arrive compacted as a plain string) */
  lines?: string[] | string | unknown;
  compact?: boolean;
};

/** Canvas / Results card for written findings (charts + narrative pattern). */
export function InsightCard({
  title = "Insights",
  explanation,
  lines,
  compact,
}: Props) {
  const fromLines = asInsightLines(lines, compact ? 4 : 6);
  const bullets =
    fromLines.length > 0
      ? fromLines
      : explanation
        ? parseInsightBullets(explanation)
        : [];
  if (!bullets.length) {
    return (
      <div className={`insight-card ${compact ? "insight-card--compact" : ""}`}>
        <p className="insight-card__empty">
          Run the flow to generate plain-language findings you can act on.
        </p>
      </div>
    );
  }

  return (
    <div className={`insight-card ${compact ? "insight-card--compact" : ""}`}>
      <p className="insight-card__title">{title}</p>
      <ul className="insight-card__list">
        {bullets.slice(0, compact ? 4 : 6).map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

type KpiProps = {
  lastActual: number | null;
  nextForecast: number | null;
  changePct: number | null;
  valueFormat?: ColumnDisplayFormat;
};

/** KPI strip under forecast charts — last vs next at a glance. */
export function ForecastKpiStrip({
  lastActual,
  nextForecast,
  changePct,
  valueFormat,
}: KpiProps) {
  const fmt = (n: number | null) =>
    n == null
      ? "—"
      : formatDisplayValue(
          n,
          valueFormat ?? { kind: "number", useGrouping: true },
        );
  const changeLabel =
    changePct == null
      ? null
      : `${changePct > 0 ? "+" : ""}${changePct.toFixed(0)}%`;
  const changeClass =
    changePct == null
      ? ""
      : changePct > 2
        ? "forecast-kpi__delta--up"
        : changePct < -2
          ? "forecast-kpi__delta--down"
          : "forecast-kpi__delta--flat";

  return (
    <div className="forecast-kpi nodrag nopan" aria-label="Forecast summary">
      <div className="forecast-kpi__cell">
        <span>Last actual</span>
        <strong>{fmt(lastActual)}</strong>
      </div>
      <div className="forecast-kpi__cell">
        <span>Next forecast</span>
        <strong>{fmt(nextForecast)}</strong>
      </div>
      <div className="forecast-kpi__cell">
        <span>Change</span>
        <strong className={changeClass}>{changeLabel ?? "—"}</strong>
      </div>
    </div>
  );
}
