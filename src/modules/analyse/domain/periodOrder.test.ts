import { describe, expect, it } from "vitest";
import {
  comparePeriodKeys,
  isChronologicallySorted,
  orderHistoryPoints,
  periodsLookLikeDates,
} from "./periodOrder";

describe("periodOrder", () => {
  it("detects date-like periods and chronological disorder", () => {
    const sorted = ["2024-01-01", "2024-02-01", "2024-03-01"];
    const unsorted = ["2024-03-01", "2024-01-01", "2024-02-01"];
    expect(periodsLookLikeDates(sorted)).toBe(true);
    expect(isChronologicallySorted(sorted)).toBe(true);
    expect(isChronologicallySorted(unsorted)).toBe(false);
  });

  it("sorts history date_asc for forecasting", () => {
    const points = [
      { label: "2024-03-01", value: 30, rowIndex: 0 },
      { label: "2024-01-01", value: 10, rowIndex: 1 },
      { label: "2024-02-01", value: 20, rowIndex: 2 },
    ];
    const { ordered, reordered, applied } = orderHistoryPoints(points, "auto");
    expect(applied).toBe("date_asc");
    expect(reordered).toBe(true);
    expect(ordered.map((p) => p.label)).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
    ]);
    expect(ordered.map((p) => p.value)).toEqual([10, 20, 30]);
  });

  it("compares period keys chronologically", () => {
    expect(comparePeriodKeys("2024-01-01", "2024-02-01")).toBeLessThan(0);
    expect(comparePeriodKeys("2024-12-01", "2024-01-01")).toBeGreaterThan(0);
  });
});
