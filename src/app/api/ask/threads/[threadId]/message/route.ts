import { NextResponse } from "next/server";
import { z } from "zod";
import { askTurn } from "@/modules/ask";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const tableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.null()]))),
});

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  table: tableSchema.optional(),
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  enableAi: z.boolean().optional(),
  forceBuild: z.boolean().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { threadId } = await ctx.params;
    const body = bodySchema.parse(await req.json());
    const result = await askTurn({
      userId: user.id,
      threadId,
      message: body.message,
      table: body.table,
      fileId: body.fileId,
      fileName: body.fileName,
      enableAi: body.enableAi,
      forceBuild: body.forceBuild,
    });
    return NextResponse.json(result);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
