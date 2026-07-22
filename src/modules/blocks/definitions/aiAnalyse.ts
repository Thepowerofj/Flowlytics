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
    const sample = source.rows.slice(0, 8);
    const question = String(config.userQuestion ?? "").trim();
    const conversation = String(config.conversationContext ?? "").trim();
    const pipelineContext = String(config.pipelineContext ?? "").trim();
    const style = String(config.answerStyle ?? "exec");
    const styleRule =
      style === "bullets"
        ? "Emphasize short bullet findings; keep summary terse."
        : style === "actions"
          ? "Emphasize nextSteps (3–5 concrete actions); findings support those actions."
          : "Write an executive summary tone: crisp headline + decision-oriented findings.";
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
- ${styleRule}
${question ? `- Latest user request (adapt the read-out to this): ${question}` : ""}
${conversation ? `\nRECENT CHAT (oldest→newest):\n${conversation.slice(0, 1600)}\n` : ""}
${pipelineContext ? `\nCONNECTED PIPELINE:\n${pipelineContext.slice(0, 800)}\n` : ""}

SOURCE SNAPSHOT: ${source.rows.length} rows, columns ${source.columns.join(", ")}

PRECOMPUTED FINDINGS:
${baseline.findings.map((f) => `• ${f.title}: ${f.detail}`).join("\n")}

STATS:
${JSON.stringify(stats).slice(0, 2800)}

SAMPLE:
${JSON.stringify(sample).slice(0, 1000)}`;

    let report: InsightReport = baseline;
    try {
      const reply = await ctx.callLlm(prompt, { json: true });
      report = parseInsightReportReply(reply) ?? baseline;
      // Ensure we always have something useful
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
      // Keep source available for source-picker / debugging
      _sourceTable: source,
      _columnFormats: {
        metric: { kind: "number" as const, useGrouping: true },
      },
    };
  },
};
