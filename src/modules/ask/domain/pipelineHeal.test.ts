import { describe, expect, it } from "vitest";
import {
  goalWithHealHints,
  healHintFromFailure,
  maxHealAttempts,
} from "./pipelineHeal";

describe("pipelineHeal", () => {
  it("disables forecast after projection failures", () => {
    const hint = healHintFromFailure({
      failedBlockType: "analyse.projection",
      errorMessage: "No numeric measure to forecast",
    });
    expect(hint?.disableForecast).toBe(true);
    expect(hint?.reason).toMatch(/forecast/i);
  });

  it("disables AI after LLM / key errors", () => {
    const hint = healHintFromFailure({
      failedBlockType: "ai.analyse",
      errorMessage: "Add your LLM API key in Settings",
    });
    expect(hint?.disableAi).toBe(true);
  });

  it("acknowledges PII warnings", () => {
    const hint = healHintFromFailure({
      failedBlockType: "ingest.csv_excel",
      errorMessage: "Acknowledge the personal-data warning before running.",
    });
    expect(hint?.acknowledgePii).toBe(true);
  });

  it("stops after max heal attempts", () => {
    expect(
      healHintFromFailure({
        failedBlockType: "analyse.projection",
        errorMessage: "forecast failed",
        priorHealCount: maxHealAttempts(),
      }),
    ).toBeNull();
  });

  it("does not heal missing ingest table", () => {
    expect(
      healHintFromFailure({
        failedBlockType: "ingest.csv_excel",
        errorMessage: "No ingested table. Upload a CSV or Excel file first.",
      }),
    ).toBeNull();
  });

  it("annotates goals with heal hints for planners", () => {
    const g = goalWithHealHints("Forecast Cost", {
      disableForecast: true,
      reason: "x",
    });
    expect(g).toMatch(/skip forecast/i);
  });
});
