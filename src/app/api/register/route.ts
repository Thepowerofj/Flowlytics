import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { allocateUniquePaymentReference } from "@/modules/billing";
import { sendWelcomeEmail } from "@/modules/notify";
import { prisma } from "@/shared/lib/prisma";
import { getEnv, isAdminEmail } from "@/shared/config/env";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const email = body.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  const env = getEnv();
  const passwordHash = await bcrypt.hash(body.data.password, 12);
  const role = isAdminEmail(email) ? "ADMIN" : "USER";
  const now = new Date();
  const eftReference = await allocateUniquePaymentReference();
  const user = await prisma.user.create({
    data: {
      email,
      name: body.data.name,
      passwordHash,
      role,
      eftReference,
      walletBalance: env.INITIAL_WALLET_CREDITS,
      ...(role === "ADMIN"
        ? {
            isPaid: true,
            accessActivatedAt: now,
            accessExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
          }
        : {}),
      walletEntries: {
        create: {
          type: "CREDIT",
          amount: env.INITIAL_WALLET_CREDITS,
          reason: "signup_bonus",
        },
      },
      usageCounters: { create: {} },
    },
  });
  if (user.eftReference) {
    void sendWelcomeEmail({
      to: user.email,
      name: user.name,
      paymentReference: user.eftReference,
    }).catch((err) => console.error("[mail] welcome", err));
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    eftReference: user.eftReference,
  });
}
