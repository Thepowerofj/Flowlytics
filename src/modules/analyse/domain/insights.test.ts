import { describe, expect, it } from "vitest";
import { buildForecast } from "./forecast";
import {
  buildBusinessInsights,
  buildForecastInsights,
  parseInsightBullets,
} from "./insights";

describe("insights", () => {
  it("parses bullet lists and long sentences", () => {
    expect(parseInsightBullets("• One\n• Two")).toEqual(["One", "Two"]);
    const long =
      "Sales rose sharply this quarter. Inventory looks thin for Q3. Restock the top SKU next.";
    expect(parseInsightBullets(long).length).toBeGreaterThan(1);
  });

  it("builds actionable business findings from a table", () => {
    const insights = buildBusinessInsights({
      columns: ["Month", "Sales", "Region"],
      rows: [
        { Month: "2024-01-01", Sales: 100, Region: "North" },
        { Month: "2024-02-01", Sales: 120, Region: "North" },
        { Month: "2024-03-01", Sales: 150, Region: "South" },
        { Month: "2024-04-01", Sales: 180, Region: "North" },
      ],
    });
    expect(insights.length).toBeGreaterThan(1);
    expect(insights.some((i) => i.kind === "action" || i.kind === "trend")).toBe(
      true,
    );
  });

  it("summarises forecast outlook with KPIs", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "Jan", Sales: 10 },
          { Month: "Feb", Sales: 20 },
          { Month: "Mar", Sales: 30 },
          { Month: "Apr", Sales: 40 },
        ],
      },
      {
        column: "Sales",
        periodColumn: "Month",
        periods: 2,
        method: "trend",
        confidenceBand: true,
      },
    );
    const { insights, kpis } = buildForecastInsights(result);
    expect(kpis.lastActual).toBe(40);
    expect(kpis.nextForecast).toBeGreaterThan(40);
    expect(insights.some((i) => i.kind === "outlook")).toBe(true);
  });
});
