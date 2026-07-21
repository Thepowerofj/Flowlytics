import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { TabularData } from "@/modules/blocks/domain/types";
import { normalizeExcelRange } from "./uploadLimits";

function normalizeRows(
  columns: string[],
  matrix: unknown[][],
): TabularData {
  const rows = matrix.map((line) => {
    const row: Record<string, string | number | null> = {};
    columns.forEach((col, i) => {
      const cell = line[i];
      if (cell == null || cell === "") {
        row[col] = null;
      } else if (typeof cell === "number") {
        row[col] = cell;
      } else {
        const asNum = Number(cell);
        row[col] =
          typeof cell === "string" && cell.trim() !== "" && !Number.isNaN(asNum)
            ? asNum
            : String(cell);
      }
    });
    return row;
  });
  return { columns, rows };
}

export function parseCsv(content: string): TabularData {
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });
  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(
      first?.message
        ? `Could not parse CSV: ${first.message}`
        : "Could not parse CSV file",
    );
  }
  if (!parsed.data.length) return { columns: [], rows: [] };
  const [header, ...body] = parsed.data;
  const columns = header.map((h, i) => (h?.trim() ? h.trim() : `col_${i + 1}`));
  return normalizeRows(columns, body);
}

export type ExcelParseOptions = {
  /** Sheet name; defaults to the first sheet. */
  sheet?: string;
  /** A1 range such as A1:D50; omit for the whole sheet. */
  range?: string;
};

export function listExcelSheets(buffer: Buffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames ?? [];
  } catch {
    throw new Error(
      "Could not read this Excel file. It may be corrupt or password-protected.",
    );
  }
}

export function parseExcel(
  buffer: Buffer,
  options: ExcelParseOptions = {},
): TabularData {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new Error(
      "Could not read this Excel file. It may be corrupt or password-protected.",
    );
  }

  if (!workbook.SheetNames.length) {
    throw new Error("This Excel workbook has no sheets.");
  }

  const requested = options.sheet?.trim();
  const sheetName =
    requested && workbook.SheetNames.includes(requested)
      ? requested
      : workbook.SheetNames[0]!;

  if (requested && !workbook.SheetNames.includes(requested)) {
    throw new Error(
      `Sheet “${requested}” was not found. Available: ${workbook.SheetNames.join(", ")}.`,
    );
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet “${sheetName}” could not be opened.`);
  }

  let range: string | undefined;
  try {
    range = normalizeExcelRange(options.range);
  } catch (e) {
    throw e instanceof Error ? e : new Error("Invalid Excel range");
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    ...(range ? { range } : {}),
    blankrows: false,
  });

  if (!matrix.length) {
    throw new Error(
      range
        ? `No data found in range ${range} on sheet “${sheetName}”.`
        : `Sheet “${sheetName}” is empty.`,
    );
  }

  const [header, ...body] = matrix;
  const columns = (header ?? []).map((h, i) =>
    h == null || String(h).trim() === "" ? `col_${i + 1}` : String(h).trim(),
  );

  if (!columns.length) {
    throw new Error(
      `No header row found${range ? ` in ${range}` : ""} on sheet “${sheetName}”.`,
    );
  }

  return normalizeRows(columns, body);
}
