import { prisma } from "@/shared/lib/prisma";
import {
  generatePaymentReference,
  normalizePaymentReference,
} from "../domain/paymentReference";

const MAX_ATTEMPTS = 8;

/** Allocate a unique short EFT reference (retries on rare collisions). */
export async function allocateUniquePaymentReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = generatePaymentReference();
    const existing = await prisma.user.findFirst({
      where: { eftReference: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Extremely unlikely — widen with timestamp fragment
  return generatePaymentReference().replace(
    /-(\w{2})$/,
    `-${Date.now().toString(36).slice(-2).toUpperCase()}`,
  );
}

/** Ensure the user has a payment reference; create one if missing (backfill). */
export async function ensurePaymentReference(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { eftReference: true },
  });
  if (user.eftReference && looksAssigned(user.eftReference)) {
    return normalizePaymentReference(user.eftReference);
  }
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const ref = await allocateUniquePaymentReference();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { eftReference: ref },
      });
      return ref;
    } catch {
      /* unique race — retry */
    }
  }
  throw new Error("Could not assign a payment reference");
}

function looksAssigned(ref: string): boolean {
  const n = normalizePaymentReference(ref);
  // Ignore legacy email-as-ref / timestamp stubs
  if (!n.startsWith("FL-")) return false;
  if (/^EFT-/i.test(ref)) return false;
  if (ref.includes("@")) return false;
  return n.length >= 6;
}

/** Find users by exact or normalized payment reference (admin lookup). */
export async function findUsersByPaymentReference(query: string) {
  const normalized = normalizePaymentReference(query);
  if (!normalized) return [];
  const bare = normalized.replace(/-/g, "");
  return prisma.user.findMany({
    where: {
      OR: [
        { eftReference: normalized },
        { eftReference: bare },
        { eftReference: { equals: query.trim(), mode: "insensitive" } },
        { eftReference: { contains: bare.slice(-6), mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isPaid: true,
      eftReference: true,
      eftDeclaredAt: true,
      eftNote: true,
      accessExpiresAt: true,
      disabled: true,
      walletBalance: true,
      llmApiKeyEnc: true,
    },
    take: 20,
  });
}
