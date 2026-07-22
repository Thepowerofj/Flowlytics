import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/modules/ingest/domain/parseTable";
import { buildForecast, forecastValues } from "./forecast";
import { aggregateTable } from "./aggregate";
import { computeStats } from "./stats";

const fixtures = path.join(process.cwd(), "fixtures", "analytics");

function loadCsv(name: string) {
  const raw = readFileSync(path.join(fixtures, name), "utf8");
  return parseCsv(raw);
}

describe("analytics accuracy fixtures", () => {
  it("unsorted timeseries matches sorted after auto period order", () => {
    const sorted = loadCsv("timeseries_sorted.csv");
    const unsorted = loadCsv("timeseries_unsorted.csv");
    const a = buildForecast(sorted, {
      column: "Sales",
      periodColumn: "Month",
      periods: 2,
      method: "trend",
      periodOrder: "auto",
    });
    const b = buildForecast(unsorted, {
      column: "Sales",
      periodColumn: "Month",
      periods: 2,
      method: "trend",
      periodOrder: "auto",
    });
    expect(b.periodReordered).toBe(true);
    expect(a.actual).toEqual(b.actual);
    expect(a.forecast).toEqual(b.forecast);
    expect(a.forecast[0]).toBeGreaterThan(150);
  });

  it("as_is on unsorted data produces wrong history order (documented risk)", () => {
    const unsorted = loadCsv("timeseries_unsorted.csv");
    const wrong = buildForecast(unsorted, {
      column: "Sales",
      periodColumn: "Month",
      periods: 1,
      method: "naive",
      periodOrder: "as_is",
    });
    expect(wrong.actual[0]).toBe(130);
    expect(wrong.chronologyWarning).toBe(true);
  });

  it("naive and moving_average match known answers on sorted series", () => {
    expect(
      forecastValues([100, 110, 120, 130, 140, 150], {
        method: "naive",
        periods: 2,
      }),
    ).toEqual([150, 150]);
    expect(
      forecastValues([100, 110, 120, 130, 140, 150], {
        method: "moving_average",
        periods: 1,
        window: 3,
      })[0],
    ).toBe(140);
  });

  it("categorical aggregate sums match fixture", () => {
    const table = loadCsv("categorical_sales.csv");
    const out = aggregateTable(table, {
      groupBy: ["Region"],
      metrics: [{ column: "Amount", op: "sum", as: "total" }],
    });
    const north = out.rows.find((r) => r.Region === "North");
    expect(north?.total).toBe(700);
  });

  it("messy currency fixture loads four revenue rows", () => {
    const table = loadCsv("messy_currency.csv");
    expect(table.columns).toContain("Revenue");
    expect(table.rows.length).toBe(4);
    const stats = computeStats(table);
    expect(stats).toBeTruthy();
  });
});
