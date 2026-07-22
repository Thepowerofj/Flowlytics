import { NextResponse } from "next/server";
import { listBlockSummaries } from "@/modules/blocks/catalog";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(listBlockSummaries());
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
