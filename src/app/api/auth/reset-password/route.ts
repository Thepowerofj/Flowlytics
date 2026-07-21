import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordWithToken } from "@/modules/identity/application/passwordReset";
import { AppError } from "@/shared/lib/errors";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    await resetPasswordWithToken(body.token, body.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a valid password (at least 8 characters)." },
        { status: 400 },
      );
    }
    const err = e as AppError;
    return NextResponse.json(
      { error: err.message ?? "Could not reset password" },
      { status: err.status ?? 500 },
    );
  }
}
