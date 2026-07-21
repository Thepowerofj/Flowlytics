import { describe, expect, it } from "vitest";
import {
  insightReportToTable,
  normalizeInsightReport,
  parseInsightReportReply,
  reportFromProse,
} from "./insightReport";

describe("insightReport", () => {
  it("normalizes structured model JSON", () => {
    const report = normalizeInsightReport({
      headline: "Sales look healthy",
      summary: "North leads; watch stock.",
      confidence: "high",
      findings: [
        {
          kind: "metric",
          title: "Average sale",
          detail: "Averages R 1,200",
          metric: "R 1,200",
          priority: "high",
        },
        { kind: "risk", title: "Gaps", detail: "Region missing in 12% of rows" },
      ],
      nextSteps: ["Chart Sales by Region"],
    });
    expect(report?.headline).toBe("Sales look healthy");
    expect(report?.findings).toHaveLength(2);
    expect(report?.findings[0]?.kind).toBe("metric");
    expect(report?.nextSteps[0]).toMatch(/Chart/);
  });

  it("parses fenced JSON and prose fallbacks", () => {
    const fenced = parseInsightReportReply(
      '```json\n{"headline":"Hi","summary":"There","findings":[{"title":"A","detail":"B"}]}\n```',
    );
    expect(fenced?.headline).toBe("Hi");
    expect(fenced?.findings[0]?.detail).toBe("B");

    const prose = reportFromProse(
      "• Driver: Sales averages 100\n• Next step: Forecast Sales",
    );
    expect(prose.findings.length).toBeGreaterThan(0);
  });

  it("exports a tabular table for downstream activities", () => {
    const table = insightReportToTable({
      headline: "Read-out",
      summary: "Overview",
      findings: [
        {
          id: "f1",
          kind: "finding",
          title: "Top region",
          detail: "North leads",
          metric: "45%",
        },
      ],
      nextSteps: ["Add a Chart"],
    });
    expect(table.columns).toContain("kind");
    expect(table.rows.some((r) => r.section === "finding")).toBe(true);
    expect(table.rows.some((r) => r.section === "next_step")).toBe(true);
  });
});
