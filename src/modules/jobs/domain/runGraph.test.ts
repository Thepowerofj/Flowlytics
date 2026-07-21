import { describe, expect, it } from "vitest";
import { graphForRun, isFlowGraph } from "./runGraph";

const sample: ReturnType<typeof graphForRun> = {
  nodes: [{ id: "a", type: "ingest.csv_excel", x: 0, y: 0, config: {} }],
  edges: [],
};

describe("runGraph", () => {
  it("detects a flow graph", () => {
    expect(isFlowGraph(sample)).toBe(true);
    expect(isFlowGraph({ nodes: [] })).toBe(false);
    expect(isFlowGraph(null)).toBe(false);
  });

  it("prefers the enqueue snapshot over the live flow", () => {
    const snap = {
      nodes: [{ id: "old", type: "analyse.chart", x: 1, y: 1, config: { chartType: "bar" } }],
      edges: [],
    };
    const live = {
      nodes: [{ id: "new", type: "analyse.chart", x: 9, y: 9, config: { chartType: "pie" } }],
      edges: [],
    };
    expect(graphForRun({ graphSnapshotJson: snap }, { graphJson: live })).toEqual(snap);
  });

  it("falls back to live flow when snapshot is missing", () => {
    expect(graphForRun({ graphSnapshotJson: null }, { graphJson: sample })).toEqual(sample);
  });
});
