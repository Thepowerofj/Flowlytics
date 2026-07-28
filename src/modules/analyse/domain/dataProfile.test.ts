import { describe, expect, it } from "vitest";
import { profileDataset } from "./dataProfile";

describe("profileDataset", () => {
  it("detects transactional rows with duplicate periods", () => {
    const profile = profileDataset(
      {
        columns: ["Date", "Region", "Revenue"],
        rows: [
          { Date: "2025-01-01", Region: "North", Revenue: 100 },
          { Date: "2025-01-01", Region: "South", Revenue: 120 },
          { Date: "2025-01-02", Region: "North", Revenue: 90 },
        ],
      },
      { periodColumn: "Date", measureColumn: "Revenue", categoryColumn: "Region" },
    );

    expect(profile.rowGrain).toBe("transaction");
    expect(profile.duplicatePeriods).toBe(1);
    expect(profile.recommendedAggregation).toEqual({
      grain: "period",
      groupBy: ["Date"],
      measure: "Revenue",
      op: "sum",
    });
    expect(profile.warnings.join(" ")).toMatch(/aggregated before forecasting/i);
  });
});
