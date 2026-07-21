import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensurePaymentReference,
  paymentReferenceHint,
} from "@/modules/billing";
import {
  declareEftPayment,
  getUserAccess,
} from "@/modules/identity/application/accountAccess";
import { requireUser } from "@/shared/lib/session";
import { getEnv } from "@/shared/config/env";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const eftReference = await ensurePaymentReference(user.id);
    const access = await getUserAccess(user.id);
    const env = getEnv();
    return NextResponse.json({
      status: access.status,
      hasAccess: access.hasAccess,
      eftDeclaredAt: access.eftDeclaredAt,
      eftNote: access.eftNote,
      eftReference,
      accessExpiresAt: access.accessExpiresAt,
      accessPeriodDays: env.ACCESS_PERIOD_DAYS,
      bank: {
        name: env.BANK_NAME,
        accountName: env.BANK_ACCOUNT_NAME,
        accountNumber: env.BANK_ACCOUNT_NUMBER,
        branchCode: env.BANK_BRANCH_CODE,
        referenceHint: paymentReferenceHint(eftReference),
      },
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

const postSchema = z.object({
  note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = postSchema.parse(await req.json().catch(() => ({})));
    await declareEftPayment(user.id, body.note);
    const access = await getUserAccess(user.id);
    return NextResponse.json({ ok: true, status: access.status, eftDeclaredAt: access.eftDeclaredAt });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
