import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/lib/prisma";
import { appBaseUrl } from "@/modules/notify/application/sendEmail";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "@/modules/notify";
import { AppError } from "@/shared/lib/errors";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const RESET_PREFIX = "pwdreset:";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function identifierFor(email: string): string {
  return `${RESET_PREFIX}${email.toLowerCase()}`;
}

/** Request a reset — always succeeds outwardly (no email enumeration). */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, disabled: true },
  });

  // Google-only accounts have no passwordHash — skip silently
  if (!user?.passwordHash || user.disabled) return;

  await prisma.verificationToken.deleteMany({
    where: { identifier: identifierFor(email) },
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expires = new Date(Date.now() + RESET_TTL_MS);

  await prisma.verificationToken.create({
    data: {
      identifier: identifierFor(email),
      token: tokenHash,
      expires,
    },
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });
}

export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  if (!rawToken?.trim() || newPassword.length < 8) {
    throw new AppError("Invalid reset request", "BAD_REQUEST", 400);
  }

  const tokenHash = hashToken(rawToken.trim());
  const record = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!record || record.expires.getTime() < Date.now()) {
    throw new AppError(
      "This reset link is invalid or has expired. Request a new one.",
      "RESET_INVALID",
      400,
    );
  }

  if (!record.identifier.startsWith(RESET_PREFIX)) {
    throw new AppError("Invalid reset token", "RESET_INVALID", 400);
  }

  const email = record.identifier.slice(RESET_PREFIX.length);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { passwordHash },
    }),
    prisma.verificationToken.delete({ where: { token: tokenHash } }),
  ]);

  await sendPasswordChangedEmail({ to: email });
}
