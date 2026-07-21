import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import { getEnv } from "@/shared/config/env";
import {
  ACCESS_PERIOD_DAYS,
  accessExpiresInDays,
  accessStatusOf,
  hasActiveAccess,
} from "../domain/access";

export async function getUserAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      disabled: true,
      isPaid: true,
      eftReference: true,
      eftDeclaredAt: true,
      eftNote: true,
      accessActivatedAt: true,
      accessExpiresAt: true,
      llmApiKeyEnc: true,
      walletBalance: true,
    },
  });
  return {
    ...user,
    status: accessStatusOf(user),
    hasAccess: hasActiveAccess(user),
    hasLlmKey: Boolean(user.llmApiKeyEnc),
  };
}

export async function declareEftPayment(userId: string, note?: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      eftDeclaredAt: new Date(),
      eftNote: note?.trim() || null,
    },
    select: {
      email: true,
      eftReference: true,
      eftNote: true,
    },
  });

  if (user.email && user.eftReference) {
    const { sendEftDeclaredAdminEmail, sendEftDeclaredEmail } = await import(
      "@/modules/notify"
    );
    void sendEftDeclaredEmail({
      to: user.email,
      paymentReference: user.eftReference,
      note: user.eftNote,
    }).catch((err) => console.error("[mail] eft declared", err));
    void sendEftDeclaredAdminEmail({
      userEmail: user.email,
      paymentReference: user.eftReference,
      note: user.eftNote,
    }).catch((err) => console.error("[mail] eft admin", err));
  }

  return user;
}

/** Admin: grant N days of access from now (default ACCESS_PERIOD_DAYS / env). */
export async function activateAccess(
  userId: string,
  days?: number,
  eftReference?: string | null,
) {
  const period = days ?? getEnv().ACCESS_PERIOD_DAYS ?? ACCESS_PERIOD_DAYS;
  const now = new Date();
  const expiresAt = accessExpiresInDays(now, period);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      disabled: false,
      isPaid: true,
      accessActivatedAt: now,
      accessExpiresAt: expiresAt,
      // Keep the user's short bank reference; only set when admin passes one.
      ...(eftReference !== undefined && eftReference
        ? { eftReference }
        : {}),
    },
    select: {
      email: true,
      eftReference: true,
      accessExpiresAt: true,
    },
  });

  if (user.email && user.accessExpiresAt) {
    const { sendAccessActivatedEmail } = await import("@/modules/notify");
    void sendAccessActivatedEmail({
      to: user.email,
      days: period,
      expiresAt: user.accessExpiresAt,
      paymentReference: user.eftReference,
    }).catch((err) => console.error("[mail] access activated", err));
  }

  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

/**
 * Revoke product access. Admin ban sets `disabled` (blocks login).
 * Expiry only clears paid flags so the user can still sign in and re-pay via Billing.
 */
export async function revokeAccess(userId: string, reason: "expired" | "admin" = "admin") {
  return prisma.user.update({
    where: { id: userId },
    data: {
      isPaid: false,
      accessExpiresAt: new Date(),
      ...(reason === "admin" ? { disabled: true } : { disabled: false }),
    },
  });
}

/** Clear paid access for accounts whose window has ended (login still allowed). */
export async function expireDueAccounts(limit = 50): Promise<number> {
  const now = new Date();
  const due = await prisma.user.findMany({
    where: {
      role: "USER",
      isPaid: true,
      accessExpiresAt: { lte: now },
    },
    select: { id: true, email: true, eftReference: true },
    take: limit,
  });
  if (!due.length) return 0;
  await prisma.user.updateMany({
    where: { id: { in: due.map((u) => u.id) } },
    data: { isPaid: false },
  });

  const { sendAccessExpiredEmail } = await import("@/modules/notify");
  for (const u of due) {
    if (!u.email) continue;
    void sendAccessExpiredEmail({
      to: u.email,
      paymentReference: u.eftReference,
    }).catch((err) => console.error("[mail] access expired", err));
  }

  return due.length;
}

export async function assertActiveAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      disabled: true,
      accessExpiresAt: true,
    },
  });
  if (!user) throw new AppError("Not found", "NOT_FOUND", 404);
  if (!hasActiveAccess(user)) {
    throw new AppError(
      "Account access required — complete EFT payment and wait for admin activation",
      "ACCESS_REQUIRED",
      402,
    );
  }
}
