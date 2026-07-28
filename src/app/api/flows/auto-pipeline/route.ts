import { NextResponse } from "next/server";
import { z } from "zod";
import type { TabularData } from "@/modules/blocks/domain/types";
import {
  createFlowWithGraph,
  buildValidatedAutoPipeline,
  suggestFlowName,
} from "@/modules/flows";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const tableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
});

const bodySchema = z.object({
  enableAi: z.boolean().optional().default(true),
  goal: z.string().max(240).optional(),
  rawText: z.string().max(50_000).optional(),
  name: z.string().min(1).max(120).optional(),
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  sheetNames: z.array(z.string()).optional(),
  excelSheet: z.string().nullable().optional(),
  excelRange: z.string().optional(),
  piiFindings: z.array(z.unknown()).optional(),
  table: tableSchema.optional(),
});

/**
 * Drop data → AI/heuristic builds a full analysis pipeline and returns the new flow.
 * Client typically uploads via /api/upload first, then posts the parsed table here.
 */
export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const body = bodySchema.parse(await req.json());

    const table = (body.table as TabularData | undefined) ?? undefined;
    const rawText = body.rawText?.trim() || "";

    if (!table?.columns?.length && !rawText) {
      throw new AppError(
        "Upload a CSV/Excel file or paste notes to build a pipeline.",
        "BAD_REQUEST",
        400,
      );
    }

    const built = buildValidatedAutoPipeline({
      table,
      rawText: rawText || undefined,
      enableAi: body.enableAi,
      goal: body.goal,
      seed: {
        fileId: body.fileId,
        fileName: body.fileName,
        table,
        sheetNames: body.sheetNames,
        excelSheet: body.excelSheet,
        excelRange: body.excelRange,
        piiFindings: body.piiFindings,
        datasetName: body.fileName
          ? body.fileName.replace(/\.[^.]+$/, "")
          : undefined,
      },
    });
    const plan = built.plan;
    const graph = built.graph;

    const name =
      body.name?.trim() ||
      suggestFlowName(plan, body.fileName) ||
      "Auto analysis";

    const flow = await createFlowWithGraph(user.id, name, graph);

    return NextResponse.json({
      id: flow.id,
      name: flow.name,
      plan: {
        archetype: plan.archetype,
        title: plan.title,
        rationale: plan.rationale,
        steps: plan.steps.map((s) => s.type),
      },
      repairs: built.repairs,
      remainingErrors: built.remainingErrors.map((e) => e.id),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const err = e as AppError;
    return NextResponse.json(
      { error: err.message ?? "Failed to build pipeline" },
      { status: err.status ?? 500 },
    );
  }
}
