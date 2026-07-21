import { describe, expect, it } from "vitest";
import {
  applyRunOutputsToNodes,
  mergeRunOutputIntoConfig,
  stepOutputsByBlockId,
} from "./applyRunOutputs";

describe("applyRunOutputs", () => {
  it("indexes succeeded step tables", () => {
    const map = stepOutputsByBlockId([
      {
        blockId: "stats1",
        status: "SUCCEEDED",
        outputJson: {
          table: { columns: ["A"], rows: [{ A: 1 }, { A: 2 }] },
          stats: [{ column: "A" }],
        },
      },
      { blockId: "fail", status: "FAILED", outputJson: { table: { columns: ["X"], rows: [] } } },
    ]);
    expect(map.get("stats1")?.table).toEqual({
      columns: ["A"],
      rows: [{ A: 1 }, { A: 2 }],
    });
    expect(map.has("fail")).toBe(false);
  });

  it("marks config as full-run (not preview sample)", () => {
    const next = mergeRunOutputIntoConfig(
      {
        table: { columns: ["A"], rows: [{ A: 1 }] },
        _previewSample: true,
        _columnFormats: {
          A: { kind: "currency", currencyCode: "USD", useGrouping: true },
        },
      },
      {
        table: {
          columns: ["A"],
          rows: Array.from({ length: 40 }, (_, i) => ({ A: i })),
        },
      },
    );
    expect(next._previewSample).toBe(false);
    expect((next.table as { rows: unknown[] }).rows).toHaveLength(40);
    expect(next._columnFormats).toEqual({
      A: { kind: "currency", currencyCode: "USD", useGrouping: true },
    });
  });


  it("updates matching activity nodes", () => {
    const nodes = applyRunOutputsToNodes(
      [
        {
          id: "s1",
          data: {
            blockType: "analyse.stats",
            config: {
              table: { columns: ["Sales"], rows: [{ Sales: 1 }] },
              _previewSample: true,
            },
          },
        },
      ],
      [
        {
          blockId: "s1",
          status: "SUCCEEDED",
          outputJson: {
            table: {
              columns: ["Sales"],
              rows: [{ Sales: 1 }, { Sales: 2 }, { Sales: 3 }],
            },
          },
        },
      ],
    );
    expect(nodes[0]!.data.config._previewSample).toBe(false);
    expect((nodes[0]!.data.config.table as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it("does not overwrite Forecast input table with its own output", () => {
    const inputTable = {
      columns: ["Month", "Sales"],
      rows: [
        { Month: "Jan", Sales: 10 },
        { Month: "Feb", Sales: 20 },
      ],
    };
    const next = mergeRunOutputIntoConfig(
      {
        table: inputTable,
        column: "Sales",
        method: "trend",
        _previewSample: true,
      },
      {
        table: {
          columns: ["period", "value", "series"],
          rows: [
            { period: "Jan", value: 10, series: "Actual" },
            { period: "F1", value: 30, series: "Forecast" },
          ],
        },
      },
      "analyse.projection",
    );
    expect(next.table).toEqual(inputTable);
    expect(next.column).toBe("Sales");
    expect(next._runOutputTable).toMatchObject({
      columns: ["period", "value", "series"],
    });
  });

  it("auto-fills AI Structure builder from suggested schema when unlocked", () => {
    const next = mergeRunOutputIntoConfig(
      {
        aiOptIn: true,
        outputColumns: [],
        lockSchema: false,
      },
      {
        table: {
          columns: ["item", "amount"],
          rows: [
            { item: "Tea", amount: 10 },
            { item: "Coffee", amount: 12 },
          ],
        },
        suggestedOutputColumns: [
          { name: "item", type: "string", description: "Suggested" },
          { name: "amount", type: "number", description: "Suggested" },
        ],
        explanation: "Structured 2 rows",
      },
      "ai.structure",
    );
    expect(next.schemaAutoFilled).toBe(true);
    expect(next.outputColumns).toEqual([
      { name: "item", type: "string", description: "Suggested" },
      { name: "amount", type: "number", description: "Suggested" },
    ]);
    expect(next.suggestedOutputColumns).toHaveLength(2);
  });

  it("keeps AI Structure builder columns when the user already defined them", () => {
    const builder = [
      { name: "item", type: "string" as const },
      { name: "amount", type: "number" as const },
    ];
    const next = mergeRunOutputIntoConfig(
      {
        aiOptIn: true,
        outputColumns: builder,
        lockSchema: true,
      },
      {
        table: {
          columns: ["item", "amount"],
          rows: [{ item: "Tea", amount: 10 }],
        },
        suggestedOutputColumns: [
          { name: "product", type: "string" },
          { name: "total", type: "number" },
        ],
      },
      "ai.structure",
    );
    expect(next.outputColumns).toEqual(builder);
    expect(next.suggestedOutputColumns).toEqual([
      { name: "product", type: "string" },
      { name: "total", type: "number" },
    ]);
  });

  it("does not overwrite Aggregate input table with its own output", () => {
    const inputTable = {
      columns: ["Region", "Sales"],
      rows: [
        { Region: "N", Sales: 10 },
        { Region: "N", Sales: 5 },
      ],
    };
    const next = mergeRunOutputIntoConfig(
      {
        table: inputTable,
        groupBy: ["Region"],
        metrics: [{ column: "Sales", op: "sum", as: "Total" }],
        _previewSample: true,
      },
      {
        table: {
          columns: ["Region", "Total"],
          rows: [{ Region: "N", Total: 15 }],
        },
      },
      "transform.aggregate",
    );
    expect(next.table).toEqual(inputTable);
    expect(next._sourceColumns).toBeUndefined();
    expect(next._previewSample).toBe(false);
    expect(next._runOutputTable).toEqual({
      columns: ["Region", "Total"],
      rows: [{ Region: "N", Total: 15 }],
    });
  });
});
