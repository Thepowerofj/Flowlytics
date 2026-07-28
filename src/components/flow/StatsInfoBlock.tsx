"use client";

import type { ColumnStats } from "@/modules/analyse/domain/stats";
import {
  formatDisplayValue,
  type ColumnDisplayFormat,
} from "@/modules/ingest/domain/columnFormat";
import { formatCount } from "@/shared/lib/formatUi";

type Summary = {
  rows: number;
  columns: number;
  highlights: string[] | string | unknown;
};

type Props = {
  summary: Summary;
  stats: ColumnStats[];
  columnFormats?: Record<string, ColumnDisplayFormat>;
};

function fmtNum(
  value: number | null | undefined,
  fmt?: ColumnDisplayFormat,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayValue(value, fmt ?? { kind: "number", useGrouping: true });
}

/** Canvas information card for Stats Summary — metrics + plain-language insights. */
export function StatsInfoBlock({ summary, stats, columnFormats = {} }: Props) {
  const safeStats = Array.isArray(stats) ? stats : [];
  const highlights = Array.isArray(summary.highlights)
    ? summary.highlights.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : typeof summary.highlights === "string" && (summary.highlights as string).trim()
      ? [(summary.highlights as string).trim()]
      : [];
  const numeric = safeStats.filter((s) => s.kind === "numeric").length;
  const categorical = safeStats.filter((s) => s.kind === "categorical").length;

  return (
    <div className="info-block nodrag nopan">
      <div className="info-block__metrics">
        <div className="info-block__metric">
          <strong>{formatCount(summary.rows)}</strong>
          <span>Rows</span>
        </div>
        <div className="info-block__metric">
          <strong>{summary.columns}</strong>
          <span>Columns</span>
        </div>
        <div className="info-block__metric">
          <strong>{numeric}</strong>
          <span>Numbers</span>
        </div>
        <div className="info-block__metric">
          <strong>{categorical}</strong>
          <span>Categories</span>
        </div>
      </div>

      <div className="info-block__section">
        <p className="info-block__label">Key findings</p>
        {highlights.length ? (
          <ul className="info-block__insights">
            {highlights.slice(0, 5).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted">
            Connect data to see what stands out — averages, gaps, and next steps.
          </p>
        )}
      </div>

      {safeStats.length > 0 && (
        <div className="info-block__section">
          <p className="info-block__label">Field snapshot</p>
          <div className="info-block__fields">
            {safeStats.slice(0, 4).map((s) => {
              const fmt = columnFormats[s.column];
              return (
                <div key={s.column} className="info-block__field">
                  <span className="info-block__field-name">{s.column}</span>
                  <span className="info-block__field-meta">
                    {s.kind === "numeric"
                      ? `avg ${fmtNum(s.mean, fmt)} · med ${fmtNum(s.median, fmt)} · ${fmtNum(s.min, fmt)}–${fmtNum(s.max, fmt)}`
                      : s.topValues?.[0]
                        ? `top “${s.topValues[0].value}”`
                        : "category"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
