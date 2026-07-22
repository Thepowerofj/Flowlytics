import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminCreditUser,
  listUsersAdmin,
  updateUserCommercial,
} from "@/modules/identity/application/adminUsers";
import {
  findUsersByPaymentReference,
  normalizePaymentReference,
  getPaymentGateway,
} from "@/modules/billing";
import { accessStatusOf } from "@/modules/identity/domain/access";
import { requireAdmin } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";
import { getEnv } from "@/shared/config/env";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const env = getEnv();

    if (q) {
      const matched = await findUsersByPaymentReference(q);
      const users = matched.map(({ llmApiKeyEnc, ...u }) => ({
        ...u,
        hasLlmKey: Boolean(llmApiKeyEnc),
        status: accessStatusOf(u),
      }));
      return NextResponse.json({
        users,
        gateway: getPaymentGateway().name,
        accessPeriodDays: env.ACCESS_PERIOD_DAYS,
        query: normalizePaymentReference(q) || q,
      });
    }

    const users = await listUsersAdmin();
    return NextResponse.json({
      users,
      gateway: getPaymentGateway().name,
      accessPeriodDays: env.ACCESS_PERIOD_DAYS,
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

const patchSchema = z.object({
  userId: z.string(),
  isPaid: z.boolean().optional(),
  eftReference: z.string().nullable().optional(),
  disabled: z.boolean().optional(),
  /** Grant N days of access from now (default 30). */
  activateDays: z.number().int().positive().max(365).optional(),
  revoke: z.boolean().optional(),
  creditAmount: z.number().int().positive().optional(),
  creditNote: z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = patchSchema.parse(await req.json());
    const user = await updateUserCommercial(body.userId, body);
    let balance = user.walletBalance;
    if (body.creditAmount) {
      balance = await adminCreditUser(
        body.userId,
        body.creditAmount,
        body.creditNote ?? "eft",
      );
    }
    return NextResponse.json({ user, balance });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
