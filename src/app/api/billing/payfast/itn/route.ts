import { NextResponse } from "next/server";
import { handlePayfastItn } from "@/modules/billing/application/payfastCheckout";
import { AppError } from "@/shared/lib/errors";

/** PayFast Instant Transaction Notification (server-to-server). */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let fields: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      fields = (await req.json()) as Record<string, string>;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      fields = Object.fromEntries(params.entries());
    }
    // Normalize to strings
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      normalized[k] = v == null ? "" : String(v);
    }
    const result = await handlePayfastItn(normalized);
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
    void result;
  } catch (e) {
    const err = e as AppError;
    console.error("[payfast itn]", err.message);
    return NextResponse.json(
      { error: err.message },
      { status: err.status ?? 400 },
    );
  }
}
