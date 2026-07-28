import { describe, expect, it } from "vitest";
import {
  buildValidatedAutoPipeline,
  materializeAutoPipelineGraph,
  planAutoPipeline,
} from "./autoPipeline";
import { checkFlow } from "./flowChecks";
import {
  healHintFromFlowIssues,
  repairAutoPipelineGraph,
} from "./pipelineRepair";

describe("pipelineRepair", () => {
  it("maps forecast check errors to disableForecast heal hints", () => {
    const hint = healHintFromFlowIssues([
      {
        id: "projection-col-missing-n1",
        severity: "error",
        message: "column missing",
        nodeId: "n1",
      },
    ]);
    expect(hint?.disableForecast).toBe(true);
  });

  it("buildValidatedAutoPipeline yields no checkFlow errors for categorical data", () => {
    const table = {
      columns: ["Region", "Sales"],
      rows: [
        { Region: "North", Sales: 10 },
        { Region: "South", Sales: 20 },
        { Region: "North", Sales: 5 },
        { Region: "East", Sales: 8 },
      ],
    };
    const built = buildValidatedAutoPipeline({
      table,
      enableAi: false,
      seed: { fileId: "f1", fileName: "regions.csv", table },
    });
    expect(built.remainingErrors).toEqual([]);
    const issues = checkFlow(
      built.graph.nodes.map((n) => ({
        id: n.id,
        data: { blockType: n.type, label: n.type, config: n.config },
      })),
      built.graph.edges.map((e) => ({ source: e.source, target: e.target })),
    );
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("repairAutoPipelineGraph fixes bad chart columns on a materialized graph", () => {
    const table = {
      columns: ["Region", "Sales"],
      rows: [
        { Region: "North", Sales: 10 },
        { Region: "South", Sales: 20 },
      ],
    };
    const plan = planAutoPipeline({ table, enableAi: false });
    const graph = materializeAutoPipelineGraph(plan, {
      fileId: "f1",
      fileName: "x.csv",
      table,
    });
    const chart = graph.nodes.find((n) => n.type === "analyse.chart");
    if (chart) {
      chart.config.xColumn = "MissingX";
      chart.config.yColumn = "MissingY";
    }
    const repaired = repairAutoPipelineGraph(graph);
    const fixed = repaired.graph.nodes.find((n) => n.type === "analyse.chart");
    const cols = (fixed?.config._sourceColumns as string[]) ?? [];
    const x = fixed?.config.xColumn as string;
    const y = fixed?.config.yColumn as string;
    if (x && x !== "__row__") expect(cols).toContain(x);
    if (y && y !== "__count__") expect(cols).toContain(y);
    expect(repaired.remainingErrors.filter((e) => e.id.includes("chart"))).toEqual(
      [],
    );
  });
});
