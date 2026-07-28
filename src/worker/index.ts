import "dotenv/config";
import { prisma } from "@/shared/lib/prisma";
import { executeRun } from "@/modules/jobs/application/executeRun";
import { refreshQueueEtas } from "@/modules/jobs";
import { getEnv } from "@/shared/config/env";

const env = getEnv();
const workerId = env.WORKER_ID;
const STALE_LOCK_MS = 5 * 60_000;

async function reclaimStaleJobs() {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const stale = await prisma.job.findMany({
    where: {
      status: { in: ["CLAIMED", "RUNNING"] },
      lockedAt: { lt: staleBefore },
    },
    select: { id: true, runId: true },
    take: 20,
  });
  for (const job of stale) {
    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: { status: "PENDING", lockedAt: null, lockedBy: null },
      }),
      prisma.flowRun.updateMany({
        where: { id: job.runId, status: { in: ["QUEUED", "RUNNING"] } },
        data: { status: "QUEUED", currentBlockId: null },
      }),
    ]);
  }
  if (stale.length) {
    console.warn(`[worker] reclaimed ${stale.length} stale job(s)`);
  }
}

async function claimNextJob() {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { status: "PENDING" },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (!job) return null;
    const claimed = await tx.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: {
        status: "CLAIMED",
        lockedAt: new Date(),
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    return tx.job.findUnique({ where: { id: job.id } });
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
        where: { id: workerId },
        create: { id: workerId, busy: false, lastSeen: new Date(), metaJson: { workerId } },
        update: { lastSeen: new Date(), metaJson: { workerId } },
      });
      await reclaimStaleJobs();
      await tickSchedules();
      const { expireDueAccounts } = await import(
        "@/modules/identity/application/accountAccess"
      );
      const expired = await expireDueAccounts();
      if (expired > 0) {
        console.log(`[worker] expired ${expired} account(s)`);
      }
      const { cleanupExpiredUploads } = await import(
        "@/modules/ingest/application/cleanupUploadedFiles"
      );
      const cleanedUploads = await cleanupExpiredUploads();
      if (cleanedUploads > 0) {
        console.log(`[worker] cleaned ${cleanedUploads} expired upload(s)`);
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
