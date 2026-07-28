import { describe, expect, it } from "vitest";
import {
  compactJsonValue,
  isStackOverflowError,
  safeJsonSlice,
  toJsonValueSafe,
} from "./json";

describe("json safety", () => {
  it("detects stack overflow errors", () => {
    expect(
      isStackOverflowError(new RangeError("Maximum call stack size exceeded")),
    ).toBe(true);
    expect(isStackOverflowError(new Error("nope"))).toBe(false);
  });

  it("compacts tabular payloads and strips _sourceTable", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ n: i }));
    const out = compactJsonValue({
      table: { columns: ["n"], rows },
      _sourceTable: { columns: ["n"], rows },
      points: rows.map((r) => ({ x: r.n, y: r.n })),
    }) as Record<string, unknown>;

    const table = out.table as { rows: unknown[]; _compacted?: boolean };
    expect(table.rows.length).toBeLessThanOrEqual(40);
    expect(table._compacted).toBe(true);
    expect(out._sourceTable).toBeUndefined();
    expect(out._sourceTableSummary).toBeTruthy();
  });

  it("does not inject marker strings into chart insights/points arrays", () => {
    const insights = Array.from({ length: 120 }, (_, i) => `insight ${i}`);
    const points = Array.from({ length: 100 }, (_, i) => ({ x: String(i), y: i }));
    const out = compactJsonValue(
      {
        charts: [
          {
            type: "line",
            title: "Sales",
            insights,
            points,
          },
        ],
      },
      { maxArrayItems: 80 },
    ) as {
      charts: { insights: unknown[]; points: unknown[] }[];
    };

    expect(out.charts[0]!.insights.every((x) => typeof x === "string")).toBe(
      true,
    );
    expect(out.charts[0]!.insights.some((x) => String(x).startsWith("…+"))).toBe(
      false,
    );
    expect(out.charts[0]!.points.every((p) => p && typeof p === "object")).toBe(
      true,
    );
    expect(out.charts[0]!.insights.length).toBeLessThanOrEqual(80);
    expect(out.charts[0]!.points.length).toBeLessThanOrEqual(48);
  });

  it("toJsonValueSafe always returns an object", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const { value } = toJsonValueSafe(circular, "test");
    expect(value).toBeTruthy();
    expect(safeJsonSlice(circular, 80)).toContain("Circular");
  });
});
