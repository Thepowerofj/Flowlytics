import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  DATA_DISCLAIMER,
  detectPiiInTable,
  fileTooLargeMessage,
  listExcelSheets,
  normalizeExcelRange,
  parseCsv,
  parseExcel,
} from "@/modules/ingest";
import { getEnv } from "@/shared/config/env";
import { prisma } from "@/shared/lib/prisma";
import { requireActiveUser } from "@/shared/lib/session";
import { AppError } from "@/shared/lib/errors";

function isExcelName(name: string, mime: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return (
    ext === ".xlsx" ||
    ext === ".xls" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  );
}

function isCsvName(name: string, mime: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ext === ".csv" || mime === "text/csv";
}

export async function POST(req: Request) {
  try {
    const user = await requireActiveUser();
    const env = getEnv();
    const form = await req.formData();
    const file = form.get("file");
    const fileIdField = form.get("fileId");
    const sheetField = form.get("sheet");
    const rangeField = form.get("range");

    const sheet =
      typeof sheetField === "string" && sheetField.trim()
        ? sheetField.trim()
        : undefined;
    let range: string | undefined;
    try {
      range = normalizeExcelRange(
        typeof rangeField === "string" ? rangeField : undefined,
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid Excel range" },
        { status: 400 },
      );
    }

    let buffer: Buffer;
    let originalName: string;
    let mimeType: string;
    let sizeBytes: number;
    let uploadedFileId: string;

    if (typeof fileIdField === "string" && fileIdField.trim()) {
      const existing = await prisma.uploadedFile.findFirst({
        where: { id: fileIdField.trim(), userId: user.id },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Uploaded file not found. Please choose the file again." },
          { status: 404 },
        );
      }
      try {
        buffer = await readFile(existing.storagePath);
      } catch {
        return NextResponse.json(
          {
            error:
              "Stored file is missing on the server. Please upload the file again.",
          },
          { status: 404 },
        );
      }
      originalName = existing.originalName;
      mimeType = existing.mimeType;
      sizeBytes = existing.sizeBytes;
      uploadedFileId = existing.id;
    } else if (file instanceof File) {
      if (file.size > env.MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            error: fileTooLargeMessage(file.size, env.MAX_UPLOAD_BYTES),
            code: "FILE_TOO_LARGE",
            maxBytes: env.MAX_UPLOAD_BYTES,
            sizeBytes: file.size,
          },
          { status: 413 },
        );
      }
      if (file.size === 0) {
        return NextResponse.json(
          { error: "The selected file is empty.", code: "EMPTY_FILE" },
          { status: 400 },
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
      originalName = file.name;
      mimeType = file.type || "application/octet-stream";
      sizeBytes = file.size;

      const ext = path.extname(originalName).toLowerCase() || ".bin";
      if (!isCsvName(originalName, mimeType) && !isExcelName(originalName, mimeType)) {
        return NextResponse.json(
          {
            error:
              "Unsupported file type. Please upload a CSV (.csv) or Excel (.xlsx / .xls) file.",
            code: "UNSUPPORTED_TYPE",
          },
          { status: 415 },
        );
      }

      await mkdir(env.UPLOAD_DIR, { recursive: true });
      const stored = `${randomUUID()}${ext}`;
      const storagePath = path.join(env.UPLOAD_DIR, stored);
      await writeFile(storagePath, buffer);

      const created = await prisma.uploadedFile.create({
        data: {
          userId: user.id,
          originalName,
          storagePath,
          mimeType,
          sizeBytes,
        },
      });
      uploadedFileId = created.id;

      await prisma.usageCounter.upsert({
        where: { userId: user.id },
        create: { userId: user.id, storageBytes: sizeBytes },
        update: { storageBytes: { increment: sizeBytes } },
      });
    } else {
      return NextResponse.json(
        { error: "Choose a file to upload.", code: "FILE_REQUIRED" },
        { status: 400 },
      );
    }

    let table;
    let sheetNames: string[] | undefined;
    let usedSheet: string | undefined;

    try {
      if (isCsvName(originalName, mimeType)) {
        table = parseCsv(buffer.toString("utf8"));
      } else if (isExcelName(originalName, mimeType)) {
        sheetNames = listExcelSheets(buffer);
        usedSheet =
          sheet && sheetNames.includes(sheet) ? sheet : sheetNames[0];
        table = parseExcel(buffer, { sheet: usedSheet, range });
      } else {
        return NextResponse.json(
          {
            error:
              "Unsupported file type. Please upload a CSV (.csv) or Excel (.xlsx / .xls) file.",
            code: "UNSUPPORTED_TYPE",
          },
          { status: 415 },
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Could not parse the file. Check the format and try again.",
          code: "PARSE_ERROR",
        },
        { status: 422 },
      );
    }

    if (!table.columns.length) {
      return NextResponse.json(
        {
          error:
            "No columns found in the selected data. Check the sheet and range (first row should be headers).",
          code: "EMPTY_TABLE",
        },
        { status: 422 },
      );
    }

    const piiFindings = detectPiiInTable(table.columns, table.rows);
    return NextResponse.json({
      fileId: uploadedFileId,
      fileName: originalName,
      table,
      sheetNames: sheetNames ?? [],
      sheet: usedSheet ?? null,
      range: range ?? null,
      maxBytes: env.MAX_UPLOAD_BYTES,
      piiFindings,
      disclaimer: DATA_DISCLAIMER,
    });
  } catch (e) {
    const err = e as AppError;
    return NextResponse.json(
      {
        error: err.message || "Upload failed unexpectedly.",
        code: "UPLOAD_FAILED",
      },
      { status: err.status ?? 500 },
    );
  }
}
