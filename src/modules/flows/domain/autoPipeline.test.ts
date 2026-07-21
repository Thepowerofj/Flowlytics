import { describe, expect, it } from "vitest";
import {
  materializeAutoPipelineGraph,
  planAutoPipeline,
  profileTable,
} from "./autoPipeline";

describe("autoPipeline", () => {
  it("profiles date + measure as timeseries-friendly", () => {
    const table = {
      columns: ["Month", "Sales", "Region"],
      rows: [
        { Month: "2024-01-01", Sales: 10, Region: "North" },
        { Month: "2024-02-01", Sales: 20, Region: "South" },
        { Month: "2024-03-01", Sales: 30, Region: "North" },
      ],
    };
    const profile = profileTable(table);
    expect(profile.measureCol).toBe("Sales");
    expect(profile.dateCols.length).toBeGreaterThan(0);

    const plan = planAutoPipeline({ table, enableAi: true });
    expect(plan.archetype).toBe("timeseries");
    expect(plan.steps.map((s) => s.type)).toContain("analyse.projection");
    expect(plan.steps.map((s) => s.type)).toContain("ai.analyse");
  });

  it("builds categorical aggregate path without dates", () => {
    const plan = planAutoPipeline({
      table: {
        columns: ["Region", "Sales"],
        rows: [
          { Region: "North", Sales: 10 },
          { Region: "South", Sales: 20 },
          { Region: "North", Sales: 5 },
        ],
      },
      enableAi: false,
    });
    expect(plan.archetype).toBe("categorical");
    expect(plan.steps.map((s) => s.type)).toContain("transform.aggregate");
    expect(plan.steps.map((s) => s.type)).not.toContain("ai.analyse");
  });

  it("plans unstructured notes → AI structure path", () => {
    const plan = planAutoPipeline({
      rawText: "Sold 12 widgets to Acme on Monday for R400",
      enableAi: true,
    });
    expect(plan.archetype).toBe("unstructured");
    expect(plan.steps[0]?.type).toBe("ai.structure");
    expect(plan.steps[0]?.config?.rawText).toMatch(/widgets/);
  });

  it("materializes a wired graph with ingest seed, casts, and spaced layout", () => {
    const table = {
      columns: ["Date", "Amount"],
      rows: [
        { Date: "2024-01-01", Amount: "R 10.00" },
        { Date: "2024-02-01", Amount: "R 20.00" },
        { Date: "2024-03-01", Amount: "R 30.00" },
      ],
    };
    const plan = planAutoPipeline({ table, enableAi: true });
    const graph = materializeAutoPipelineGraph(plan, {
      fileId: "f1",
      fileName: "sales.csv",
      table,
    });
    expect(graph.nodes.length).toBe(plan.steps.length);
    expect(graph.edges.length).toBe(plan.steps.length - 1);
    const ingest = graph.nodes.find((n) => n.type === "ingest.csv_excel");
    expect(ingest?.config.fileId).toBe("f1");
    expect(ingest?.config.table).toEqual(table);

    const clean = graph.nodes.find((n) => n.type === "transform.clean_map");
    const transforms = clean?.config.transforms as Record<
      string,
      { type: string }
    >;
    expect(transforms?.Date?.type).toBe("date");
    expect(transforms?.Amount?.type).toBe("currency");

    const ordered = [...graph.nodes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.x).toBeGreaterThan(ordered[i - 1]!.x);
    }
  });
});
