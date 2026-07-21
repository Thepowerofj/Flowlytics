import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await requireUser();
    const { runId } = await ctx.params;
    const run = await prisma.flowRun.findFirst({
      where: { id: runId, userId: user.id },
      include: { steps: { orderBy: { startedAt: "asc" } } },
    });
    if (!run) throw new AppError("Run not found", "NOT_FOUND", 404);
    return NextResponse.json(run);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
