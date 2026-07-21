import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";

export async function getWalletBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user.walletBalance;
}

export async function creditWallet(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  if (amount <= 0) throw new AppError("Credit amount must be positive", "INVALID_AMOUNT");
  const updated = await prisma.$transaction(async (tx) => {
    await tx.walletEntry.create({
      data: { userId, type: "CREDIT", amount, reason },
    });
    return tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
    });
  });
  return updated.walletBalance;
}

export async function debitWallet(
  userId: string,
  amount: number,
  reason: string,
  runId?: string,
): Promise<number> {
  if (amount <= 0) throw new AppError("Debit amount must be positive", "INVALID_AMOUNT");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.walletBalance < amount) {
      throw new AppError("Insufficient wallet balance", "INSUFFICIENT_WALLET", 402);
    }
    await tx.walletEntry.create({
      data: { userId, type: "DEBIT", amount, reason, runId },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: amount } },
    });
    await tx.usageCounter.upsert({
      where: { userId },
      create: { userId, aiCallCount: 1 },
      update: { aiCallCount: { increment: 1 } },
    });
    return updated.walletBalance;
  });
}

export async function refundWallet(
  userId: string,
  amount: number,
  reason: string,
  runId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.walletEntry.create({
      data: { userId, type: "REFUND", amount, reason, runId },
    });
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
    });
  });
}
