import { prisma } from "@/shared/lib/prisma";
import { creditWallet } from "@/modules/billing";
import { getEnv } from "@/shared/config/env";
import { accessStatusOf, ACCESS_PERIOD_DAYS } from "../domain/access";
import { activateAccess, revokeAccess } from "./accountAccess";

export async function listUsersAdmin() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isPaid: true,
      eftReference: true,
      eftDeclaredAt: true,
      eftNote: true,
      accessActivatedAt: true,
      accessExpiresAt: true,
      disabled: true,
      walletBalance: true,
      llmApiKeyEnc: true,
      createdAt: true,
      usageCounters: true,
    },
  });
  return users.map(({ llmApiKeyEnc, ...u }) => ({
    ...u,
    hasLlmKey: Boolean(llmApiKeyEnc),
    status: accessStatusOf(u),
  }));
}

export async function updateUserCommercial(
  userId: string,
  data: {
    isPaid?: boolean;
    eftReference?: string | null;
    disabled?: boolean;
    activateDays?: number;
    revoke?: boolean;
  },
) {
  if (data.revoke || data.disabled === true) {
    return revokeAccess(userId, "admin");
  }

  if (typeof data.activateDays === "number" && data.activateDays > 0) {
    return activateAccess(userId, data.activateDays, data.eftReference);
  }

  // Toggle paid on → grant default access window
  if (data.isPaid === true) {
    return activateAccess(
      userId,
      getEnv().ACCESS_PERIOD_DAYS || ACCESS_PERIOD_DAYS,
      data.eftReference,
    );
  }

  // Toggle paid off → revoke
  if (data.isPaid === false) {
    return revokeAccess(userId, "admin");
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      eftReference: data.eftReference === undefined ? undefined : data.eftReference,
      disabled: data.disabled,
    },
  });
}

export async function adminCreditUser(userId: string, amount: number, note: string) {
  return creditWallet(userId, amount, `admin_credit:${note}`);
}
