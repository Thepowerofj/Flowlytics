import { NextResponse } from "next/server";
import { getWalletBalance } from "@/modules/billing";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    const user = await requireUser();
    const balance = await getWalletBalance(user.id);
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      walletBalance: balance,
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
