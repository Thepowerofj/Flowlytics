import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import { toJsonValue } from "@/shared/lib/json";
import { estimateEtaSeconds, fairPriority } from "../domain/queue";

export async function enqueueFlowRun(input: {
  flowId: string;
  userId: string;
  retryFromBlockId?: string;
}) {
  const { assertActiveAccess } = await import(
    "@/modules/identity/application/accountAccess"
  );
  await assertActiveAccess(input.userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  const flow = await prisma.flow.findFirst({
    where: { id: input.flowId, userId: input.userId },
  });
  if (!flow) throw new AppError("Flow not found", "NOT_FOUND", 404);

  const pendingAhead = await prisma.job.count({
    where: { status: { in: ["PENDING", "CLAIMED", "RUNNING"] } },
  });
  const queuePosition = pendingAhead + 1;
  const etaSeconds = estimateEtaSeconds(queuePosition);

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.flowRun.create({
      data: {
        flowId: input.flowId,
        userId: input.userId,
        status: "QUEUED",
        queuePosition,
        etaSeconds,
        retryFromBlockId: input.retryFromBlockId,
        // Freeze the pipeline shape at enqueue so later edits don't change this run.
        graphSnapshotJson: toJsonValue(flow.graphJson),
      },
    });
    await tx.job.create({
      data: {
        runId: created.id,
        userId: input.userId,
        priority: fairPriority(user.isPaid),
        status: "PENDING",
      },
    });
    await tx.usageCounter.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, runCount: 1 },
      update: { runCount: { increment: 1 } },
    });
    return created;
  });

  return run;
}

export async function refreshQueueEtas() {
  const pending = await prisma.job.findMany({
    where: { status: "PENDING" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { run: true },
  });
  let position = 1;
  for (const job of pending) {
    await prisma.flowRun.update({
      where: { id: job.runId },
      data: {
        queuePosition: position,
        etaSeconds: estimateEtaSeconds(position),
      },
    });
    position += 1;
  }
}
