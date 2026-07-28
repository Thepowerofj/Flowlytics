import {
  buildBaselineInsightReport,
  insightReportToExplanation,
  insightReportToTable,
  parseInsightReportReply,
  type InsightReport,
} from "@/modules/ai/domain/insightReport";
import { computeStats } from "@/modules/analyse/domain/stats";
import type { BlockDefinition, TabularData } from "../domain/types";
import { aiExplainMeta } from "../catalog";

const EXPLAIN_JSON_SCHEMA = `{
  "headline": "short title",
  "summary": "plain-English overview of what the data shows",
  "confidence": "high|medium|low",
  "findings": [
    {
      "kind": "finding|metric|risk|opportunity",
      "title": "short label",
      "detail": "explanation detail",
      "metric": "optional number or null",
      "priority": "high|medium|low"
    }
  ],
  "nextSteps": ["optional suggestion"]
}`;

export const aiExplainBlock: BlockDefinition = {
  ...aiExplainMeta,
  async run(config, inputs, ctx) {
    if (!config.aiOptIn) throw new Error("Enable AI opt-in on this block to run.");
    const source = inputs.table as TabularData;
    if (!source) throw new Error("AI Explain requires a table input");
    if (!ctx.callLlm) {
      throw new Error("AI runtime is not configured.");
    }
    if (ctx.hasLlmKey === false) {
      throw new Error("Add your LLM API key in Settings to use AI.");
    }

    const stats = computeStats(source);
    const baseline = buildBaselineInsightReport(source, stats);
    baseline.headline = "What your data shows";
    const datasetMeta = String(config.datasetMeta ?? "").trim().slice(0, 700);
    const metaOnly =
      config.contextMode === "meta" ||
      config.skipRawSample === true ||
      Boolean(config.followUp);
    const { safeJsonSlice } = await import("@/shared/lib/json");
    const statsBlock = metaOnly
      ? `${datasetMeta ? `DATASET METADATA:\n${datasetMeta}\n\n` : ""}STATS (compact):
${safeJsonSlice(
  stats.slice(0, 6).map((s) => ({
    column: s.column,
    kind: s.kind,
    min: s.min,
    max: s.max,
    mean: s.mean,
  })),
  900,
)}`
      : `STATS:
${safeJsonSlice(stats, 2000)}`;

    const prompt = `Explain these spreadsheet stats for a small-business owner.
Return ONLY JSON matching this shape (no markdown):
${EXPLAIN_JSON_SCHEMA}

Keep findings to 3–4 items, max ~120 words of content total. No jargon.
Prefer DATASET METADATA when present; do not require the raw file again.

${statsBlock}`;

    let report: InsightReport = baseline;
    try {
      const reply = await ctx.callLlm(prompt, { json: true });
      report = parseInsightReportReply(reply) ?? baseline;
      if (!report.findings.length) report = baseline;
    } catch (error) {
      if (ctx.hasLlmKey) {
        throw error instanceof Error
          ? error
          : new Error("AI Explain failed talking to the model.");
      }
      report = baseline;
    }

    const table = insightReportToTable(report);
    return {
      table,
      explanation: insightReportToExplanation(report),
      insights: report.findings.map((f) => `${f.title}: ${f.detail}`),
      insightReport: report,
      _sourceTableSummary: {
        columns: source.columns.slice(0, 24),
        rowCount: source.rows.length,
      },
    };
  },
};
