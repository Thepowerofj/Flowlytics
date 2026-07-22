import type { BlockDefinition, TabularData } from "../domain/types";
import { buildPresentationModel } from "@/modules/present/domain/presentationModel";
import { outputPresentationMeta } from "../catalog";

/**
 * Marks the run as presentation-ready. Actual PDF/PPTX download is via
 * /api/export/presentation using the run id (Results panel).
 */
export const outputPresentationBlock: BlockDefinition = {
  ...outputPresentationMeta,
  async run(config, inputs, ctx) {
    const table = (inputs.table as TabularData) ?? { columns: [], rows: [] };
    const model = buildPresentationModel(
      {
        table,
        explanation: `Presentation prepared for run ${ctx.runId}`,
        byBlockId: {
          self: {
            table,
            insightReport: {
              headline: String(config.deckTitle || "Insights deck"),
              summary: `${table.rows.length} rows ready for export`,
              findings: [],
              nextSteps: ["Download PDF or PowerPoint from Results"],
            },
          },
        },
      },
      { title: String(config.deckTitle || "Flowlytics insights") },
    );
    return {
      table,
      presentation: model,
      explanation: `Presentation pack ready (${model.slides.length} slides). Download PDF/PPTX from Results.`,
    };
  },
};
