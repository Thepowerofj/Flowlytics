import { describe, expect, it } from "vitest";
import {
  alignFlowGraph,
  estimateNodeSize,
  estimatedNodeWidth,
  SHOWCASE_SIZES,
} from "./flowLayout";

describe("flowLayout", () => {
  it("reserves showcase size when chart has table content", () => {
    const size = estimateNodeSize({
      type: "analyse.chart",
      config: {
        table: {
          columns: ["a", "b"],
          rows: [{ a: 1, b: 2 }],
        },
      },
    });
    expect(size.width).toBe(SHOWCASE_SIZES.chart.width);
    expect(size.height).toBe(SHOWCASE_SIZES.chart.height);
  });

  it("spaces a linear pipeline using showcase widths", () => {
    const table = {
      columns: ["Month", "Sales"],
      rows: [{ Month: "2024-01", Sales: 10 }],
    };
    const graph = alignFlowGraph({
      nodes: [
        {
          id: "a",
          type: "ingest.csv_excel",
          x: 0,
          y: 0,
          config: { table },
        },
        {
          id: "b",
          type: "transform.clean_map",
          x: 10,
          y: 10,
          config: { table },
        },
        {
          id: "c",
          type: "analyse.chart",
          x: 20,
          y: 20,
          config: { table },
        },
        {
          id: "d",
          type: "ai.analyse",
          x: 30,
          y: 5,
          config: {
            insightReport: {
              headline: "Hi",
              findings: [],
              nextSteps: [],
            },
          },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          sourcePort: "table",
          target: "b",
          targetPort: "table",
        },
        {
          id: "e2",
          source: "b",
          sourcePort: "table",
          target: "c",
          targetPort: "table",
        },
        {
          id: "e3",
          source: "c",
          sourcePort: "table",
          target: "d",
          targetPort: "table",
        },
      ],
    });

    const ordered = [...graph.nodes].sort((a, b) => a.x - b.x);
    expect(ordered.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1]!;
      const cur = ordered[i]!;
      const prevRight = prev.x + estimateNodeSize(prev).width;
      expect(cur.x).toBeGreaterThanOrEqual(prevRight + 96);
    }
    // Chart config keeps reserved footprint
    const chart = graph.nodes.find((n) => n.id === "c")!;
    expect(chart.config.nodeWidth).toBe(SHOWCASE_SIZES.chart.width);
    expect(chart.config.nodeHeight).toBe(SHOWCASE_SIZES.chart.height);
  });

  it("stacks siblings using each node's height", () => {
    const table = {
      columns: ["Region", "Sales"],
      rows: [{ Region: "N", Sales: 1 }],
    };
    const graph = alignFlowGraph({
      nodes: [
        { id: "root", type: "ingest.csv_excel", x: 0, y: 0, config: {} },
        {
          id: "c1",
          type: "analyse.stats",
          x: 0,
          y: 0,
          config: { table },
        },
        {
          id: "c2",
          type: "analyse.chart",
          x: 0,
          y: 0,
          config: { table },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "root",
          sourcePort: "table",
          target: "c1",
          targetPort: "table",
        },
        {
          id: "e2",
          source: "root",
          sourcePort: "table",
          target: "c2",
          targetPort: "table",
        },
      ],
    });
    const c1 = graph.nodes.find((n) => n.id === "c1")!;
    const c2 = graph.nodes.find((n) => n.id === "c2")!;
    expect(c1.x).toBe(c2.x);
    const top = c1.y < c2.y ? c1 : c2;
    const bottom = c1.y < c2.y ? c2 : c1;
    const topH = estimateNodeSize(top).height;
    expect(bottom.y).toBeGreaterThanOrEqual(top.y + topH + 72);
  });

  it("prefers live measured sizes when provided", () => {
    const graph = alignFlowGraph(
      {
        nodes: [
          { id: "a", type: "analyse.chart", x: 0, y: 0, config: {} },
          { id: "b", type: "analyse.chart", x: 0, y: 0, config: {} },
        ],
        edges: [
          {
            id: "e1",
            source: "a",
            sourcePort: "table",
            target: "b",
            targetPort: "table",
          },
        ],
      },
      {
        sizes: {
          a: { width: 600, height: 500 },
          b: { width: 600, height: 500 },
        },
      },
    );
    const a = graph.nodes.find((n) => n.id === "a")!;
    const b = graph.nodes.find((n) => n.id === "b")!;
    expect(b.x).toBeGreaterThanOrEqual(a.x + 600 + 96);
    expect(estimatedNodeWidth("ingest.csv_excel")).toBe(
      SHOWCASE_SIZES.compact.width,
    );
  });
});
