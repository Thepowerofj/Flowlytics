import { describe, expect, it } from "vitest";
import {
  buildClarifyPayload,
  goalLooksComplete,
  mergeGoalWithAnswers,
  wantsSkipClarify,
} from "./clarify";

describe("ask clarify", () => {
  const table = {
    columns: ["Month", "pharmacyId", "Sales", "Region"],
    rows: [
      { Month: "2024-01-01", pharmacyId: 1, Sales: 100, Region: "North" },
      { Month: "2024-02-01", pharmacyId: 2, Sales: 120, Region: "South" },
      { Month: "2024-03-01", pharmacyId: 3, Sales: 140, Region: "North" },
    ],
  };

  it("builds dataset brief and focused questions", () => {
    const payload = buildClarifyPayload(table, "look at my file", "pharma.csv");
    expect(payload.datasetBrief).toMatch(/Sales/);
    expect(payload.questions.length).toBeGreaterThan(0);
    expect(payload.questions[0]?.suggestions).toContain("Sales");
  });

  it("detects skip phrases and complete goals", () => {
    expect(wantsSkipClarify("go ahead")).toBe(true);
    expect(goalLooksComplete("forecast Sales for next 3 months", table)).toBe(
      true,
    );
    expect(goalLooksComplete("help", table)).toBe(false);
  });

  it("merges clarify answers into the goal", () => {
    expect(
      mergeGoalWithAnswers("Analyse my data", "Sales, next 6 months"),
    ).toMatch(/Sales/);
    expect(
      mergeGoalWithAnswers("Analyse my data", "go ahead", "Analyse — focus on Sales"),
    ).toMatch(/Sales/);
  });
});
