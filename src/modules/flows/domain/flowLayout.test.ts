import { describe, expect, it } from "vitest";
import { alignFlowGraph, estimatedNodeWidth } from "./flowLayout";

describe("flowLayout", () => {
  it("spaces a linear pipeline without horizontal overlap", () => {
    const graph = alignFlowGraph({
      nodes: [
        { id: "a", type: "ingest.csv_excel", x: 0, y: 0, config: {} },
        { id: "b", type: "transform.clean_map", x: 10, y: 10, config: {} },
        { id: "c", type: "analyse.chart", x: 20, y: 20, config: {} },
        { id: "d", type: "ai.analyse", x: 30, y: 5, config: {} },
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
      const prevRight = prev.x + estimatedNodeWidth(prev.type);
      expect(cur.x).toBeGreaterThanOrEqual(prevRight + 72);
    }
    // Linear chain shares one row
    const ys = new Set(ordered.map((n) => n.y));
    expect(ys.size).toBe(1);
  });

  it("stacks siblings in the same rank", () => {
    const graph = alignFlowGraph({
      nodes: [
        { id: "root", type: "ingest.csv_excel", x: 0, y: 0, config: {} },
        { id: "c1", type: "analyse.stats", x: 0, y: 0, config: {} },
        { id: "c2", type: "analyse.chart", x: 0, y: 0, config: {} },
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
    expect(Math.abs(c1.y - c2.y)).toBeGreaterThanOrEqual(56);
  });
});
