import { prisma } from "@/shared/lib/prisma";
import { getEnv } from "@/shared/config/env";
import { AppError } from "@/shared/lib/errors";
import { toJsonValue } from "@/shared/lib/json";
import { ensurePaymentReference } from "./assignPaymentReference";
import { getPaymentGateway } from "../infrastructure/paymentGateway";
import { verifyPayfastSignature } from "../domain/payfast";
import { activateAccess } from "@/modules/identity/application/accountAccess";

export async function startPayfastAccessCheckout(userId: string) {
  const env = getEnv();
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY) {
    throw new AppError(
      "PayFast is not configured (set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY)",
      "PAYFAST_UNCONFIGURED",
      503,
    );
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ref = await ensurePaymentReference(userId);
  const amountZar = env.PAYFAST_AMOUNT_ZAR;
  const base = env.AUTH_URL.replace(/\/$/, "");
  const gateway = getPaymentGateway();
  if (!gateway.createAccessCheckout) {
    throw new AppError("PayFast gateway unavailable", "PAYFAST_UNAVAILABLE", 503);
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      provider: "payfast",
      status: "pending",
      amountZar,
      currency: "ZAR",
      mPaymentId: ref,
      itemName: `Flowlytics ${env.ACCESS_PERIOD_DAYS}-day access`,
    },
  });

  const checkout = await gateway.createAccessCheckout({
    userId,
    email: user.email,
    paymentReference: ref,
    amountZar,
    itemName: payment.itemName,
    returnUrl: `${base}/billing?payfast=return`,
    cancelUrl: `${base}/billing?payfast=cancel`,
    notifyUrl: `${base}/api/billing/payfast/itn`,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { checkoutPayload: toJsonValue(checkout.fields) },
  });

  return { payment, checkout, sandbox: env.PAYFAST_SANDBOX };
}

export async function handlePayfastItn(fields: Record<string, string>) {
  const env = getEnv();
  if (!verifyPayfastSignature(fields, env.PAYFAST_PASSPHRASE || undefined)) {
    throw new AppError("Invalid PayFast signature", "PAYFAST_BAD_SIGNATURE", 400);
  }

  const paymentStatus = (fields.payment_status || "").toUpperCase();
  const mPaymentId = fields.m_payment_id || fields.custom_str2 || "";
  const userId = fields.custom_str1 || "";
  const pfPaymentId = fields.pf_payment_id || "";

  const payment =
    (await prisma.payment.findFirst({
      where: {
        OR: [
          { mPaymentId: mPaymentId || undefined },
          { externalId: pfPaymentId || undefined },
        ].filter((c) => Object.values(c)[0]),
      },
      orderBy: { createdAt: "desc" },
    })) ??
    (userId
      ? await prisma.payment.findFirst({
          where: { userId, status: "pending", provider: "payfast" },
          orderBy: { createdAt: "desc" },
        })
      : null);

  if (!payment) {
    throw new AppError("Payment not found", "PAYMENT_NOT_FOUND", 404);
  }

  const status =
    paymentStatus === "COMPLETE"
      ? ("complete" as const)
      : paymentStatus === "FAILED" || paymentStatus === "CANCELLED"
        ? paymentStatus === "CANCELLED"
          ? ("cancelled" as const)
          : ("failed" as const)
        : ("pending" as const);

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      externalId: pfPaymentId || payment.externalId,
      status,
      rawPayload: toJsonValue(fields),
    },
  });

  if (paymentStatus === "COMPLETE") {
    await activateAccess(
      payment.userId,
      env.ACCESS_PERIOD_DAYS,
      payment.mPaymentId,
    );
  }

  return { ok: true, status: paymentStatus, userId: payment.userId };
}
