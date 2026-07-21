import { prisma } from "@/shared/lib/prisma";
import { assertFlowOwned } from "@/modules/flows";
import { AppError } from "@/shared/lib/errors";
import {
  describeCronKind,
  nextRunAtFromCronKind,
} from "../domain/scheduleTiming";

export async function listSchedulesForUser(
  userId: string,
  opts?: { flowId?: string },
) {
  if (opts?.flowId) {
    await assertFlowOwned(opts.flowId, userId);
  }
  const schedules = await prisma.schedule.findMany({
    where: {
      userId,
      ...(opts?.flowId ? { flowId: opts.flowId } : {}),
    },
    orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
    include: {
      flow: { select: { id: true, name: true } },
    },
  });
  return schedules.map((s) => ({
    ...s,
    label: describeCronKind(s.cronKind),
  }));
}

export async function getOwnedSchedule(scheduleId: string, userId: string) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, userId },
    include: { flow: { select: { id: true, name: true } } },
  });
  if (!schedule) throw new AppError("Schedule not found", "NOT_FOUND", 404);
  return schedule;
}

export async function updateSchedule(
  scheduleId: string,
  userId: string,
  patch: { enabled?: boolean; cronKind?: string },
) {
  await getOwnedSchedule(scheduleId, userId);
  const data: {
    enabled?: boolean;
    cronKind?: string;
    nextRunAt?: Date;
  } = {};
  if (typeof patch.enabled === "boolean") data.enabled = patch.enabled;
  if (patch.cronKind) {
    data.cronKind = patch.cronKind;
    data.nextRunAt = nextRunAtFromCronKind(patch.cronKind);
  }
  const updated = await prisma.schedule.update({
    where: { id: scheduleId },
    data,
    include: { flow: { select: { id: true, name: true } } },
  });
  return { ...updated, label: describeCronKind(updated.cronKind) };
}

export async function deleteSchedule(scheduleId: string, userId: string) {
  await getOwnedSchedule(scheduleId, userId);
  await prisma.schedule.delete({ where: { id: scheduleId } });
  return { ok: true as const };
}
