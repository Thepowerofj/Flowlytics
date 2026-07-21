import { NextResponse } from "next/server";
import { z } from "zod";
import { assertFlowOwned } from "@/modules/flows";
import { enqueueFlowRun } from "@/modules/jobs";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { flowId } = await ctx.params;
    await assertFlowOwned(flowId, user.id);
    const body = z
      .object({ retryFromBlockId: z.string().optional() })
      .parse(await req.json().catch(() => ({})));
    const run = await enqueueFlowRun({
      flowId,
      userId: user.id,
      retryFromBlockId: body.retryFromBlockId,
    });
    return NextResponse.json(run);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
