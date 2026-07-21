import { describe, expect, it } from "vitest";
import { formatDurationMs, runDurationMs } from "./runTiming";

describe("runTiming", () => {
  it("formats short and long durations", () => {
    expect(formatDurationMs(450)).toBe("450ms");
    expect(formatDurationMs(1500)).toBe("1.5s");
    expect(formatDurationMs(65_000)).toBe("1m 5s");
  });

  it("computes finished run duration from startedAt", () => {
    const ms = runDurationMs({
      status: "SUCCEEDED",
      createdAt: "2026-07-20T10:00:00.000Z",
      startedAt: "2026-07-20T10:00:01.000Z",
      finishedAt: "2026-07-20T10:00:04.500Z",
    });
    expect(ms).toBe(3500);
  });

  it("uses live clock for running jobs", () => {
    const ms = runDurationMs({
      status: "RUNNING",
      createdAt: "2026-07-20T10:00:00.000Z",
      startedAt: "2026-07-20T10:00:00.000Z",
      finishedAt: null,
      now: Date.parse("2026-07-20T10:00:12.000Z"),
    });
    expect(ms).toBe(12_000);
  });
});
