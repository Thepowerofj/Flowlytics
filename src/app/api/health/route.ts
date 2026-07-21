import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "flowlytics" });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
