import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import { buildPresentationModel } from "../domain/presentationModel";
import { renderPdf } from "../infrastructure/pdf";
import { renderPptx } from "../infrastructure/pptx";

export async function exportRunPresentation(
  userId: string,
  runId: string,
  format: "pdf" | "pptx",
) {
  const run = await prisma.flowRun.findFirst({
    where: { id: runId, userId },
    include: { flow: { select: { name: true } } },
  });
  if (!run) throw new AppError("Run not found", "NOT_FOUND", 404);
  if (run.status !== "SUCCEEDED") {
    throw new AppError("Run is not complete", "RUN_NOT_READY", 400);
  }

  const model = buildPresentationModel(run.resultJson, {
    title: run.flow.name || "Flowlytics insights",
  });

  if (format === "pdf") {
    const buf = await renderPdf(model);
    return {
      buffer: buf,
      contentType: "application/pdf",
      filename: `${slug(run.flow.name)}.pdf`,
    };
  }
  const buf = await renderPptx(model);
  return {
    buffer: buf,
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    filename: `${slug(run.flow.name)}.pptx`,
  };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "flowlytics-deck"
  );
}
