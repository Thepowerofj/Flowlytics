import { describe, expect, it } from "vitest";
import {
  normalizeChartSpec,
  normalizeChartSpecs,
} from "@/modules/analyse/domain/charts";
import { compactJsonValue, toJsonValueSafe } from "@/shared/lib/json";

/**
 * End-to-end Ask chart meta path: persist → compact → reload → normalize → UI-safe.
 * Guards the regression where insights became a string and ChartInsights crashed.
 */
describe("Ask chart meta round-trip", () => {
  it("keeps insights as a string[] after safe persist/compact", () => {
    const chart = {
      type: "line" as const,
      title: "Cost by Date",
      xLabel: "Date",
      yLabel: "Cost",
      points: [
        { x: "2024-01", y: 10, series: "Actual" as const },
        { x: "2024-02", y: 12, series: "Forecast" as const },
      ],
      insights: ["Cost trending up", "Watch Q3 margin"],
      forecastSplit: true,
    };

    const meta = {
      kind: "run_result",
      steps: ["ingest.csv_excel", "analyse.chart"],
      charts: [chart],
    };

    const saved = toJsonValueSafe(meta, "ask-run-result").value;
    const compacted = compactJsonValue(saved) as typeof meta;
    const charts = normalizeChartSpecs(compacted.charts);

    expect(charts).toHaveLength(1);
    expect(Array.isArray(charts[0]!.insights)).toBe(true);
    // ChartInsights contract
    expect(() =>
      charts[0]!.insights!.slice(0, 3).map((line) => line.toUpperCase()),
    ).not.toThrow();
    expect(charts[0]!.points.length).toBe(2);
  });

  it("recovers when insights were wrongly saved as a string", () => {
    const recovered = normalizeChartSpec({
      type: "line",
      title: "Broken meta chart",
      xLabel: "X",
      yLabel: "Y",
      points: [{ x: "A", y: 1 }],
      insights: "Only a string survived Prisma JSON",
    });
    expect(recovered).not.toBeNull();
    expect(recovered!.insights).toEqual(["Only a string survived Prisma JSON"]);
    expect(
      recovered!.insights!.slice(0, 3).map((l) => l.length),
    ).toEqual([expect.any(Number)]);
  });

  it("drops non-array steps safely for pipeline strip consumers", () => {
    const meta = toJsonValueSafe({
      kind: "run_result",
      steps: { oops: true },
      charts: [],
    }).value as { steps: unknown };
    const steps = Array.isArray(meta.steps) ? meta.steps : [];
    expect(steps.map((s: string) => s)).toEqual([]);
  });
});
