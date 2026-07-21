import { prisma } from "@/shared/lib/prisma";
import { assertFlowOwned } from "@/modules/flows";

export async function listFlowRuns(flowId: string, userId: string, limit = 30) {
  await assertFlowOwned(flowId, userId);
  const take = Math.min(Math.max(limit, 1), 100);
  const runs = await prisma.flowRun.findMany({
    where: { flowId, userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      queuePosition: true,
      etaSeconds: true,
      currentBlockId: true,
      failedBlockId: true,
      errorMessage: true,
      retryFromBlockId: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      graphSnapshotJson: true,
      steps: {
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          blockId: true,
          blockType: true,
          status: true,
          errorMessage: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
  // Don't ship full pipeline JSON in the list (configs can include large tables).
  return runs.map(({ graphSnapshotJson, ...run }) => ({
    ...run,
    hasSnapshot: graphSnapshotJson != null,
  }));
}
