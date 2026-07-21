import { NextResponse } from "next/server";
import { z } from "zod";
import { toCsv } from "@/modules/analyse/domain/stats";
import { requireUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

const schema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.any())),
  fileName: z.string().max(120).optional(),
});

function safeFileName(name: string | undefined): string {
  const raw = (name || "flowlytics-export.csv").replace(/[^\w.\- ()]/g, "_");
  return raw.toLowerCase().endsWith(".csv") ? raw : `${raw}.csv`;
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = schema.parse(await req.json());
    const csv = toCsv(body);
    const fileName = safeFileName(body.fileName);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
