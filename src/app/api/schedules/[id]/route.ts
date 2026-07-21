import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSchedule,
  updateSchedule,
} from "@/modules/jobs/application/scheduleService";
import {
  encodeCronKind,
  type ScheduleKindInput,
} from "@/modules/jobs/domain/scheduleTiming";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  cronKind: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("daily") }),
      z.object({ kind: z.literal("weekly") }),
      z.object({
        kind: z.literal("custom"),
        every: z.number().int().min(1).max(168),
        unit: z.enum(["h", "d"]),
      }),
    ])
    .optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());
    let cronKind: string | undefined;
    if (body.cronKind) {
      const input: ScheduleKindInput =
        body.cronKind.kind === "custom"
          ? {
              cronKind: "custom",
              every: body.cronKind.every,
              unit: body.cronKind.unit,
            }
          : { cronKind: body.cronKind.kind };
      cronKind = encodeCronKind(input);
    }
    const schedule = await updateSchedule(id, user.id, {
      enabled: body.enabled,
      cronKind,
    });
    return NextResponse.json(schedule);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireActiveUser();
    const { id } = await ctx.params;
    await deleteSchedule(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
