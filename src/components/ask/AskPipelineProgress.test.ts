import { describe, expect, it } from "vitest";

/** Mirror of active-step logic used by AskPipelineProgress (keep in sync). */
function activeIndex(
  steps: string[],
  status: string | null | undefined,
  currentStepType: string | null | undefined,
): number {
  const s = (status || "").toUpperCase();
  if (s === "SUCCEEDED") return steps.length;
  if (s === "FAILED" || s === "CANCELLED") {
    const i = currentStepType ? steps.indexOf(currentStepType) : -1;
    return i >= 0 ? i : Math.max(0, steps.length - 1);
  }
  if (!steps.length) return -1;
  if (currentStepType) {
    const i = steps.indexOf(currentStepType);
    if (i >= 0) return i;
  }
  if (s === "QUEUED" || s === "RUNNING") return 0;
  return -1;
}

describe("AskPipelineProgress step highlighting", () => {
  const steps = [
    "ingest.csv_excel",
    "transform.clean_map",
    "analyse.stats",
    "analyse.projection",
    "ai.analyse",
    "output.presentation",
    "output.structure",
  ];

  it("highlights the live block type while running", () => {
    expect(activeIndex(steps, "RUNNING", "analyse.projection")).toBe(3);
    expect(activeIndex(steps, "QUEUED", null)).toBe(0);
  });

  it("marks all steps past the end when succeeded", () => {
    expect(activeIndex(steps, "SUCCEEDED", null)).toBe(steps.length);
  });

  it("pins the failed step", () => {
    expect(activeIndex(steps, "FAILED", "ai.analyse")).toBe(4);
  });
});
