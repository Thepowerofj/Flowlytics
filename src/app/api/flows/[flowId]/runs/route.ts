import { NextResponse } from "next/server";
import { listFlowRuns } from "@/modules/jobs/application/listFlowRuns";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const user = await requireUser();
    const { flowId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const runs = await listFlowRuns(
      flowId,
      user.id,
      Number.isFinite(limit) ? limit : 30,
    );
    return NextResponse.json({ runs });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
