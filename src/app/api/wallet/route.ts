import { NextResponse } from "next/server";
import { getWalletBalance, paymentGateway } from "@/modules/billing";
import { getEnv } from "@/shared/config/env";
import { prisma } from "@/shared/lib/prisma";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const balance = await getWalletBalance(user.id);
    const entries = await prisma.walletEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      balance,
      aiCreditCost: getEnv().AI_CREDIT_COST,
      gateway: paymentGateway.name,
      entries,
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
