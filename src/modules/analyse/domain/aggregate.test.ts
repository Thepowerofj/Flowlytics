import { describe, expect, it } from "vitest";
import { aggregateTable, describeAggregate } from "./aggregate";

const sample = {
  columns: ["Region", "Product", "Sales"],
  rows: [
    { Region: "North", Product: "A", Sales: 10 },
    { Region: "North", Product: "B", Sales: 5 },
    { Region: "South", Product: "A", Sales: 20 },
    { Region: "South", Product: "A", Sales: "R 4" },
  ],
};

describe("aggregateTable", () => {
  it("groups by one column and sums another", () => {
    const out = aggregateTable(sample, {
      groupBy: ["Region"],
      metrics: [{ column: "Sales", op: "sum", as: "TotalSales" }],
    });
    expect(out.columns).toEqual(["Region", "TotalSales"]);
    const north = out.rows.find((r) => r.Region === "North");
    const south = out.rows.find((r) => r.Region === "South");
    expect(north?.TotalSales).toBe(15);
    expect(south?.TotalSales).toBe(24);
  });

  it("supports count without a value column", () => {
    const out = aggregateTable(sample, {
      groupBy: ["Region"],
      metrics: [{ column: "", op: "count", as: "Orders" }],
    });
    expect(out.rows.find((r) => r.Region === "North")?.Orders).toBe(2);
  });

  it("counts distinct values", () => {
    const out = aggregateTable(sample, {
      groupBy: ["Region"],
      metrics: [{ column: "Product", op: "count_distinct", as: "Products" }],
    });
    expect(out.rows.find((r) => r.Region === "North")?.Products).toBe(2);
    expect(out.rows.find((r) => r.Region === "South")?.Products).toBe(1);
  });

  it("computes percent of total for a sum column", () => {
    const out = aggregateTable(sample, {
      groupBy: ["Region"],
      metrics: [{ column: "Sales", op: "pct_total", as: "Share" }],
    });
    const north = out.rows.find((r) => r.Region === "North")?.Share as number;
    const south = out.rows.find((r) => r.Region === "South")?.Share as number;
    expect(north + south).toBeCloseTo(100, 1);
  });
});

describe("describeAggregate", () => {
  it("does not throw when metrics/groupBy are compacted non-arrays", () => {
    expect(
      describeAggregate({
        groupBy: "Region" as unknown as string[],
        metrics: "sum(Sales)" as unknown as [],
      }),
    ).toMatch(/Configure|count|totals/i);
    expect(
      describeAggregate({
        groupBy: ["Region"],
        metrics: [{ column: "Sales", op: "sum", as: "Total" }],
      }),
    ).toContain("sum(Sales)");
  });
});
