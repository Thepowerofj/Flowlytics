import { NextResponse } from "next/server";
import { z } from "zod";
import { assertFlowOwned } from "@/modules/flows";
import { listSchedulesForUser } from "@/modules/jobs/application/scheduleService";
import {
  describeCronKind,
  encodeCronKind,
  nextRunAtFromCronKind,
} from "@/modules/jobs/domain/scheduleTiming";
import { prisma } from "@/shared/lib/prisma";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const schema = z.discriminatedUnion("cronKind", [
  z.object({
    flowId: z.string(),
    cronKind: z.literal("daily"),
    enabled: z.boolean().default(true),
  }),
  z.object({
    flowId: z.string(),
    cronKind: z.literal("weekly"),
    enabled: z.boolean().default(true),
  }),
  z.object({
    flowId: z.string(),
    cronKind: z.literal("custom"),
    every: z.number().int().min(1).max(168),
    unit: z.enum(["h", "d"]),
    enabled: z.boolean().default(true),
  }),
]);

export async function GET(req: Request) {
  try {
    const user = await requireActiveUser();
    const url = new URL(req.url);
    const flowId = url.searchParams.get("flowId") ?? undefined;
    const schedules = await listSchedulesForUser(user.id, { flowId });
    return NextResponse.json({ schedules });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const body = schema.parse(await req.json());
    await assertFlowOwned(body.flowId, user.id);

    const cronKind =
      body.cronKind === "custom"
        ? encodeCronKind({
            cronKind: "custom",
            every: body.every,
            unit: body.unit,
          })
        : body.cronKind;

    const nextRunAt = nextRunAtFromCronKind(cronKind);
    const schedule = await prisma.schedule.create({
      data: {
        flowId: body.flowId,
        userId: user.id,
        cronKind,
        enabled: body.enabled,
        nextRunAt,
      },
      include: { flow: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      ...schedule,
      label: describeCronKind(cronKind),
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
