import { describe, expect, it } from "vitest";
import { previewOutputTable, sampleTable } from "./previewPipeline";

describe("previewOutputTable", () => {
  it("returns null when table rows/columns are compacted non-arrays", () => {
    expect(
      previewOutputTable("ingest.csv_excel", {
        table: { columns: ["A"], rows: "compacted" },
      }),
    ).toBeNull();
    expect(
      previewOutputTable("ingest.csv_excel", {
        table: { columns: "A,B", rows: [{ A: 1 }] },
      }),
    ).toBeNull();
  });

  it("samples a valid table", () => {
    const out = previewOutputTable("ingest.csv_excel", {
      table: {
        columns: ["A"],
        rows: [{ A: 1 }, { A: 2 }],
      },
    });
    expect(out?.columns).toEqual(["A"]);
    expect(out?.rows).toHaveLength(2);
  });

  it("tolerates corrupt aggregate metrics without throwing", () => {
    expect(() =>
      previewOutputTable("transform.aggregate", {
        table: {
          columns: ["Region", "Sales"],
          rows: [{ Region: "N", Sales: 1 }],
        },
        metrics: "bad",
        groupBy: "Region",
      }),
    ).not.toThrow();
  });
});

describe("sampleTable", () => {
  it("coerces missing rows to empty", () => {
    const out = sampleTable({
      columns: ["A"],
      rows: undefined as unknown as [],
    });
    expect(out.rows).toEqual([]);
    expect(out.columns).toEqual(["A"]);
  });
});
