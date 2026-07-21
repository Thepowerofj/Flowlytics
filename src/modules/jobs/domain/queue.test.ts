import { describe, expect, it } from "vitest";
import { estimateEtaSeconds, fairPriority } from "./queue";

describe("queue helpers", () => {
  it("estimates eta from position", () => {
    expect(estimateEtaSeconds(3, 20)).toBe(60);
  });

  it("gives paid users higher priority band", () => {
    expect(fairPriority(true)).toBeLessThan(fairPriority(false));
  });
});
