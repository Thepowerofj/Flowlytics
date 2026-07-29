import { describe, expect, it } from "vitest";
import { stratifiedGraphSample } from "./sampleTable";

describe("stratifiedGraphSample", () => {
  it("keeps rows from multiple Excel-serial months instead of only the first block", () => {
    const rows = [];
    for (let m = 0; m < 5; m++) {
      const month = 46082 + m * 31;
      for (let i = 0; i < 30; i++) {
        rows.push({
          tx_month: month,
          total_missed_value: 100 + m * 10 + i,
        });
      }
    }
    const table = {
      columns: ["tx_month", "total_missed_value"],
      rows,
    };
    const sample = stratifiedGraphSample(table, 40);
    expect(sample.rows).toHaveLength(40);
    const months = new Set(sample.rows.map((r) => String(r.tx_month)));
    expect(months.size).toBe(5);
  });

  it("falls back to head sample when no date column exists", () => {
    const table = {
      columns: ["region", "sales"],
      rows: Array.from({ length: 100 }, (_, i) => ({
        region: `R${i % 3}`,
        sales: i,
      })),
    };
    const sample = stratifiedGraphSample(table, 10);
    expect(sample.rows).toHaveLength(10);
    expect(sample.rows[0]?.sales).toBe(0);
    expect(sample.rows[9]?.sales).toBe(9);
  });
});
