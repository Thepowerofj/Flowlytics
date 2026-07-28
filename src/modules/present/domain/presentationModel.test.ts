import { describe, expect, it } from "vitest";
import { buildPresentationModel } from "./presentationModel";

describe("buildPresentationModel", () => {
  it("builds a packaged deck from insight reports and forecast kpis", () => {
    const model = buildPresentationModel({
      byBlockId: {
        a1: {
          insightReport: {
            headline: "Sales rising",
            summary: "Steady growth",
            findings: [{ title: "North leads", detail: "Top region" }],
            nextSteps: ["Stock more"],
          },
        },
        f1: {
          projection: {
            column: "Sales",
            method: "trend",
            recommendedMethod: "moving_average",
            intervalMethod: "Historical residual envelope.",
            diagnostics: {
              warnings: ["Short history"],
              readiness: "limited",
              frequency: "monthly",
            },
            leaderboard: [
              {
                method: "trend",
                backtest: { mae: 10, rmse: 12, smape: 8, bias: 2 },
              },
            ],
            scenarios: [
              {
                name: "upside",
                assumption: "Gradually improves",
                forecast: [110, 120],
              },
            ],
            kpis: { lastActual: 100, nextForecast: 110, changePct: 10 },
          },
          table: {
            columns: ["Month", "Sales"],
            rows: [{ Month: "Jan", Sales: 100 }],
          },
        },
      },
    });
    expect(model.slides[0]?.kind).toBe("title");
    expect(model.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(model.slides.some((s) => s.kind === "kpi")).toBe(true);
    expect(model.slides.some((s) => s.kind === "bullets")).toBe(true);
    expect(model.slides.some((s) => s.kind === "table")).toBe(true);
    expect(model.slides.some((s) => s.kind === "closing")).toBe(true);
    expect(
      model.slides.some(
        (s) => s.kind === "table" && /validation/i.test(s.title),
      ),
    ).toBe(true);
    expect(
      model.slides.some(
        (s) => s.kind === "bullets" && /caveats/i.test(s.title),
      ),
    ).toBe(true);
    const actions = model.slides.find(
      (s) => s.kind === "bullets" && s.tone === "actions",
    );
    expect(actions && actions.kind === "bullets" ? actions.bullets : []).toContain(
      "Stock more",
    );
  });
});
