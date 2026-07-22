import { describe, expect, it } from "vitest";
import {
  columnLooksLikeDate,
  columnLooksLikeIdentifier,
  computeStats,
  forecastMeasureColumns,
  guessPeriodColumn,
  pickForecastMeasure,
  projectSeries,
  toCsv,
  toNumeric,
} from "./stats";

describe("analyse stats", () => {
  it("computes numeric stats", () => {
    const stats = computeStats({
      columns: ["sales"],
      rows: [{ sales: 10 }, { sales: 20 }],
    });
    expect(stats[0].kind).toBe("numeric");
    expect(stats[0].mean).toBe(15);
  });

  it("treats numeric-looking strings as numeric", () => {
    const stats = computeStats({
      columns: ["amount"],
      rows: [{ amount: "1,200" }, { amount: "R 340.5" }, { amount: "10" }],
    });
    expect(stats[0].kind).toBe("numeric");
    expect(stats[0].min).toBe(10);
    expect(stats[0].max).toBe(1200);
  });

  it("parses European / SA decimals", () => {
    expect(toNumeric("1 234,56")).toBeCloseTo(1234.56);
    expect(toNumeric("1.234,5")).toBeCloseTo(1234.5);
  });

  it("does not treat date/month columns as forecast measures", () => {
    const table = {
      columns: ["Month", "Sales"],
      rows: [
        { Month: "Jan-24", Sales: 10 },
        { Month: "Feb-24", Sales: 20 },
        { Month: "2024-03-01", Sales: 30 },
      ],
    };
    expect(columnLooksLikeDate(table, "Month")).toBe(true);
    expect(forecastMeasureColumns(table)).toEqual(["Sales"]);
    expect(guessPeriodColumn(table, "Sales")).toBe("Month");
  });

  it("ignores ID-like numerics such as pharmacyId when ranking measures", () => {
    const table = {
      columns: ["Month", "pharmacyId", "Sales"],
      rows: [
        { Month: "2024-01-01", pharmacyId: 101, Sales: 120 },
        { Month: "2024-02-01", pharmacyId: 102, Sales: 140 },
        { Month: "2024-03-01", pharmacyId: 103, Sales: 160 },
        { Month: "2024-04-01", pharmacyId: 104, Sales: 155 },
      ],
    };
    expect(columnLooksLikeIdentifier(table, "pharmacyId")).toBe(true);
    expect(forecastMeasureColumns(table)).toEqual(["Sales"]);
    expect(pickForecastMeasure(table, "forecast next 3 months")).toBe("Sales");
    expect(pickForecastMeasure(table, "predict sales")).toBe("Sales");
  });

  it("projects a rising series", () => {
    const forecast = projectSeries([1, 2, 3, 4], 2);
    expect(forecast.length).toBe(2);
    expect(forecast[0]).toBeGreaterThan(4);
  });

  it("exports csv", () => {
    const csv = toCsv({
      columns: ["a", "b"],
      rows: [{ a: 1, b: "x" }],
    });
    expect(csv).toContain("a,b");
    expect(csv).toContain("1,x");
  });
});
