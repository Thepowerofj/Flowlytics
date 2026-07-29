import { describe, expect, it } from "vitest";
import { assessPartialLastPeriod } from "./partialPeriod";
import { buildForecast } from "./forecast";
import { buildGroupedForecast, isGroupedForecastResult } from "./groupedForecast";

describe("partial last period", () => {
  it("flags a magnitude collapse vs prior median as incomplete", () => {
    const assessment = assessPartialLastPeriod(
      ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"],
      [100, 110, 105, 108, 20],
      new Date("2026-07-15T12:00:00Z"),
    );
    expect(assessment.isPartial).toBe(true);
    expect(assessment.reason).toMatch(/incomplete|open|current month/i);
  });

  it("excludes the incomplete last month from the forecast fit", () => {
    const table = {
      columns: ["month", "value"],
      rows: [
        { month: "2026-03-01", value: 100 },
        { month: "2026-04-01", value: 110 },
        { month: "2026-05-01", value: 120 },
        { month: "2026-06-01", value: 130 },
        { month: "2026-07-01", value: 15 }, // MTD stub
      ],
    };
    const withPartial = buildForecast(table, {
      column: "value",
      periodColumn: "month",
      periods: 2,
      method: "trend",
      compareMethods: [],
      excludePartialLastPeriod: false,
    });
    const withoutPartial = buildForecast(table, {
      column: "value",
      periodColumn: "month",
      periods: 2,
      method: "trend",
      compareMethods: [],
      excludePartialLastPeriod: true,
    });
    expect(withoutPartial.diagnostics?.excludedPartialLastPeriod).toBe(true);
    expect(withoutPartial.actual).toEqual([100, 110, 120, 130]);
    // Including the stub should pull the next forecast down vs complete-history fit
    expect(withoutPartial.forecast[0]!).toBeGreaterThan(withPartial.forecast[0]!);
  });
});

describe("grouped forecast", () => {
  it("forecasts each scenario separately", () => {
    const rows = [];
    for (const scenario of ["A", "B"]) {
      for (let m = 0; m < 5; m++) {
        rows.push({
          scenario,
          month: `2026-0${m + 1}-01`,
          value: 100 + m * 10 + (scenario === "B" ? 50 : 0),
        });
      }
    }
    const built = buildGroupedForecast(
      { columns: ["scenario", "month", "value"], rows },
      {
        column: "value",
        periodColumn: "month",
        groupColumn: "scenario",
        periods: 2,
        method: "trend",
        compareMethods: [],
      },
    );
    expect(isGroupedForecastResult(built)).toBe(true);
    if (!isGroupedForecastResult(built)) return;
    expect(built.groups).toHaveLength(2);
    expect(built.table.columns).toContain("scenario");
    expect(built.points.some((p) => p.series.includes("A"))).toBe(true);
  });
});
