import { NextResponse } from "next/server";
import { startPayfastAccessCheckout } from "@/modules/billing/application/payfastCheckout";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function POST() {
  try {
    const user = await requireUser();
    const result = await startPayfastAccessCheckout(user.id);
    return NextResponse.json({
      actionUrl: result.checkout.actionUrl,
      fields: result.checkout.fields,
      paymentId: result.payment.id,
      sandbox: result.sandbox,
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json(
      { error: err.message },
      { status: err.status ?? 500 },
    );
  }
}
