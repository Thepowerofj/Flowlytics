import { unlink } from "node:fs/promises";
import { getEnv } from "@/shared/config/env";
import { prisma } from "@/shared/lib/prisma";

export async function cleanupExpiredUploads(now = new Date()): Promise<number> {
  const retentionDays = Math.max(1, getEnv().UPLOAD_RETENTION_DAYS);
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const files = await prisma.uploadedFile.findMany({
    where: { createdAt: { lt: cutoff } },
    select: {
      id: true,
      userId: true,
      storagePath: true,
      sizeBytes: true,
    },
    take: 100,
  });

  for (const file of files) {
    try {
      await unlink(file.storagePath);
    } catch {
      // Continue deleting database rows even if a previous manual cleanup removed the file.
    }
    await prisma.$transaction([
      prisma.uploadedFile.delete({ where: { id: file.id } }),
      prisma.usageCounter.updateMany({
        where: { userId: file.userId },
        data: { storageBytes: { decrement: file.sizeBytes } },
      }),
    ]);
  }

  return files.length;
}
