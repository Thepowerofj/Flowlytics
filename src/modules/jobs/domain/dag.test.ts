import { describe, expect, it } from "vitest";
import { topologicalOrder } from "./dag";

describe("topologicalOrder", () => {
  it("orders linear flow", () => {
    const order = topologicalOrder({
      nodes: [
        { id: "a", type: "ingest.csv_excel", x: 0, y: 0, config: {} },
        { id: "b", type: "analyse.stats", x: 0, y: 0, config: {} },
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
    });
    expect(order).toEqual(["a", "b"]);
  });
});
