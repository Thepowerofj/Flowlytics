import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/modules/identity/application/passwordReset";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => ({})));
  // Always same response — avoid account enumeration
  if (body.success) {
    try {
      await requestPasswordReset(body.data.email);
    } catch (error) {
      console.error("[forgot-password]", error);
    }
  }
  return NextResponse.json({
    ok: true,
    message:
      "If that email is registered with a password, you’ll receive a reset link shortly.",
  });
}
