import { describe, expect, it } from "vitest";
import { retryHydrationPlan } from "./retryHydration";

const graph = {
  nodes: [
    { id: "ingest", type: "ingest.csv_excel", x: 0, y: 0, config: {} },
    { id: "clean", type: "transform.clean_map", x: 1, y: 0, config: {} },
    { id: "stats", type: "analyse.stats", x: 2, y: 0, config: {} },
  ],
  edges: [
    {
      id: "e1",
      source: "ingest",
      sourcePort: "table",
      target: "clean",
      targetPort: "table",
    },
    {
      id: "e2",
      source: "clean",
      sourcePort: "table",
      target: "stats",
      targetPort: "table",
    },
  ],
};

describe("retryHydrationPlan", () => {
  it("starts at the retry block when required upstream outputs exist", () => {
    const plan = retryHydrationPlan({
      graph,
      fullOrder: ["ingest", "clean", "stats"],
      retryFromBlockId: "stats",
      availableOutputIds: ["ingest", "clean"],
    });

    expect(plan.hydrated).toBe(true);
    expect(plan.upstreamIds).toEqual(["ingest", "clean"]);
    expect(plan.order).toEqual(["stats"]);
  });

  it("replays the full graph when an upstream dependency is missing", () => {
    const plan = retryHydrationPlan({
      graph,
      fullOrder: ["ingest", "clean", "stats"],
      retryFromBlockId: "stats",
      availableOutputIds: ["ingest"],
    });

    expect(plan.hydrated).toBe(false);
    expect(plan.order).toEqual(["ingest", "clean", "stats"]);
  });
});
