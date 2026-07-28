import {
  buildBaselineInsightReport,
  insightReportToExplanation,
  insightReportToTable,
  parseInsightReportReply,
  type InsightReport,
} from "@/modules/ai/domain/insightReport";
import { computeStats } from "@/modules/analyse/domain/stats";
import type { BlockDefinition, TabularData } from "../domain/types";
import { aiAnalyseMeta } from "../catalog";

const ANALYSE_JSON_SCHEMA = `{
  "headline": "short title for the read-out",
  "summary": "1–2 sentence overview",
  "confidence": "high|medium|low",
  "findings": [
    {
      "kind": "finding|metric|risk|opportunity|action",
      "title": "short label",
      "detail": "plain English detail",
      "metric": "optional standout number or null",
      "priority": "high|medium|low"
    }
  ],
  "nextSteps": ["practical action 1", "practical action 2"]
}`;

export const aiAnalyseBlock: BlockDefinition = {
  ...aiAnalyseMeta,
  async run(config, inputs, ctx) {
    if (!config.aiOptIn) throw new Error("Enable AI opt-in on this block to run.");
    const source = inputs.table as TabularData;
    if (!source) throw new Error("AI Analyse requires a table input");
    if (!ctx.callLlm) {
      throw new Error("AI runtime is not configured.");
    }
    if (ctx.hasLlmKey === false) {
      throw new Error("Add your LLM API key in Settings to use AI.");
    }

    const stats = computeStats(source);
    const baseline = buildBaselineInsightReport(source, stats);
    const question = String(config.userQuestion ?? "").trim().slice(0, 500);
    const conversation = String(config.conversationContext ?? "")
      .trim()
      .slice(0, 1200);
    const pipelineContext = String(config.pipelineContext ?? "").trim().slice(0, 500);
    const datasetMeta = String(config.datasetMeta ?? "").trim().slice(0, 700);
    // Follow-ups: metadata only — do not resend raw file samples / attachment history
    const metaOnly =
      config.contextMode === "meta" ||
      config.skipRawSample === true ||
      (Boolean(datasetMeta) && Boolean(config.followUp));
    const style = String(config.answerStyle ?? "exec");
    const styleRule =
      style === "bullets"
        ? "Emphasize short bullet findings; keep summary terse."
        : style === "actions"
          ? "Emphasize nextSteps (3–5 concrete actions); findings support those actions."
          : "Write an executive summary tone: crisp headline + decision-oriented findings.";

    const { safeJsonSlice } = await import("@/shared/lib/json");
    const dataBlock = metaOnly
      ? `DATASET METADATA (prefer this over any prior file dump):
${datasetMeta || `${source.rows.length} rows · ${source.columns.slice(0, 16).join(", ")}`}

PRECOMPUTED FINDINGS:
${baseline.findings
  .slice(0, 4)
  .map((f) => `• ${f.title}: ${f.detail}`)
  .join("\n")}

STATS (compact):
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
      : `SOURCE: ${source.rows.length} rows · ${source.columns.slice(0, 24).join(", ")}
${datasetMeta ? `\nDATASET METADATA:\n${datasetMeta}\n` : ""}
PRECOMPUTED FINDINGS:
${baseline.findings
  .slice(0, 6)
  .map((f) => `• ${f.title}: ${f.detail}`)
  .join("\n")}

STATS:
${safeJsonSlice(stats, 1600)}

SAMPLE:
${safeJsonSlice(source.rows.slice(0, 6), 600)}`;

    const prompt = `You help small-business and personal budget owners make decisions.
Return ONLY JSON matching this shape (no markdown):
${ANALYSE_JSON_SCHEMA}

Rules:
- 3–5 findings max, plain English, no jargon
- Prefer actionable wording (“stock more of…”, “cash dips in…”)
- Include at least one nextSteps item
- Use kind=metric when highlighting a number; kind=risk for gaps/volatility; kind=opportunity for upside; kind=action only inside nextSteps when possible
- Never treat identifier columns (pharmacyId, customerId, SKU, codes) as KPIs or forecast targets — prefer Sales, Amount, Quantity, Revenue, etc.
- If the table includes Forecast/Actual series, explain the outlook and what changed vs history
- Prefer DATASET METADATA and CONTEXT SUMMARY over raw attachment history
- Do not ask to re-attach or re-upload the file when metadata is present
- ${styleRule}
${question ? `- Latest user request: ${question}` : ""}
${conversation ? `\nCONTEXT SUMMARY (newest focus):\n${conversation}\n` : ""}
${pipelineContext ? `\nPIPELINE:\n${pipelineContext}\n` : ""}

${dataBlock}`;

    let report: InsightReport = baseline;
    try {
      const reply = await ctx.callLlm(prompt, { json: true });
      report = parseInsightReportReply(reply) ?? baseline;
      if (!report.findings.length && !report.nextSteps.length) {
        report = baseline;
      }
    } catch (error) {
      if (ctx.hasLlmKey) {
        throw error instanceof Error
          ? error
          : new Error("AI Analyse failed talking to the model.");
      }
      report = baseline;
    }

    const table = insightReportToTable(report);
    const explanation = insightReportToExplanation(report);
    const insights = report.findings.map((f) => `${f.title}: ${f.detail}`);

    return {
      // Structured table for Chart / Stats / Structure / further AI
      table,
      explanation,
      insights,
      insightReport: report,
      // Summary only — never embed full source (blows JSON / call stack on persist)
      _sourceTableSummary: {
        columns: source.columns.slice(0, 24),
        rowCount: source.rows.length,
      },
      _columnFormats: {
        metric: { kind: "number" as const, useGrouping: true },
      },
    };
  },
};
