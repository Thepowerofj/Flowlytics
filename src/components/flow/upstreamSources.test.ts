import { describe, expect, it } from "vitest";
import {
  isAncestorOf,
  listAncestorSources,
  rewireInboundSource,
  resolveAncestorPreviewTable,
} from "./upstreamSources";

const nodes = [
  {
    id: "ingest",
    data: {
      blockType: "ingest.csv_excel",
      label: "Upload",
      config: {
        table: {
          columns: ["A"],
          rows: [{ A: 1 }, { A: 2 }],
        },
      },
    },
  },
  {
    id: "clean",
    data: {
      blockType: "transform.clean_map",
      label: "Clean",
      config: {
        table: {
          columns: ["A"],
          rows: [{ A: 1 }, { A: 2 }],
        },
        columnMap: { A: "Amount" },
        dropColumns: [],
        transforms: {},
      },
    },
  },
  {
    id: "agg",
    data: {
      blockType: "transform.aggregate",
      label: "Aggregate",
      config: {
        table: {
          columns: ["Amount"],
          rows: [{ Amount: 1 }, { Amount: 2 }],
        },
        groupBy: [],
        metrics: [{ column: "Amount", op: "sum", as: "Total" }],
      },
    },
  },
  {
    id: "chart",
    data: {
      blockType: "analyse.chart",
      label: "Chart",
      config: {},
    },
  },
];

const edges = [
  { id: "e1", source: "ingest", target: "clean" },
  { id: "e2", source: "clean", target: "agg" },
  { id: "e3", source: "agg", target: "chart" },
];

describe("upstreamSources", () => {
  it("lists ancestors nearest-first", () => {
    const list = listAncestorSources(nodes, edges, "chart");
    expect(list.map((a) => a.id)).toEqual(["agg", "clean", "ingest"]);
  });

  it("uses datasetName when set for picker labels", () => {
    const named = [
      ...nodes.slice(0, 2),
      {
        ...nodes[2]!,
        data: {
          ...nodes[2]!.data,
          config: { ...nodes[2]!.data.config, datasetName: "Sales by region" },
        },
      },
      nodes[3]!,
    ];
    const list = listAncestorSources(named, edges, "chart");
    expect(list[0]?.label).toBe("Sales by region");
    expect(list[0]?.datasetName).toBe("Sales by region");
    expect(list[0]?.kindLabel).toBe("Aggregate");
  });

  it("detects ancestry", () => {
    expect(isAncestorOf(nodes, edges, "clean", "chart")).toBe(true);
    expect(isAncestorOf(nodes, edges, "chart", "clean")).toBe(false);
  });

  it("rewires inbound edge to selected source", () => {
    const next = rewireInboundSource(edges, "chart", "clean", "e-new");
    expect(next.filter((e) => e.target === "chart")).toHaveLength(1);
    expect(next.find((e) => e.target === "chart")?.source).toBe("clean");
    expect(next.find((e) => e.id === "e3")).toBeUndefined();
  });

  it("resolves cleaned preview columns from Clean/Map", () => {
    const table = resolveAncestorPreviewTable(nodes[1]);
    expect(table?.columns).toEqual(["Amount"]);
  });
});
