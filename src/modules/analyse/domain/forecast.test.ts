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
});
