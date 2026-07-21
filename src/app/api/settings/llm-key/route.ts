import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearLlmApiKey,
  getLlmKeyStatus,
  saveLlmApiKey,
} from "@/modules/identity/application/llmKeySettings";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const status = await getLlmKeyStatus(user.id);
    return NextResponse.json(status);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

const putSchema = z.object({
  apiKey: z.string().min(8).max(512),
});

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = putSchema.parse(await req.json());
    const status = await saveLlmApiKey(user.id, body.apiKey);
    return NextResponse.json(status);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const status = await clearLlmApiKey(user.id);
    return NextResponse.json(status);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
