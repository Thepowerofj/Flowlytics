import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteFlow, getFlowForUser, saveFlowGraph } from "@/modules/flows";
import type { FlowGraph } from "@/modules/blocks";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { flowId } = await ctx.params;
    const flow = await getFlowForUser(flowId, user.id);
    return NextResponse.json(flow);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

const saveSchema = z.object({
  name: z.string().min(1).max(120),
  graph: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { flowId } = await ctx.params;
    const body = saveSchema.parse(await req.json());
    const flow = await saveFlowGraph(
      flowId,
      user.id,
      body.name,
      body.graph as FlowGraph,
    );
    return NextResponse.json(flow);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ flowId: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { flowId } = await ctx.params;
    await deleteFlow(flowId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
