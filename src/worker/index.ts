import "dotenv/config";
import { prisma } from "@/shared/lib/prisma";
import { executeRun } from "@/modules/jobs/application/executeRun";
import { refreshQueueEtas } from "@/modules/jobs";
import { getEnv } from "@/shared/config/env";

const env = getEnv();
const workerId = env.WORKER_ID;

async function claimNextJob() {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (!job) return null;
    return tx.job.update({
      where: { id: job.id },
      data: {
        status: "CLAIMED",
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });
  });
}

async function tickSchedules() {
  const { nextRunAtFromCronKind } = await import(
    "@/modules/jobs/domain/scheduleTiming"
  );
  const due = await prisma.schedule.findMany({
    where: { enabled: true, nextRunAt: { lte: new Date() } },
    take: 20,
  });
  for (const schedule of due) {
    try {
      const { enqueueFlowRun } = await import("@/modules/jobs");
      await enqueueFlowRun({ flowId: schedule.flowId, userId: schedule.userId });
    } catch (error) {
      console.warn(
        `[worker] schedule ${schedule.id} skipped (user may lack access)`,
        error,
      );
    }
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: nextRunAtFromCronKind(schedule.cronKind) },
    });
  }
}

async function loop() {
  console.log(`[worker] starting ${workerId}`);
  for (;;) {
    try {
      await prisma.workerHeartbeat.upsert({
        where: { id: "default" },
        create: { id: "default", busy: false, lastSeen: new Date(), metaJson: { workerId } },
        update: { lastSeen: new Date(), metaJson: { workerId } },
      });
      await tickSchedules();
      const { expireDueAccounts } = await import(
        "@/modules/identity/application/accountAccess"
      );
      const expired = await expireDueAccounts();
      if (expired > 0) {
        console.log(`[worker] expired ${expired} account(s)`);
      }
      await refreshQueueEtas();

      const running = await prisma.job.count({
        where: { status: { in: ["CLAIMED", "RUNNING"] }, lockedBy: workerId },
      });
      if (running < env.WORKER_CONCURRENCY) {
        const job = await claimNextJob();
        if (job) {
          await prisma.job.update({
            where: { id: job.id },
            data: { status: "RUNNING" },
          });
          try {
            await executeRun(job.runId, workerId);
            await prisma.job.update({
              where: { id: job.id },
              data: { status: "SUCCEEDED" },
            });
          } catch (error) {
            console.error("[worker] run failed", error);
            await prisma.job.update({
              where: { id: job.id },
              data: { status: "FAILED" },
            });
          }
        }
      }
    } catch (error) {
      console.error("[worker] tick error", error);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

loop();
