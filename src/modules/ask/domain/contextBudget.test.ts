import { describe, expect, it } from "vitest";
import {
  buildDatasetMetaSummary,
  buildLlmContext,
  safeJsonSlice,
  summarizeConversation,
  summarizeForStackRecovery,
} from "./contextBudget";

describe("contextBudget", () => {
  const table = {
    columns: ["Month", "Sales", "Region"],
    rows: [
      { Month: "2024-01", Sales: 100, Region: "North" },
      { Month: "2024-02", Sales: 120, Region: "South" },
    ],
  };

  it("summarizes newest user goal and keeps length bounded", () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Turn ${i} with some analysis about sales and next steps to restock.`,
    }));
    const summary = summarizeConversation(turns);
    expect(summary.length).toBeLessThanOrEqual(1200);
    expect(summary).toMatch(/Latest goal|User:/);
  });

  it("does not replay clarify file briefs into conversation summary", () => {
    const summary = summarizeConversation([
      { role: "user", content: "Analyse my sales" },
      {
        role: "assistant",
        content:
          "I scanned your file\n\n**big.csv** · 198244 rows × 6 columns\nTime fields: Date\n".repeat(
            3,
          ),
        meta: { kind: "clarify" },
      },
      { role: "user", content: "Focus on Cost next quarter" },
    ]);
    expect(summary).toMatch(/Focus on Cost/);
    expect(summary).not.toMatch(/198244/);
    expect(summary).toMatch(/clarifying questions/i);
  });

  it("builds dataset metadata for follow-up LLM context", () => {
    const meta = buildDatasetMetaSummary(table, {
      fileName: "pharma.csv",
      totalRowCount: 198_244,
      goal: "forecast Sales",
    });
    expect(meta).toMatch(/pharma\.csv/);
    expect(meta).toMatch(/198/);
    expect(meta).toMatch(/244/);
    expect(meta).toMatch(/Sales|Primary measure/);
    expect(meta).toMatch(/follow-up/i);

    const ctx = buildLlmContext({
      datasetMeta: meta,
      followUp: true,
      turns: [{ role: "user", content: "What are the risks?" }],
    });
    expect(ctx).toMatch(/DATASET METADATA/);
    expect(ctx).toMatch(/risks/i);
    expect(ctx.length).toBeLessThanOrEqual(1200);
  });

  it("safeJsonSlice handles circular refs", () => {
    const a: { self?: unknown; n: number } = { n: 1 };
    a.self = a;
    const s = safeJsonSlice(a, 200);
    expect(s).toContain("Circular");
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it("builds a recovery summary with newest goal and next steps", () => {
    const summary = summarizeForStackRecovery(
      [
        { role: "user", content: "Forecast Sales next 6 months" },
        {
          role: "assistant",
          content: "Next steps: restock North region and watch margin.",
        },
      ],
      {
        goal: "Forecast Sales next 6 months",
        fileName: "pharma.csv",
        datasetMeta: "File: pharma.csv\nShape: 100 rows × 3 columns",
      },
    );
    expect(summary).toMatch(/DATASET METADATA|Forecast Sales/);
    expect(summary).toMatch(/pharma\.csv/);
  });
});
