import { describe, expect, it } from "vitest";
import {
  autoMapOnConnect,
  bindConfigToUpstream,
  propagatePreviewFrom,
} from "./autoMap";
import { PREVIEW_SAMPLE_ROWS, previewOutputTable } from "./previewPipeline";

describe("autoMapOnConnect", () => {
  it("maps clean_map columns from ingest table sample", () => {
    const result = autoMapOnConnect(
      "ingest.csv_excel",
      {
        table: {
          columns: ["Month", "Sales"],
          rows: [{ Month: "Jan", Sales: 10 }],
        },
      },
      "transform.clean_map",
      {},
    );
    expect(result.columnMap).toEqual({ Month: "Month", Sales: "Sales" });
    expect(result._sourceColumns).toEqual(["Month", "Sales"]);
    expect(result._previewSample).toBe(true);
  });

  it("passes cleaned renamed columns to structure output", () => {
    const result = autoMapOnConnect(
      "transform.clean_map",
      {
        table: {
          columns: ["Month", "Sales"],
          rows: [{ Month: "Jan", Sales: 10 }],
        },
        columnMap: { Month: "Period", Sales: "Revenue" },
        dropColumns: [],
        transforms: {},
      },
      "output.structure",
      {},
    );
    expect(result._sourceColumns).toEqual(["Period", "Revenue"]);
    expect(result.selectedColumns).toEqual(["Period", "Revenue"]);
    expect((result.table as { columns: string[] }).columns).toEqual([
      "Period",
      "Revenue",
    ]);
  });

  it("selects all columns for structure when only source columns exist", () => {
    const result = autoMapOnConnect(
      "ingest.csv_excel",
      {
        table: {
          columns: ["a", "b"],
          rows: [{ a: 1, b: 2 }],
        },
      },
      "output.structure",
      {},
    );
    expect(result.selectedColumns).toEqual(["a", "b"]);
  });
});

describe("AI structure wiring", () => {
  it("previews configured output columns before Run", () => {
    const out = previewOutputTable("ai.structure", {
      outputColumns: [
        { name: "item", type: "string" },
        { name: "amount", type: "number" },
      ],
      table: {
        columns: ["raw"],
        rows: [{ raw: "tea 10" }],
      },
    });
    expect(out).toEqual({ columns: ["item", "amount"], rows: [] });
  });

  it("auto-maps Clean/Map from AI Structure schema", () => {
    const result = autoMapOnConnect(
      "ai.structure",
      {
        outputColumns: [
          { name: "item", type: "string" },
          { name: "amount", type: "number" },
        ],
        aiOptIn: true,
      },
      "transform.clean_map",
      {},
    );
    expect(result._sourceColumns).toEqual(["item", "amount"]);
    expect(result.columnMap).toEqual({ item: "item", amount: "amount" });
  });

  it("applies AI chart suggestion onto Chart activity", () => {
    const result = autoMapOnConnect(
      "ai.chart",
      {
        table: {
          columns: ["category", "value"],
          rows: [{ category: "A", value: 1 }],
        },
        suggestedChart: {
          chartType: "pie",
          xColumn: "category",
          yColumn: "value",
          reason: "share of total",
        },
      },
      "analyse.chart",
      {},
    );
    expect(result.chartType).toBe("pie");
    expect(result.xColumn).toBe("category");
    expect(result.yColumn).toBe("value");
    expect(result.suggestionId).toBe("ai-suggest");
  });

  it("does not overwrite AI Structure schema when wiring upstream", () => {
    const result = autoMapOnConnect(
      "ingest.csv_excel",
      {
        table: {
          columns: ["Notes"],
          rows: [{ Notes: "x" }],
        },
      },
      "ai.structure",
      {
        outputColumns: [{ name: "item", type: "string" }],
        aiOptIn: true,
        rawText: "hello",
      },
    );
    expect(result.outputColumns).toEqual([{ name: "item", type: "string" }]);
    expect(result._upstreamColumns).toEqual(["Notes"]);
    expect(result.rawText).toBe("hello");
  });
});

describe("previewOutputTable", () => {
  it("samples ingest to PREVIEW_SAMPLE_ROWS", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      n: i,
    }));
    const out = previewOutputTable("ingest.csv_excel", {
      table: { columns: ["n"], rows },
    });
    expect(out?.rows).toHaveLength(PREVIEW_SAMPLE_ROWS);
  });

  it("applies clean_map transforms for preview output", () => {
    const out = previewOutputTable("transform.clean_map", {
      table: {
        columns: ["Name", "Amt"],
        rows: [
          { Name: "  alice ", Amt: "10" },
          { Name: "bob", Amt: "20" },
        ],
      },
      columnMap: { Name: "name", Amt: "amount" },
      dropColumns: [],
      transforms: {
        Name: {
          type: "string",
          trim: true,
          textCase: "lower",
          fillNull: "",
          dropIfEmpty: false,
          decimals: null,
          stripCurrency: false,
          dateFormat: "auto",
        },
        Amt: {
          type: "number",
          trim: true,
          textCase: "none",
          fillNull: "",
          dropIfEmpty: false,
          decimals: null,
          stripCurrency: false,
          dateFormat: "auto",
        },
      },
    });
    expect(out?.columns).toEqual(["name", "amount"]);
    expect(out?.rows[0]).toEqual({ name: "alice", amount: 10 });
  });
});

describe("propagatePreviewFrom", () => {
  it("cascades cleaned preview from clean_map to chart", () => {
    const nodes = [
      {
        id: "ingest",
        data: {
          blockType: "ingest.csv_excel",
          config: {
            table: {
              columns: ["A", "B"],
              rows: [
                { A: "x", B: 1 },
                { A: "y", B: 2 },
              ],
            },
          },
        },
      },
      {
        id: "clean",
        data: {
          blockType: "transform.clean_map",
          config: {
            table: {
              columns: ["A", "B"],
              rows: [
                { A: "x", B: 1 },
                { A: "y", B: 2 },
              ],
            },
            columnMap: { A: "Label", B: "Value" },
            dropColumns: [],
            transforms: {},
          },
        },
      },
      {
        id: "chart",
        data: {
          blockType: "analyse.chart",
          config: {},
        },
      },
    ];
    const edges = [
      { source: "ingest", target: "clean" },
      { source: "clean", target: "chart" },
    ];
    const next = propagatePreviewFrom(nodes, edges, "clean");
    const chart = next.find((n) => n.id === "chart")!;
    const cfg = chart.data.config as Record<string, unknown>;
    expect(cfg._sourceColumns).toEqual(["Label", "Value"]);
    expect((cfg.table as { columns: string[] }).columns).toEqual(["Label", "Value"]);
  });

  it("preserves full-run tables when binding upstream", () => {
    const fullRows = Array.from({ length: 40 }, (_, i) => ({
      Region: "N",
      Sales: i,
    }));
    const bound = bindConfigToUpstream(
      "analyse.stats",
      {
        table: { columns: ["Region", "Sales"], rows: fullRows },
        _previewSample: false,
      },
      "transform.clean_map",
      {
        table: {
          columns: ["Region", "Sales"],
          rows: fullRows,
        },
        columnMap: { Region: "Region", Sales: "Sales" },
        dropColumns: [],
      },
    );
    expect(bound._previewSample).toBe(false);
    expect((bound.table as { rows: unknown[] }).rows).toHaveLength(40);
  });

  it("rebinds Aggregate input from upstream — never its own output columns", () => {
    const bound = bindConfigToUpstream(
      "transform.aggregate",
      {
        // Stale: previously polluted with aggregate output (the circular bug)
        table: {
          columns: ["Region", "sum_Sales"],
          rows: [{ Region: "N", sum_Sales: 15 }],
        },
        groupBy: ["Region"],
        metrics: [{ column: "Sales", op: "sum", as: "sum_Sales" }],
        _previewSample: false,
        _runOutputTable: {
          columns: ["Region", "sum_Sales"],
          rows: [{ Region: "N", sum_Sales: 15 }],
        },
      },
      "transform.clean_map",
      {
        table: {
          columns: ["Region", "Sales"],
          rows: [
            { Region: "N", Sales: 10 },
            { Region: "N", Sales: 5 },
          ],
        },
        columnMap: { Region: "Region", Sales: "Sales" },
        dropColumns: [],
        transforms: {},
      },
    );
    expect((bound.table as { columns: string[] }).columns).toEqual([
      "Region",
      "Sales",
    ]);
    expect(bound.groupBy).toEqual(["Region"]);
    expect(
      (bound.metrics as { column: string }[]).some((m) => m.column === "Sales"),
    ).toBe(true);
    expect(bound._runOutputTable).toEqual({
      columns: ["Region", "sum_Sales"],
      rows: [{ Region: "N", sum_Sales: 15 }],
    });
  });

  it("passes aggregate output columns to chart", () => {
    const result = autoMapOnConnect(
      "transform.aggregate",
      {
        table: {
          columns: ["Region", "Sales"],
          rows: [
            { Region: "N", Sales: 10 },
            { Region: "N", Sales: 5 },
            { Region: "S", Sales: 20 },
          ],
        },
        groupBy: ["Region"],
        metrics: [{ column: "Sales", op: "sum", as: "TotalSales" }],
      },
      "analyse.chart",
      {},
    );
    expect(result._sourceColumns).toEqual(["Region", "TotalSales"]);
    expect((result.table as { columns: string[] }).columns).toEqual([
      "Region",
      "TotalSales",
    ]);
    expect((result.table as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("carries Clean/Map currency formats to chart and aggregate metrics", () => {
    const clean = {
      table: {
        columns: ["Region", "Sales"],
        rows: [{ Region: "N", Sales: 10 }],
      },
      columnMap: { Region: "Region", Sales: "Sales" },
      dropColumns: [] as string[],
      transforms: {
        Region: { type: "string" as const, trim: true, textCase: "none" as const, fillNull: "", dropIfEmpty: false, decimals: null, stripCurrency: false, currencyCode: "ZAR" as const, useGrouping: true, dateFormat: "auto" as const },
        Sales: {
          type: "currency" as const,
          trim: true,
          textCase: "none" as const,
          fillNull: "",
          dropIfEmpty: false,
          decimals: 2,
          stripCurrency: true,
          currencyCode: "ZAR" as const,
          useGrouping: true,
          dateFormat: "auto" as const,
        },
      },
    };
    const chart = autoMapOnConnect(
      "transform.clean_map",
      clean,
      "analyse.chart",
      {},
    );
    expect(
      (chart._columnFormats as Record<string, { kind: string; currencyCode?: string }>)
        .Sales,
    ).toMatchObject({ kind: "currency", currencyCode: "ZAR" });

    const agg = autoMapOnConnect(
      "transform.clean_map",
      clean,
      "transform.aggregate",
      {},
    );
    expect(agg._inputColumnFormats).toMatchObject({
      Sales: { kind: "currency", currencyCode: "ZAR" },
    });
    const outFormats = agg._columnFormats as Record<
      string,
      { kind: string; currencyCode?: string }
    >;
    // default metric becomes sum_Sales
    const metricKey = Object.keys(outFormats).find((k) => k !== "Region");
    expect(metricKey).toBeTruthy();
    expect(outFormats[metricKey!]).toMatchObject({
      kind: "currency",
      currencyCode: "ZAR",
    });
  });

  it("removes dropped columns from downstream chart and structure", () => {
    const nodes = [
      {
        id: "clean",
        data: {
          blockType: "transform.clean_map",
          config: {
            table: {
              columns: ["Region", "Sales", "Notes"],
              rows: [{ Region: "N", Sales: 10, Notes: "x" }],
            },
            columnMap: { Region: "Region", Sales: "Sales", Notes: "Notes" },
            dropColumns: ["Notes"],
            transforms: {},
          },
        },
      },
      {
        id: "chart",
        data: {
          blockType: "analyse.chart",
          config: {
            xColumn: "Notes",
            yColumn: "Sales",
            _sourceColumns: ["Region", "Sales", "Notes"],
            table: {
              columns: ["Region", "Sales", "Notes"],
              rows: [{ Region: "N", Sales: 10, Notes: "x" }],
            },
          },
        },
      },
      {
        id: "structure",
        data: {
          blockType: "output.structure",
          config: {
            selectedColumns: ["Region", "Notes", "Sales"],
            _sourceColumns: ["Region", "Sales", "Notes"],
          },
        },
      },
    ];
    const edges = [
      { source: "clean", target: "chart" },
      { source: "clean", target: "structure" },
    ];
    const next = propagatePreviewFrom(nodes, edges, "clean");
    const chartCfg = next.find((n) => n.id === "chart")!.data.config as Record<
      string,
      unknown
    >;
    const structureCfg = next.find((n) => n.id === "structure")!.data
      .config as Record<string, unknown>;

    expect(chartCfg._sourceColumns).toEqual(["Region", "Sales"]);
    expect((chartCfg.table as { columns: string[] }).columns).toEqual([
      "Region",
      "Sales",
    ]);
    expect(chartCfg.xColumn).not.toBe("Notes");
    expect(structureCfg.selectedColumns).toEqual(["Region", "Sales"]);
    expect(structureCfg._sourceColumns).toEqual(["Region", "Sales"]);
  });
});
