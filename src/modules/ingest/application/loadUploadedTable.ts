import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/shared/lib/prisma";
import type { TabularData } from "@/modules/blocks/domain/types";
import { parseCsv, parseExcel } from "../domain/parseTable";

/** Reload a user's uploaded CSV/Excel as TabularData. */
export async function loadUploadedTable(
  userId: string,
  fileId: string,
  options?: { sheet?: string | null; range?: string | null },
): Promise<{ table: TabularData; fileName: string } | null> {
  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!file) return null;
  const buffer = await readFile(file.storagePath);
  const ext = path.extname(file.originalName || file.storagePath).toLowerCase();
  const table =
    ext === ".xlsx" || ext === ".xls"
      ? parseExcel(buffer, {
          sheet: options?.sheet ?? undefined,
          range: options?.range ?? undefined,
        })
      : parseCsv(buffer.toString("utf8"));
  return { table, fileName: file.originalName };
}
