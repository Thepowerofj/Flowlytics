import { describe, expect, it } from "vitest";
import {
  describeCronKind,
  encodeCronKind,
  intervalMsFromCronKind,
  nextRunAtFromCronKind,
  occurrencesInRange,
} from "./scheduleTiming";

describe("scheduleTiming", () => {
  it("encodes custom intervals", () => {
    expect(encodeCronKind({ cronKind: "custom", every: 6, unit: "h" })).toBe(
      "custom:6h",
    );
    expect(encodeCronKind({ cronKind: "custom", every: 2, unit: "d" })).toBe(
      "custom:2d",
    );
  });

  it("computes next run for custom hours", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = nextRunAtFromCronKind("custom:6h", from);
    expect(next.toISOString()).toBe("2026-01-01T06:00:00.000Z");
    expect(intervalMsFromCronKind("custom:2d")).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("describes kinds", () => {
    expect(describeCronKind("custom:12h")).toBe("Every 12 hours");
    expect(describeCronKind("weekly")).toBe("Weekly");
  });

  it("expands daily occurrences inside a range", () => {
    const hits = occurrencesInRange(
      "daily",
      "2026-07-22T09:00:00.000Z",
      "2026-07-20T00:00:00.000Z",
      "2026-07-25T23:59:59.999Z",
    );
    expect(hits.map((d) => d.toISOString())).toEqual([
      "2026-07-20T09:00:00.000Z",
      "2026-07-21T09:00:00.000Z",
      "2026-07-22T09:00:00.000Z",
      "2026-07-23T09:00:00.000Z",
      "2026-07-24T09:00:00.000Z",
      "2026-07-25T09:00:00.000Z",
    ]);
  });
});
