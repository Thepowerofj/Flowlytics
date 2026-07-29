export type PresentationSlide =
  | {
      kind: "title";
      title: string;
      subtitle?: string;
      eyebrow?: string;
    }
  | {
      kind: "bullets";
      title: string;
      bullets: string[];
      /** findings = insight list; actions = next steps emphasis */
      tone?: "findings" | "actions";
    }
  | {
      kind: "table";
      title: string;
      columns: string[];
      rows: string[][];
      caption?: string;
    }
  | {
      kind: "kpi";
      title: string;
      items: { label: string; value: string; hint?: string }[];
    }
  | {
      kind: "chart";
      title: string;
      caption?: string;
      points: { x: string; y: number; series?: string }[];
    }
  | {
      kind: "closing";
      title: string;
      body: string;
    };

export type PresentationModel = {
  title: string;
  generatedAt: string;
  slides: PresentationSlide[];
};

/** Build a polished insight pack from a flow run's resultJson. */
export function buildPresentationModel(
  resultJson: unknown,
  opts?: { title?: string },
): PresentationModel {
  const title = opts?.title?.trim() || "Flowlytics insight pack";
  const generatedAt = new Date().toISOString().slice(0, 10);
  const slides: PresentationSlide[] = [
    {
      kind: "title",
      eyebrow: "Flowlytics",
      title,
      subtitle: "Decision-ready read-out from your pipeline",
    },
  ];

  if (!resultJson || typeof resultJson !== "object") {
    slides.push({
      kind: "bullets",
      title: "Summary",
      tone: "findings",
      bullets: ["No structured results were available for this run."],
    });
    slides.push({
      kind: "closing",
      title: "Open Builder for the full workspace",
      body: "Charts, tables, and forecasts stay available in Flowlytics.",
    });
    return { title, generatedAt, slides };
  }

  const root = resultJson as Record<string, unknown>;
  const byBlock =
    (root.byBlockId as Record<string, Record<string, unknown>> | undefined) ??
    {};

  const findings: string[] = [];
  const actions: string[] = [];
  const caveats: string[] = [];
  const kpis: { label: string; value: string; hint?: string }[] = [];
  let forecastTable:
    | {
        columns: string[];
        rows: string[][];
      }
    | null = null;
  let scenarioBullets: string[] = [];
  let chartSlide:
    | {
        title: string;
        caption?: string;
        points: { x: string; y: number; series?: string }[];
      }
    | null = null;
  let headline = "";
  let summary = "";

  for (const out of Object.values(byBlock)) {
    const report = out.insightReport as
      | {
          headline?: string;
          summary?: string;
          findings?: { title?: string; detail?: string; kind?: string }[];
          nextSteps?: string[];
        }
      | undefined;
    if (report?.headline && !headline) headline = report.headline;
    if (report?.summary && !summary) summary = report.summary;
    for (const f of report?.findings ?? []) {
      if (f.title) {
        findings.push(
          f.detail ? `${f.title} — ${f.detail}` : f.title,
        );
      }
    }
    for (const s of report?.nextSteps ?? []) {
      if (s.trim()) actions.push(s.trim());
    }

    const projection = out.projection as
      | {
          column?: string;
          method?: string;
          recommendedMethod?: string;
          intervalMethod?: string;
          diagnostics?: { warnings?: string[]; frequency?: string; readiness?: string };
          leaderboard?: {
            method?: string;
            backtest?: { mae?: number; rmse?: number; smape?: number | null; bias?: number };
          }[];
          scenarios?: { name?: string; assumption?: string; forecast?: number[] }[];
          kpis?: {
            lastActual?: number;
            nextForecast?: number;
            changePct?: number;
          };
        }
      | undefined;
    if (projection?.kpis) {
      const col = projection.column ? ` (${projection.column})` : "";
      if (projection.kpis.lastActual != null) {
        kpis.push({
          label: `Last actual${col}`,
          value: formatNum(projection.kpis.lastActual),
          hint: "History",
        });
      }
      if (projection.kpis.nextForecast != null) {
        kpis.push({
          label: `Next forecast${col}`,
          value: formatNum(projection.kpis.nextForecast),
          hint: "Outlook",
        });
      }
      if (projection.kpis.changePct != null) {
        kpis.push({
          label: "Change",
          value: `${projection.kpis.changePct > 0 ? "+" : ""}${projection.kpis.changePct}%`,
          hint: "vs last period",
        });
      }
    }
    if (projection?.leaderboard?.length && !forecastTable) {
      forecastTable = {
        columns: ["Model", "MAE", "RMSE", "sMAPE", "Bias"],
        rows: projection.leaderboard.slice(0, 6).map((row) => [
          row.method ?? "",
          row.backtest?.mae != null ? formatNum(row.backtest.mae) : "",
          row.backtest?.rmse != null ? formatNum(row.backtest.rmse) : "",
          row.backtest?.smape != null ? `${formatNum(row.backtest.smape)}%` : "",
          row.backtest?.bias != null ? formatNum(row.backtest.bias) : "",
        ]),
      };
    }
    if (projection?.intervalMethod) caveats.push(projection.intervalMethod);
    for (const warning of projection?.diagnostics?.warnings ?? []) {
      caveats.push(warning);
    }
    if (projection?.scenarios?.length && !scenarioBullets.length) {
      scenarioBullets = projection.scenarios.map((s) => {
        const last = s.forecast?.[s.forecast.length - 1];
        return `${s.name ?? "scenario"}: ${s.assumption ?? "assumption"}${
          last != null ? `; horizon value ${formatNum(last)}` : ""
        }`;
      });
    }

    const chart = out.chart as
      | {
          title?: string;
          points?: { x?: string; y?: number; series?: string }[];
        }
      | undefined;
    if (
      !chartSlide &&
      Array.isArray(chart?.points) &&
      chart.points.length >= 2
    ) {
      chartSlide = {
        title: chart.title || "Forecast outlook",
        caption: "History and projected values from the Forecast activity",
        points: chart.points
          .filter((p) => p && typeof p.y === "number")
          .slice(0, 48)
          .map((p) => ({
            x: String(p.x ?? ""),
            y: Number(p.y) || 0,
            series: p.series,
          })),
      };
    }

    const contract = out.contract as
      | { warnings?: string[]; rowCount?: number; grain?: string; primaryMeasure?: string }
      | undefined;
    for (const warning of contract?.warnings ?? []) caveats.push(warning);

    if (typeof out.explanation === "string" && out.explanation.trim()) {
      for (const line of out.explanation.split("\n").filter(Boolean).slice(0, 3)) {
        findings.push(line.replace(/^•\s*/, ""));
      }
    }
  }

  if (typeof root.explanation === "string" && root.explanation.trim()) {
    for (const line of root.explanation.split("\n").filter(Boolean).slice(0, 3)) {
      findings.push(line.replace(/^•\s*/, ""));
    }
  }

  if (headline || summary) {
    slides.push({
      kind: "bullets",
      title: headline || "Executive snapshot",
      tone: "findings",
      bullets: [
        summary || "Pipeline completed with actionable findings below.",
        ...findings.slice(0, 2),
      ].filter(Boolean),
    });
  }

  if (kpis.length) {
    slides.push({
      kind: "kpi",
      title: "Numbers that matter",
      items: dedupeKpis(kpis).slice(0, 6),
    });
  }

  if (chartSlide) {
    slides.push({
      kind: "chart",
      title: chartSlide.title,
      caption: chartSlide.caption,
      points: chartSlide.points,
    });
  }

  if (forecastTable) {
    slides.push({
      kind: "table",
      title: "Forecast validation leaderboard",
      caption: "Lower error is better; model choice prefers simpler methods within tolerance.",
      columns: forecastTable.columns,
      rows: forecastTable.rows,
    });
  }

  if (scenarioBullets.length) {
    slides.push({
      kind: "bullets",
      title: "Forecast scenarios",
      tone: "findings",
      bullets: scenarioBullets.slice(0, 4),
    });
  }

  const uniqueFindings = uniqueStrings(findings).slice(0, 8);
  slides.push({
    kind: "bullets",
    title: "What the data is saying",
    tone: "findings",
    bullets: uniqueFindings.length
      ? uniqueFindings
      : ["Run completed — open the Builder for full tables and charts."],
  });

  const uniqueActions = uniqueStrings(actions).slice(0, 6);
  if (uniqueActions.length) {
    slides.push({
      kind: "bullets",
      title: "Recommended next moves",
      tone: "actions",
      bullets: uniqueActions,
    });
  }

  const uniqueCaveats = uniqueStrings(caveats).slice(0, 6);
  if (uniqueCaveats.length) {
    slides.push({
      kind: "bullets",
      title: "Trust notes and caveats",
      tone: "findings",
      bullets: uniqueCaveats,
    });
  }

  for (const out of Object.values(byBlock)) {
    const table = out.table as
      | { columns?: string[]; rows?: Record<string, unknown>[] }
      | undefined;
    if (table?.columns?.length && table.rows?.length) {
      // Prefer non-insight tables when possible
      const cols = table.columns.slice(0, 6);
      const isInsightTable =
        cols.includes("kind") && cols.includes("title") && cols.length <= 4;
      if (isInsightTable) continue;
      const rows = table.rows.slice(0, 8).map((r) =>
        cols.map((c) => String(r[c] ?? "")),
      );
      slides.push({
        kind: "table",
        title: "Evidence snapshot",
        caption: `${table.rows.length.toLocaleString()} rows in source · showing first ${rows.length}`,
        columns: cols,
        rows,
      });
      break;
    }
  }

  slides.push({
    kind: "closing",
    title: "Keep exploring in Flowlytics",
    body: "Refine the pipeline in Builder, re-run from Ask, or export again after the next iteration.",
  });

  return { title, generatedAt, slides };
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(n);
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function dedupeKpis(
  items: { label: string; value: string; hint?: string }[],
) {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
