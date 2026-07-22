import { NextResponse } from "next/server";
import { getAskThread } from "@/modules/ask";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ threadId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { threadId } = await ctx.params;
    const thread = await getAskThread(user.id, threadId);
    return NextResponse.json(thread);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
