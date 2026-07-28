import { describe, expect, it } from "vitest";
import {
  asInsightLines,
  buildChartSpec,
  normalizeChartSpec,
  normalizeChartSpecs,
  suggestCharts,
  truncateChartPoints,
} from "./charts";

const sample = {
  columns: ["Region", "Sales"],
  rows: [
    { Region: "North", Sales: 10 },
    { Region: "South", Sales: 20 },
    { Region: "North", Sales: 5 },
  ],
};

describe("charts", () => {
  it("suggests bar and pie when category + numeric exist", () => {
    const suggestions = suggestCharts(sample);
    expect(suggestions.some((s) => s.type === "bar")).toBe(true);
    expect(suggestions.some((s) => s.type === "pie")).toBe(true);
  });

  it("builds bar points from suggestion", () => {
    const chart = buildChartSpec(sample, { suggestionId: "bar-cat-num" });
    expect(chart.type).toBe("bar");
    expect(chart.points.length).toBeGreaterThan(0);
    const north = chart.points.find((p) => p.x === "North");
    expect(north?.y).toBe(15);
  });

  it("aggregates string numeric y values", () => {
    const chart = buildChartSpec(
      {
        columns: ["Region", "Sales"],
        rows: [
          { Region: "North", Sales: "10" },
          { Region: "North", Sales: "5" },
        ],
      },
      { chartType: "bar", xColumn: "Region", yColumn: "Sales" },
    );
    expect(chart.points.find((p) => p.x === "North")?.y).toBe(15);
  });

  it("carries columnFormats onto chart valueFormat", () => {
    const chart = buildChartSpec(sample, {
      chartType: "bar",
      xColumn: "Region",
      yColumn: "Sales",
      columnFormats: {
        Sales: { kind: "currency", currencyCode: "ZAR", decimals: 2, useGrouping: true },
      },
    });
    expect(chart.valueFormat?.kind).toBe("currency");
    expect(chart.valueFormat?.currencyCode).toBe("ZAR");
  });

  it("prefers a time-series line when a date column exists", () => {
    const suggestions = suggestCharts({
      columns: ["Date", "Sales", "Region"],
      rows: [
        { Date: "2024-01-01", Sales: 10, Region: "North" },
        { Date: "2024-02-01", Sales: 20, Region: "South" },
        { Date: "2024-03-01", Sales: 15, Region: "North" },
      ],
    });
    expect(suggestions[0]?.id).toBe("line-time");
    expect(suggestions[0]?.type).toBe("line");
  });

  it("attaches plain-language insights to chart specs", () => {
    const chart = buildChartSpec(sample, {
      chartType: "bar",
      xColumn: "Region",
      yColumn: "Sales",
    });
    expect(chart.insights?.length).toBeGreaterThan(0);
  });

  it("coerces insights stored as a plain string (Ask meta corruption)", () => {
    const lines = asInsightLines("Risk rising\nOpportunity in North");
    expect(lines).toEqual(["Risk rising", "Opportunity in North"]);
    expect(asInsightLines("single insight")).toEqual(["single insight"]);
    expect(asInsightLines(undefined)).toEqual([]);
    expect(asInsightLines([{ title: "Gap", detail: "South soft" }])).toEqual([
      "Gap: South soft",
    ]);
  });

  it("normalizes compacted/corrupt chart meta so Ask UI can render safely", () => {
    const corrupt = {
      type: "line",
      title: "Sales outlook",
      xLabel: "Month",
      yLabel: "Sales",
      // insights accidentally persisted as a string — previously crashed ChartInsights
      insights: "Cost rising in Q3\nWatch margin",
      points: [
        { x: "Jan", y: 10 },
        { x: "Feb", y: 12 },
        "…+3 more",
        { x: "bad", y: "nope" },
      ],
    };
    const chart = normalizeChartSpec(corrupt);
    expect(chart).not.toBeNull();
    expect(Array.isArray(chart!.insights)).toBe(true);
    expect(chart!.insights!.every((l) => typeof l === "string")).toBe(true);
    expect(chart!.insights!.length).toBe(2);
    expect(chart!.points.every((p) => typeof p.y === "number")).toBe(true);
    expect(chart!.points.length).toBe(2);

    // Mimic ChartInsights: must support .slice().map
    expect(
      chart!.insights!.slice(0, 3).map((line) => line.length),
    ).toEqual([expect.any(Number), expect.any(Number)]);

    const list = normalizeChartSpecs([corrupt, null, { type: "bar" }, chart]);
    expect(list.length).toBe(2);
  });

  it("rejects charts without usable points", () => {
    expect(
      normalizeChartSpec({
        type: "bar",
        title: "Empty",
        points: [],
      }),
    ).toBeNull();
  });

  it("keeps forecast points when truncating long history", () => {
    const points = [
      ...Array.from({ length: 40 }, (_, i) => ({
        x: `H${i}`,
        y: i,
        series: "Actual" as const,
      })),
      { x: "F1", y: 99, series: "Forecast" as const },
      { x: "F2", y: 100, series: "Forecast" as const },
      { x: "F3", y: 101, series: "Forecast" as const },
    ];
    const truncated = truncateChartPoints(points, 12);
    expect(truncated.some((p) => p.series === "Forecast")).toBe(true);
    expect(truncated.filter((p) => p.series === "Forecast").length).toBeGreaterThan(0);
    expect(truncated[truncated.length - 1]?.x).toMatch(/^F/);
  });
});

