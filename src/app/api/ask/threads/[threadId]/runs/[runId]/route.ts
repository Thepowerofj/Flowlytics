import { NextResponse } from "next/server";
import { completeAskRun } from "@/modules/ask";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ threadId: string; runId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { threadId, runId } = await ctx.params;
    const result = await completeAskRun(user.id, threadId, runId);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
