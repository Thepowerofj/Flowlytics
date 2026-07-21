import { NextResponse } from "next/server";
import { getOpsMetrics } from "@/modules/ops";
import { requireAdmin } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    await requireAdmin();
    const metrics = await getOpsMetrics();
    return NextResponse.json(metrics);
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
