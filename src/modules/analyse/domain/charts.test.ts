import { describe, expect, it } from "vitest";
import { buildChartSpec, suggestCharts } from "./charts";

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
});

