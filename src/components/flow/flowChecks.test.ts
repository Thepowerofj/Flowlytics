import { describe, expect, it } from "vitest";
import { checkFlow } from "./flowChecks";

describe("checkFlow", () => {
  it("warns on empty canvas", () => {
    const issues = checkFlow([], []);
    expect(issues.some((i) => i.id === "empty")).toBe(true);
  });

  it("errors when a transform has no input edge", () => {
    const issues = checkFlow(
      [
        {
          id: "n1",
          data: { blockType: "transform.clean_map", label: "Clean", config: {} },
        },
      ],
      [],
    );
    expect(issues.some((i) => i.severity === "error" && i.nodeId === "n1")).toBe(true);
    expect(issues.some((i) => i.id === "no-ingest")).toBe(true);
  });

  it("errors when ingest has no file", () => {
    const issues = checkFlow(
      [
        {
          id: "n1",
          data: { blockType: "ingest.csv_excel", label: "Ingest", config: {} },
        },
      ],
      [],
    );
    expect(issues.some((i) => i.id === "ingest-file-n1")).toBe(true);
  });

  it("allows AI Structure with pasted text and no ingest", () => {
    const issues = checkFlow(
      [
        {
          id: "ai1",
          data: {
            blockType: "ai.structure",
            label: "AI Structure",
            config: {
              rawText: "tea 10\ncoffee 12",
              aiOptIn: true,
              outputColumns: [{ name: "item", type: "string" }],
            },
          },
        },
      ],
      [],
    );
    expect(issues.some((i) => i.id === "no-ingest")).toBe(false);
    expect(issues.some((i) => i.id === "unwired-in-ai1")).toBe(false);
  });

  it("detects cycles", () => {
    const issues = checkFlow(
      [
        {
          id: "a",
          data: { blockType: "transform.clean_map", label: "A", config: {} },
        },
        {
          id: "b",
          data: { blockType: "analyse.stats", label: "B", config: {} },
        },
      ],
      [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    );
    expect(issues.some((i) => i.id === "cycle")).toBe(true);
  });
});
