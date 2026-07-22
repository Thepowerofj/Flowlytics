import { NextResponse } from "next/server";
import { z } from "zod";
import { createAskThread, listAskThreads } from "@/modules/ask";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireActiveUser();
    const threads = await listAskThreads(user.id);
    return NextResponse.json({ threads });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const body = z
      .object({ title: z.string().max(120).optional() })
      .parse(await req.json().catch(() => ({})));
    const thread = await createAskThread(user.id, body.title);
    return NextResponse.json(thread);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
