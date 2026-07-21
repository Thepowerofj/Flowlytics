import { NextResponse } from "next/server";
import { z } from "zod";
import { createFlow, listFlows } from "@/modules/flows";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireActiveUser();
    const flows = await listFlows(user.id);
    return NextResponse.json(flows);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const body = z
      .object({ name: z.string().min(1).max(120).default("Untitled flow") })
      .parse(await req.json());
    const flow = await createFlow(user.id, body.name);
    return NextResponse.json(flow);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
