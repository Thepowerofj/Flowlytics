import { describe, expect, it } from "vitest";
import { detectPiiInTable } from "./pii";

describe("detectPiiInTable", () => {
  it("flags email columns", () => {
    const findings = detectPiiInTable(
      ["name", "email"],
      [{ name: "Ada", email: "ada@example.com" }],
    );
    expect(findings.some((f) => f.kind === "email")).toBe(true);
  });

  it("returns empty for business totals", () => {
    const findings = detectPiiInTable(
      ["month", "sales"],
      [{ month: "Jan", sales: 1200 }],
    );
    expect(findings).toHaveLength(0);
  });
});
