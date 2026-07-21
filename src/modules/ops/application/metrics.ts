import { prisma } from "@/shared/lib/prisma";

export async function getOpsMetrics() {
  const [queued, running, succeeded, failed, users, heartbeat, usage] =
    await Promise.all([
      prisma.job.count({ where: { status: "PENDING" } }),
      prisma.job.count({ where: { status: { in: ["CLAIMED", "RUNNING"] } } }),
      prisma.flowRun.count({ where: { status: "SUCCEEDED" } }),
      prisma.flowRun.count({ where: { status: "FAILED" } }),
      prisma.user.count(),
      prisma.workerHeartbeat.findUnique({ where: { id: "default" } }),
      prisma.usageCounter.findMany({
        include: { user: { select: { email: true, isPaid: true } } },
        orderBy: { runCount: "desc" },
        take: 50,
      }),
    ]);

  const workerAgeMs = heartbeat
    ? Date.now() - heartbeat.lastSeen.getTime()
    : null;

  return {
    queueDepth: queued,
    activeRuns: running,
    totalSucceeded: succeeded,
    totalFailed: failed,
    totalUsers: users,
    worker: {
      busy: heartbeat?.busy ?? false,
      lastSeen: heartbeat?.lastSeen ?? null,
      online: workerAgeMs != null ? workerAgeMs < 30_000 : false,
    },
    perUser: usage.map((u) => ({
      userId: u.userId,
      email: u.user.email,
      isPaid: u.user.isPaid,
      runCount: u.runCount,
      storageBytes: u.storageBytes,
      aiCallCount: u.aiCallCount,
    })),
  };
}
