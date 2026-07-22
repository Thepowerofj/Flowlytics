import { NextResponse } from "next/server";
import { z } from "zod";
import { exportRunPresentation } from "@/modules/present";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const schema = z.object({
  runId: z.string(),
  format: z.enum(["pdf", "pptx"]),
});

export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const body = schema.parse(await req.json());
    const file = await exportRunPresentation(user.id, body.runId, body.format);
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json(
      { error: err.message },
      { status: err.status ?? 500 },
    );
  }
}
