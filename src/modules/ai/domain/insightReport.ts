import type { TabularData } from "@/modules/blocks/domain/types";
import {
  businessInsightLines,
  parseInsightBullets,
} from "@/modules/analyse/domain/insights";
import type { ColumnStats } from "@/modules/analyse/domain/stats";

export type InsightKind =
  | "finding"
  | "metric"
  | "risk"
  | "opportunity"
  | "action";

export type InsightPriority = "high" | "medium" | "low";

export type InsightFinding = {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** Optional standout number or short metric label */
  metric?: string | null;
  priority?: InsightPriority;
};

export type InsightReport = {
  headline: string;
  summary: string;
  findings: InsightFinding[];
  nextSteps: string[];
  confidence?: InsightPriority;
};

const KINDS: InsightKind[] = [
  "finding",
  "metric",
  "risk",
  "opportunity",
  "action",
];
const PRIORITIES: InsightPriority[] = ["high", "medium", "low"];

function asKind(raw: unknown): InsightKind {
  const s = String(raw ?? "").toLowerCase();
  return KINDS.includes(s as InsightKind) ? (s as InsightKind) : "finding";
}

function asPriority(raw: unknown): InsightPriority | undefined {
  const s = String(raw ?? "").toLowerCase();
  return PRIORITIES.includes(s as InsightPriority)
    ? (s as InsightPriority)
    : undefined;
}

function cleanText(raw: unknown, max = 400): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Normalize model / stub JSON into a stable InsightReport. */
export function normalizeInsightReport(raw: unknown): InsightReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const findingsRaw = Array.isArray(o.findings)
    ? o.findings
    : Array.isArray(o.insights)
      ? o.insights
      : [];

  const findings: InsightFinding[] = [];
  for (let i = 0; i < findingsRaw.length && findings.length < 8; i++) {
    const item = findingsRaw[i];
    if (typeof item === "string") {
      const text = cleanText(item, 280);
      if (!text) continue;
      const [titlePart, ...rest] = text.split(":");
      findings.push({
        id: `f${findings.length + 1}`,
        kind: "finding",
        title: rest.length ? cleanText(titlePart, 80) : `Insight ${findings.length + 1}`,
        detail: rest.length ? cleanText(rest.join(":"), 280) : text,
      });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const title = cleanText(f.title ?? f.label ?? f.name, 80);
    const detail = cleanText(f.detail ?? f.body ?? f.text ?? f.description, 280);
    if (!title && !detail) continue;
    findings.push({
      id: cleanText(f.id, 40) || `f${findings.length + 1}`,
      kind: asKind(f.kind ?? f.type),
      title: title || `Insight ${findings.length + 1}`,
      detail: detail || title,
      metric: f.metric != null ? cleanText(f.metric, 60) : null,
      priority: asPriority(f.priority),
    });
  }

  const nextSteps = (
    Array.isArray(o.nextSteps)
      ? o.nextSteps
      : Array.isArray(o.actions)
        ? o.actions
        : []
  )
    .map((s) => cleanText(s, 200))
    .filter(Boolean)
    .slice(0, 5);

  const headline = cleanText(o.headline ?? o.title, 120);
  const summary = cleanText(o.summary ?? o.explanation ?? o.overview, 360);

  if (!headline && !summary && !findings.length && !nextSteps.length) {
    return null;
  }

  return {
    headline: headline || "Insights",
    summary:
      summary ||
      (findings[0] ? findings[0].detail : "Review the findings below."),
    findings,
    nextSteps,
    confidence: asPriority(o.confidence),
  };
}

/** Parse LLM reply (JSON object or prose) into InsightReport. */
export function parseInsightReportReply(reply: string): InsightReport | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;

  // Strip markdown fences if present
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(unfenced) as unknown;
    const report = normalizeInsightReport(parsed);
    if (report) return report;
    // { explanation: "..." } stub shape
    if (parsed && typeof parsed === "object") {
      const expl = (parsed as { explanation?: unknown }).explanation;
      if (typeof expl === "string") {
        return reportFromProse(expl);
      }
    }
  } catch {
    /* prose fallback */
  }

  return reportFromProse(trimmed);
}

export function reportFromProse(text: string, headline = "Insights"): InsightReport {
  const bullets = parseInsightBullets(text);
  const findings: InsightFinding[] = bullets.slice(0, 6).map((b, i) => {
    const [titlePart, ...rest] = b.split(":");
    const hasTitle = rest.length > 0 && titlePart.length < 60;
    return {
      id: `f${i + 1}`,
      kind: /next step|suggest|should|consider/i.test(b)
        ? ("action" as const)
        : /risk|gap|missing|volatile|thin/i.test(b)
          ? ("risk" as const)
          : ("finding" as const),
      title: hasTitle ? cleanText(titlePart, 80) : `Insight ${i + 1}`,
      detail: hasTitle ? cleanText(rest.join(":"), 280) : cleanText(b, 280),
    };
  });
  const actions = findings
    .filter((f) => f.kind === "action")
    .map((f) => f.detail);
  return {
    headline,
    summary: findings[0]?.detail ?? cleanText(text, 280),
    findings: findings.filter((f) => f.kind !== "action").length
      ? findings.filter((f) => f.kind !== "action")
      : findings,
    nextSteps: actions.length
      ? actions
      : findings.slice(-1).map((f) => f.detail),
    confidence: "medium",
  };
}

/** Deterministic report when LLM is unavailable (stub / offline). */
export function buildBaselineInsightReport(
  table: TabularData,
  stats?: ColumnStats[],
): InsightReport {
  const lines = businessInsightLines(table, undefined, stats);
  return reportFromProse(
    lines.map((l) => `• ${l}`).join("\n"),
    table.rows.length
      ? `${table.rows.length} rows · key takeaways`
      : "Key takeaways",
  );
}

/** Tabular form so Chart / Stats / Structure / AI can consume findings. */
export function insightReportToTable(report: InsightReport): TabularData {
  const rows: TabularData["rows"] = [];
  for (const f of report.findings) {
    rows.push({
      section: "finding",
      kind: f.kind,
      title: f.title,
      detail: f.detail,
      metric: f.metric ?? null,
      priority: f.priority ?? null,
    });
  }
  for (const step of report.nextSteps) {
    rows.push({
      section: "next_step",
      kind: "action",
      title: "Next step",
      detail: step,
      metric: null,
      priority: "high",
    });
  }
  if (!rows.length) {
    rows.push({
      section: "summary",
      kind: "finding",
      title: report.headline,
      detail: report.summary,
      metric: null,
      priority: null,
    });
  }
  return {
    columns: ["section", "kind", "title", "detail", "metric", "priority"],
    rows,
  };
}

/** Plain-text fallback for Results / older UI. */
export function insightReportToExplanation(report: InsightReport): string {
  const lines: string[] = [];
  if (report.headline) lines.push(report.headline);
  if (report.summary) lines.push(report.summary);
  for (const f of report.findings) {
    lines.push(`• ${f.title}: ${f.detail}`);
  }
  for (const s of report.nextSteps) {
    lines.push(`• Next: ${s}`);
  }
  return lines.join("\n");
}

export function isInsightReport(value: unknown): value is InsightReport {
  return Boolean(normalizeInsightReport(value));
}
