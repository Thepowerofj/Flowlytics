import { describe, expect, it } from "vitest";
import {
  buildForecast,
  forecastValues,
  resolveFutureLabels,
} from "./forecast";

describe("forecast", () => {
  it("projects a rising trend", () => {
    const out = forecastValues([1, 2, 3, 4], { method: "trend", periods: 2 });
    expect(out[0]).toBeGreaterThan(4);
    expect(out[1]).toBeGreaterThan(out[0]!);
  });

  it("uses last value for naive", () => {
    expect(forecastValues([10, 20, 30], { method: "naive", periods: 2 })).toEqual([
      30, 30,
    ]);
  });

  it("moving average uses recent window", () => {
    const out = forecastValues([1, 2, 3, 9], {
      method: "moving_average",
      periods: 1,
      window: 2,
    });
    expect(out[0]).toBe(6);
  });

  it("builds a downloadable history+forecast table", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "Jan", Sales: 10 },
          { Month: "Feb", Sales: 20 },
          { Month: "Mar", Sales: 30 },
        ],
      },
      { column: "Sales", periodColumn: "Month", periods: 2, method: "trend" },
    );
    expect(result.table.columns).toContain("series");
    expect(result.points.some((p) => p.series === "Actual")).toBe(true);
    expect(result.points.filter((p) => p.series === "Forecast")).toHaveLength(2);
    expect(result.actual).toHaveLength(3);
  });

  it("aggregates duplicate dates before forecasting", () => {
    const result = buildForecast(
      {
        columns: ["Date", "Cost"],
        rows: [
          { Date: "2024-01-01", Cost: 10 },
          { Date: "2024-01-01", Cost: 10 },
          { Date: "2024-01-02", Cost: 20 },
          { Date: "2024-01-02", Cost: 20 },
          { Date: "2024-01-03", Cost: 30 },
          { Date: "2024-01-03", Cost: 30 },
        ],
      },
      { column: "Cost", periodColumn: "Date", periods: 2, method: "trend" },
    );
    expect(result.actual).toEqual([20, 40, 60]);
    expect(result.points.filter((p) => p.series === "Forecast").length).toBe(2);
  });

  it("forecasts sales with date period labels (dates need not be numeric)", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "2024-01-01", Sales: 10 },
          { Month: "2024-02-01", Sales: 20 },
          { Month: "2024-03-01", Sales: 30 },
        ],
      },
      { column: "Sales", periodColumn: "Month", periods: 2, method: "trend" },
    );
    expect(result.actual).toHaveLength(3);
    const future = result.points.filter((p) => p.series === "Forecast");
    expect(future).toHaveLength(2);
    expect(future[0]?.period).toBe("2024-04-01");
    expect(future[1]?.period).toBe("2024-05-01");
  });

  it("resolves until-date and custom future horizons", () => {
    const history = ["2024-01-01", "2024-02-01", "2024-03-01"];
    expect(
      resolveFutureLabels(history, {
        futureMode: "until",
        untilDate: "2024-06-01",
      }),
    ).toEqual(["2024-04-01", "2024-05-01", "2024-06-01"]);

    expect(
      resolveFutureLabels(history, {
        futureMode: "custom",
        customFutureDates: "2024-07-01\n2024-08-01",
      }),
    ).toEqual(["2024-07-01", "2024-08-01"]);

    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "2024-01-01", Sales: 10 },
          { Month: "2024-02-01", Sales: 20 },
          { Month: "2024-03-01", Sales: 30 },
        ],
      },
      {
        column: "Sales",
        periodColumn: "Month",
        futureMode: "custom",
        customFutureDates: "Apr-24\nMay-24",
        method: "naive",
      },
    );
    const future = result.points.filter((p) => p.series === "Forecast");
    expect(future).toHaveLength(2);
    expect(future[0]?.period).toBe("2024-04-01");
  });

  it("emits diagnostics, leaderboard metrics, intervals, and scenarios", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Revenue"],
        rows: [
          { Month: "Jan 2024", Revenue: 100 },
          { Month: "Feb 2024", Revenue: 110 },
          { Month: "Mar 2024", Revenue: 121 },
          { Month: "Apr 2024", Revenue: 130 },
          { Month: "May 2024", Revenue: 142 },
          { Month: "Jun 2024", Revenue: 155 },
        ],
      },
      {
        column: "Revenue",
        periodColumn: "Month",
        periods: 3,
        method: "trend",
        confidenceBand: true,
      },
    );

    expect(result.diagnostics?.readiness).toBe("ready");
    expect(result.compare?.length).toBeGreaterThan(1);
    expect(result.backtest?.rmse).toBeGreaterThanOrEqual(0);
    expect(result.intervalMethod).toMatch(/residual/i);
    expect(result.scenarios?.map((s) => s.name)).toEqual([
      "base",
      "upside",
      "downside",
    ]);
    expect(result.points.filter((p) => p.series === "Forecast")[2]?.high).toBeGreaterThan(
      result.points.filter((p) => p.series === "Forecast")[0]?.high ?? 0,
    );
  });

  it("orders quarter and week labels chronologically", () => {
    const quarter = buildForecast(
      {
        columns: ["Period", "Revenue"],
        rows: [
          { Period: "FY2024 Q3", Revenue: 300 },
          { Period: "Q1 2024", Revenue: 100 },
          { Period: "2024 Q2", Revenue: 200 },
        ],
      },
      { column: "Revenue", periodColumn: "Period", periods: 1, method: "trend" },
    );
    expect(quarter.actual).toEqual([100, 200, 300]);

    const week = buildForecast(
      {
        columns: ["Week", "Units"],
        rows: [
          { Week: "2025-W03", Units: 30 },
          { Week: "2025-W01", Units: 10 },
          { Week: "2025-W02", Units: 20 },
        ],
      },
      { column: "Units", periodColumn: "Week", periods: 1, method: "trend" },
    );
    expect(week.actual).toEqual([10, 20, 30]);
  });

  it("tolerates compareMethods stored as a comma string", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "2024-01", Sales: 10 },
          { Month: "2024-02", Sales: 12 },
          { Month: "2024-03", Sales: 14 },
          { Month: "2024-04", Sales: 16 },
        ],
      },
      {
        column: "Sales",
        periodColumn: "Month",
        periods: 1,
        method: "trend",
        compareMethods: "trend,naive" as unknown as string[],
      },
    );
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.compare?.every((c) => typeof c.method === "string")).toBe(true);
  });

  it("skips full leaderboard when compareMethods is an empty array", () => {
    const result = buildForecast(
      {
        columns: ["Month", "Sales"],
        rows: [
          { Month: "2024-01", Sales: 10 },
          { Month: "2024-02", Sales: 12 },
          { Month: "2024-03", Sales: 14 },
          { Month: "2024-04", Sales: 16 },
          { Month: "2024-05", Sales: 18 },
          { Month: "2024-06", Sales: 20 },
        ],
      },
      {
        column: "Sales",
        periodColumn: "Month",
        periods: 1,
        method: "trend",
        compareMethods: [],
      },
    );
    expect(result.compare?.length).toBe(1);
    expect(result.compare?.[0]?.method).toBe("trend");
  });
});
