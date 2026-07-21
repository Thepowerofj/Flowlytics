import { describe, expect, it } from "vitest";
import { projectColumns } from "./downloadCsv";

/** Mirrors StructureOutputPanel preview header resolution for regression. */
function resolveHeaders(
  columns: string[],
  selectedColumns: string[],
): string[] {
  if (selectedColumns.length > 0) {
    return selectedColumns.filter((c) => columns.includes(c));
  }
  return columns.length > 0 ? [...columns] : ["Region", "Category", "Amount"];
}

describe("structure export preview headers", () => {
  it("uses example headers when nothing is wired", () => {
    expect(resolveHeaders([], [])).toEqual(["Region", "Category", "Amount"]);
  });

  it("follows selected column order for the preview", () => {
    const headers = resolveHeaders(
      ["A", "B", "C"],
      ["C", "A"],
    );
    expect(headers).toEqual(["C", "A"]);
    const projected = projectColumns(
      {
        columns: ["A", "B", "C"],
        rows: [{ A: 1, B: 2, C: 3 }],
      },
      headers,
    );
    expect(projected.columns).toEqual(["C", "A"]);
    expect(projected.rows[0]).toEqual({ C: 3, A: 1 });
  });
});
