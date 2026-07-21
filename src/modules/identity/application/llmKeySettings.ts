import { prisma } from "@/shared/lib/prisma";
import { getEnv } from "@/shared/config/env";
import { AppError } from "@/shared/lib/errors";
import { decryptSecret, encryptSecret, maskSecret } from "../domain/secretBox";

export async function getLlmKeyStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { llmApiKeyEnc: true },
  });
  if (!user.llmApiKeyEnc) {
    return { hasKey: false, masked: null as string | null };
  }
  const plain = decryptSecret(user.llmApiKeyEnc, getEnv().AUTH_SECRET);
  return {
    hasKey: Boolean(plain),
    masked: plain ? maskSecret(plain) : null,
  };
}

export async function saveLlmApiKey(userId: string, apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) {
    throw new AppError("API key looks too short", "INVALID_KEY", 400);
  }
  const enc = encryptSecret(trimmed, getEnv().AUTH_SECRET);
  await prisma.user.update({
    where: { id: userId },
    data: { llmApiKeyEnc: enc },
  });
  return { hasKey: true, masked: maskSecret(trimmed) };
}

export async function clearLlmApiKey(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { llmApiKeyEnc: null },
  });
  return { hasKey: false, masked: null as string | null };
}
