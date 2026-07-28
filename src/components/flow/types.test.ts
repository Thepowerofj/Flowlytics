import { describe, expect, it } from "vitest";
import { tablePreview } from "./types";

describe("tablePreview", () => {
  it("requires real columns and rows arrays", () => {
    expect(
      tablePreview({
        table: { columns: ["A"], rows: [{ A: 1 }] },
      }),
    ).toEqual({ columns: ["A"], rows: [{ A: 1 }] });

    expect(
      tablePreview({
        table: { columns: "A,B", rows: [{ A: 1 }] },
      }),
    ).toBeNull();

    expect(
      tablePreview({
        table: { columns: ["A"], rows: "compacted" },
      }),
    ).toBeNull();

    expect(tablePreview({ table: { columns: ["A"] } })).toBeNull();
  });
});
