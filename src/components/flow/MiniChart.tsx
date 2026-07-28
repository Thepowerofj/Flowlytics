"use client";

import { useState } from "react";
import {
  normalizeChartSpec,
  truncateChartPoints,
  type ChartSpec,
} from "@/modules/analyse/domain/charts";
import {
  formatChartValue,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import { useElementSize } from "./useElementSize";

type Props = {
  chart: ChartSpec;
  /** Compact strip vs full activity showcase with labels */
  size?: "sm" | "lg";
  /** Enable hover/click tooltips (default on for lg) */
  interactive?: boolean;
};

const COLORS = ["#0D9488", "#0F766E", "#3D5A52", "#A16207", "#5A6E67", "#027A48", "#14B8A6"];

type Tip = {
  x: string;
  y: number;
  color?: string;
  low?: number | null;
  high?: number | null;
} | null;

function fmt(n: number, valueFormat?: ColumnDisplayFormat): string {
  return formatChartValue(n, valueFormat);
}

function TruncationNotice({
  shown,
  total,
}: {
  shown: number;
  total?: number;
}) {
  if (!total || total <= shown) return null;
  return (
    <p className="chart-viz__truncate" role="note">
      Showing top {shown} of {total} — open Edit for full detail / download
    </p>
  );
}

function ChartInsights({ lines }: { lines?: unknown }) {
  // Guard compacted/corrupt meta (insights sometimes arrives as a plain string)
  const items = Array.isArray(lines)
    ? lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0)
    : typeof lines === "string" && lines.trim()
      ? lines
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  if (!items.length) return null;
  return (
    <ul className="chart-viz__insights">
      {items.slice(0, 3).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** Always mounts the same footprint so hover never shifts the chart layout. */
function ChartTooltip({
  tip,
  valueFormat,
}: {
  tip: Tip;
  valueFormat?: ColumnDisplayFormat;
}) {
  return (
    <div
      className={`chart-tooltip ${tip ? "is-active" : "is-idle"}`}
      role="status"
      aria-live="polite"
    >
      <span
        className="chart-tooltip__dot"
        style={{ background: tip?.color ?? "var(--border)" }}
        aria-hidden
      />
      <strong title={tip?.x ?? undefined}>
        {tip ? tip.x : "Hover or click a point"}
      </strong>
      <span aria-hidden={!tip}>
        {tip
          ? tip.low != null && tip.high != null
            ? `${fmt(tip.y, valueFormat)} (${fmt(tip.low, valueFormat)}–${fmt(tip.high, valueFormat)})`
            : fmt(tip.y, valueFormat)
          : "—"}
      </span>
    </div>
  );
}

export function MiniChart({ chart, size = "sm", interactive }: Props) {
  const isInteractive = interactive ?? size === "lg";
  const safe = normalizeChartSpec(chart);

  if (!safe) {
    return <p className="text-[11px] text-muted">No chartable points yet</p>;
  }

  if (safe.type === "pie") {
    return <PieChart chart={safe} size={size} interactive={isInteractive} />;
  }
  if (safe.type === "line") {
    return <LineChart chart={safe} size={size} interactive={isInteractive} />;
  }
  return <BarChart chart={safe} size={size} interactive={isInteractive} />;
}

function BarChart({
  chart,
  size,
  interactive,
}: {
  chart: ChartSpec;
  size: "sm" | "lg";
  interactive: boolean;
}) {
  const [plotRef, plotSize] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Tip>(null);
  const [pinned, setPinned] = useState<Tip>(null);
  const tip = pinned ?? hover;

  const maxPoints = size === "lg" ? 12 : 8;
  const points = chart.points.slice(0, maxPoints);
  const max = Math.max(...points.map((p) => p.y), 1);
  const barMax = size === "lg" ? Math.max(120, plotSize.height || 160) : 64;

  return (
    <div
      className={`nodrag nopan chart-viz chart-viz--${size} ${
        interactive ? "chart-viz--interactive" : ""
      }`}
    >
      <div className="chart-viz__title-row">
        <div className="chart-viz__title">{chart.title}</div>
        {interactive ? <ChartTooltip tip={tip} valueFormat={chart.valueFormat} /> : null}
      </div>
      <div className="chart-viz__plot" ref={plotRef}>
        <div className="chart-viz__y-axis" aria-hidden>
          <span>{fmt(max, chart.valueFormat)}</span>
          <span>{fmt(max / 2, chart.valueFormat)}</span>
          <span>0</span>
        </div>
        <div
          className={`chart-viz__bars ${size === "lg" ? "chart-viz__bars--fill" : ""}`}
          style={size === "sm" ? { height: barMax } : undefined}
          onMouseLeave={() => setHover(null)}
        >
          {points.map((p) => {
            const pct = Math.max(10, (p.y / max) * 100);
            const active = tip?.x === p.x;
            return (
              <button
                key={p.x}
                type="button"
                className={`chart-viz__bar-col ${active ? "is-active" : ""}`}
                title={`${p.x}: ${p.y}`}
                disabled={!interactive}
                onMouseEnter={() =>
                  interactive && setHover({ x: p.x, y: p.y, color: "#0D9488" })
                }
                onFocus={() =>
                  interactive && setHover({ x: p.x, y: p.y, color: "#0D9488" })
                }
                onBlur={() => setHover(null)}
                onClick={() => {
                  if (!interactive) return;
                  setPinned((prev) =>
                    prev?.x === p.x ? null : { x: p.x, y: p.y, color: "#0D9488" },
                  );
                }}
              >
                {/* Values always reserved so hover never toggles layout */}
                <span className={`chart-viz__value ${size === "lg" ? "" : "chart-viz__value--hidden"}`}>
                  {fmt(p.y, chart.valueFormat)}
                </span>
                <div className="chart-viz__bar-track">
                  <div
                    className="chart-viz__bar"
                    style={
                      size === "lg"
                        ? { height: `${pct}%` }
                        : { height: Math.max(6, (p.y / max) * (barMax - 4)) }
                    }
                  />
                </div>
                <span className={`chart-viz__xlabel ${size === "lg" ? "" : "chart-viz__xlabel--hidden"}`}>
                  {p.x}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="chart-viz__axis-labels">
        <span>{chart.xLabel}</span>
        <span>{chart.yLabel}</span>
      </div>
      <TruncationNotice shown={points.length} total={chart.totalPoints} />
      {size === "lg" ? <ChartInsights lines={chart.insights} /> : null}
    </div>
  );
}

function LineChart({
  chart,
  size,
  interactive,
}: {
  chart: ChartSpec;
  size: "sm" | "lg";
  interactive: boolean;
}) {
  const [plotRef, plotSize] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Tip>(null);
  const [pinned, setPinned] = useState<Tip>(null);
  const tip = pinned ?? hover;

  const maxPoints = size === "lg" ? 20 : 24;
  const pts = truncateChartPoints(chart.points, maxPoints);
  const bandVals = pts.flatMap((p) =>
    [p.y, p.low, p.high].filter((v): v is number => v != null && Number.isFinite(v)),
  );
  let max = 1;
  let min = 0;
  for (const v of bandVals) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  const span = max - min || 1;
  const hasBand = pts.some(
    (p) =>
      p.series === "Forecast" &&
      p.low != null &&
      p.high != null &&
      Number.isFinite(p.low) &&
      Number.isFinite(p.high),
  );

  const w = size === "lg" ? Math.max(200, plotSize.width || 360) : 180;
  const h = size === "lg" ? Math.max(120, plotSize.height || 180) : 72;
  // Keep geometry + axis/value labels inside the card (currency labels need room)
  const padL = size === "lg" ? 44 : 0;
  const padR = size === "lg" ? 14 : 0;
  const padT = size === "lg" ? 16 : 0;
  const padB = size === "lg" ? 24 : 0;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padB - padT);

  const firstForecastIdx = pts.findIndex((q) => q.series === "Forecast");
  const coords = pts.map((p, i) => {
    const x = padL + (i / Math.max(pts.length - 1, 1)) * plotW;
    const yInPlot = ((p.y - min) / span) * Math.max(1, plotH - 10);
    const series =
      p.series ??
      (chart.forecastSplit && firstForecastIdx >= 0 && i >= firstForecastIdx
        ? ("Forecast" as const)
        : ("Actual" as const));
    return {
      x,
      y: padT + (plotH - yInPlot - 5),
      label: p.x,
      value: p.y,
      isForecast: Boolean(chart.forecastSplit && series === "Forecast"),
    };
  });

  const actualCoords = coords.filter((c) => !c.isForecast);
  const forecastCoords = coords.filter((c) => c.isForecast);
  // Connect last actual to first forecast for continuity
  const forecastPathCoords =
    actualCoords.length && forecastCoords.length
      ? [actualCoords[actualCoords.length - 1]!, ...forecastCoords]
      : forecastCoords;

  function pathOf(
    list: { x: number; y: number }[],
  ): string {
    return list
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
  }

  const dActual = pathOf(chart.forecastSplit ? actualCoords : coords);
  const dForecast = chart.forecastSplit ? pathOf(forecastPathCoords) : "";

  // Confidence band polygon under the forecast segment
  let dBand = "";
  if (hasBand && forecastCoords.length) {
    const bandPts = pts
      .map((p, i) => ({ p, c: coords[i]! }))
      .filter(
        ({ p }) =>
          p.series === "Forecast" &&
          p.low != null &&
          p.high != null,
      );
    if (bandPts.length) {
      const yOf = (v: number) => {
        const yInPlot = ((v - min) / span) * Math.max(1, plotH - 10);
        return padT + (plotH - yInPlot - 5);
      };
      const top = bandPts.map(
        ({ p, c }) => `${c.x.toFixed(1)},${yOf(p.high!).toFixed(1)}`,
      );
      const bottom = [...bandPts]
        .reverse()
        .map(({ p, c }) => `${c.x.toFixed(1)},${yOf(p.low!).toFixed(1)}`);
      dBand = `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
    }
  }

  const labelEvery = Math.max(1, Math.ceil(coords.length / 5));

  return (
    <div
      className={`nodrag nopan chart-viz chart-viz--${size} ${
        interactive ? "chart-viz--interactive" : ""
      }`}
    >
      <div className="chart-viz__title-row">
        <div className="chart-viz__title">{chart.title}</div>
        {interactive ? <ChartTooltip tip={tip} valueFormat={chart.valueFormat} /> : null}
      </div>
      <div className="chart-viz__line-host" ref={plotRef}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          className={size === "lg" ? "chart-viz__line-svg" : "h-[72px]"}
        >
          {size === "lg" && (
            <>
              <line
                x1={padL}
                y1={padT}
                x2={padL}
                y2={padT + plotH}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <line
                x1={padL}
                y1={padT + plotH}
                x2={w - padR}
                y2={padT + plotH}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={padL - 4}
                y={padT + 10}
                textAnchor="end"
                className="chart-viz__svg-label"
              >
                {fmt(max, chart.valueFormat)}
              </text>
              <text
                x={padL - 4}
                y={padT + plotH}
                textAnchor="end"
                className="chart-viz__svg-label"
              >
                {fmt(min, chart.valueFormat)}
              </text>
            </>
          )}
          {dBand ? (
            <path
              d={dBand}
              fill="var(--forecast)"
              fillOpacity="0.14"
              stroke="none"
              pointerEvents="none"
            />
          ) : null}
          {dActual ? (
            <path
              d={dActual}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.25"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {dForecast ? (
            <path
              d={dForecast}
              fill="none"
              stroke="var(--forecast)"
              strokeWidth="2.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {coords.map((c, i) => {
            const active = tip?.x === c.label;
            const r = size === "lg" ? (c.isForecast ? 4 : 3.5) : 2;
            const color = c.isForecast ? "var(--forecast)" : "#0D9488";
            const src = pts[i];
            return (
              <g key={`${c.label}-${i}`}>
                {/* Ring always present — opacity only, so hover never remounts geometry */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={r + 3}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  opacity={active ? 0.55 : 0}
                  pointerEvents="none"
                />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={r}
                  fill={
                    active
                      ? color
                      : c.isForecast
                        ? "var(--forecast)"
                        : "var(--accent-deep)"
                  }
                  pointerEvents="none"
                />
                {interactive && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={12}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() =>
                      setHover({
                        x: c.label,
                        y: c.value,
                        color,
                        low: src?.low,
                        high: src?.high,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    onClick={() =>
                      setPinned((prev) =>
                        prev?.x === c.label
                          ? null
                          : {
                              x: c.label,
                              y: c.value,
                              color,
                              low: src?.low,
                              high: src?.high,
                            },
                      )
                    }
                  />
                )}
                {size === "lg" && i % labelEvery === 0 && (
                  <>
                    <text
                      x={c.x}
                      y={Math.max(padT + 9, c.y - 9)}
                      textAnchor="middle"
                      className={
                        c.isForecast
                          ? "chart-viz__svg-value chart-viz__svg-value--forecast"
                          : "chart-viz__svg-value"
                      }
                      pointerEvents="none"
                    >
                      {fmt(c.value, chart.valueFormat)}
                    </text>
                    <text
                      x={c.x}
                      y={h - 6}
                      textAnchor="middle"
                      className="chart-viz__svg-label"
                      pointerEvents="none"
                    >
                      {c.label.length > 8 ? `${c.label.slice(0, 7)}…` : c.label}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {chart.forecastSplit && size === "lg" ? (
        <div className="chart-viz__legend" aria-hidden>
          <span className="chart-viz__legend-item">
            <span className="chart-viz__legend-swatch chart-viz__legend-swatch--actual" />
            History
          </span>
          <span className="chart-viz__legend-item">
            <span className="chart-viz__legend-swatch chart-viz__legend-swatch--forecast" />
            Forecast
          </span>
          {hasBand ? (
            <span className="chart-viz__legend-item">
              <span className="chart-viz__legend-swatch chart-viz__legend-swatch--band" />
              Likely range
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="chart-viz__axis-labels">
        <span>{chart.xLabel}</span>
        <span>{chart.yLabel}</span>
      </div>
      <TruncationNotice
        shown={pts.length}
        total={chart.totalPoints ?? chart.points.length}
      />
      {size === "lg" ? <ChartInsights lines={chart.insights} /> : null}
    </div>
  );
}

function PieChart({
  chart,
  size,
  interactive,
}: {
  chart: ChartSpec;
  size: "sm" | "lg";
  interactive: boolean;
}) {
  const [hostRef, hostSize] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Tip>(null);
  const [pinned, setPinned] = useState<Tip>(null);
  const tip = pinned ?? hover;

  const maxSlices = size === "lg" ? 8 : 6;
  const points = chart.points.slice(0, maxSlices);
  const total = points.reduce((s, p) => s + Math.abs(p.y), 0) || 1;
  let angle = -Math.PI / 2;

  const dim =
    size === "lg"
      ? Math.max(96, Math.min(hostSize.height || 148, (hostSize.width || 280) * 0.42, 220))
      : 72;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = dim * 0.4;

  const slices = points.map((p, i) => {
    const slice = (Math.abs(p.y) / total) * Math.PI * 2;
    const start = angle;
    angle += slice;
    const mid = start + slice / 2;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const labelR = r * 0.62;
    const color = COLORS[i % COLORS.length]!;
    return {
      key: p.x,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color,
      label: p.x,
      value: p.y,
      pct: Math.round((Math.abs(p.y) / total) * 100),
      lx: cx + labelR * Math.cos(mid),
      ly: cy + labelR * Math.sin(mid),
      showLabel: size === "lg" && slice > 0.35,
    };
  });

  return (
    <div
      className={`nodrag nopan chart-viz chart-viz--${size} ${
        size === "lg" ? "chart-viz--pie-lg" : ""
      } ${interactive ? "chart-viz--interactive" : ""}`}
    >
      <div className="chart-viz__title-row">
        <div className="chart-viz__title">{chart.title}</div>
        {interactive ? <ChartTooltip tip={tip} valueFormat={chart.valueFormat} /> : null}
      </div>
      <div className="chart-viz__pie-row" ref={hostRef}>
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
          {slices.map((s) => {
            const active = tip?.x === s.label;
            return (
              <path
                key={s.key}
                d={s.d}
                fill={s.color}
                opacity={tip && !active ? 0.45 : 1}
                stroke="#fff"
                strokeWidth={2}
                strokeOpacity={active ? 0.95 : 0}
                style={{ cursor: interactive ? "pointer" : undefined }}
                onMouseEnter={() =>
                  interactive &&
                  setHover({ x: s.label, y: s.value, color: s.color })
                }
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  if (!interactive) return;
                  setPinned((prev) =>
                    prev?.x === s.label
                      ? null
                      : { x: s.label, y: s.value, color: s.color },
                  );
                }}
              />
            );
          })}
          {slices.map((s) =>
            s.showLabel ? (
              <text
                key={`${s.key}-lbl`}
                x={s.lx}
                y={s.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="chart-viz__svg-pie-label"
                pointerEvents="none"
              >
                {s.pct}%
              </text>
            ) : null,
          )}
        </svg>
        <ul className="chart-viz__legend">
          {slices.map((s) => {
            const active = tip?.x === s.label;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  className={`chart-viz__legend-btn ${active ? "is-active" : ""}`}
                  disabled={!interactive}
                  onMouseEnter={() =>
                    interactive &&
                    setHover({ x: s.label, y: s.value, color: s.color })
                  }
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    if (!interactive) return;
                    setPinned((prev) =>
                      prev?.x === s.label
                        ? null
                        : { x: s.label, y: s.value, color: s.color },
                    );
                  }}
                >
                  <span className="chart-viz__swatch" style={{ background: s.color }} />
                  <span className="chart-viz__legend-label">{s.label}</span>
                  {size === "lg" && (
                    <span className="chart-viz__legend-val">
                      {fmt(s.value, chart.valueFormat)} · {s.pct}%
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {size === "lg" && (
        <div className="chart-viz__axis-labels">
          <span>{chart.xLabel}</span>
          <span>{chart.yLabel}</span>
        </div>
      )}
      <TruncationNotice shown={points.length} total={chart.totalPoints} />
      {size === "lg" ? <ChartInsights lines={chart.insights} /> : null}
    </div>
  );
}
