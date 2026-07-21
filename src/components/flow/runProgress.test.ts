import { describe, expect, it } from "vitest";
import { buildRunLog, edgeRunVisual, nodeRunVisual } from "./runProgress";
import type { RunState } from "./types";

const baseRun: RunState = {
  id: "r1",
  status: "RUNNING",
  currentBlockId: "n2",
  createdAt: "2026-07-20T10:00:00.000Z",
  startedAt: "2026-07-20T10:00:01.000Z",
  steps: [
    {
      id: "s1",
      blockId: "n1",
      blockType: "ingest.csv_excel",
      status: "SUCCEEDED",
      startedAt: "2026-07-20T10:00:01.000Z",
      finishedAt: "2026-07-20T10:00:02.000Z",
    },
    {
      id: "s2",
      blockId: "n2",
      blockType: "transform.clean_map",
      status: "RUNNING",
      startedAt: "2026-07-20T10:00:02.000Z",
    },
  ],
};

describe("runProgress", () => {
  it("marks completed, active, and pending nodes", () => {
    expect(nodeRunVisual("n1", baseRun)).toBe("succeeded");
    expect(nodeRunVisual("n2", baseRun)).toBe("running");
    expect(nodeRunVisual("n3", baseRun)).toBe("pending");
  });

  it("highlights the edge into the active node", () => {
    expect(edgeRunVisual("n1", "n2", baseRun)).toBe("running");
    expect(edgeRunVisual("n2", "n3", baseRun)).toBe("pending");
  });

  it("builds a run log with step outcomes", () => {
    const lines = buildRunLog(baseRun, {
      n1: "Ingest",
      n2: "Clean / Map",
    });
    expect(lines.some((l) => l.message.includes("Finished · Ingest"))).toBe(true);
    expect(lines.some((l) => l.message.includes("Running · Clean / Map"))).toBe(
      true,
    );
  });
});
