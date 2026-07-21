import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { listExcelSheets, parseCsv, parseExcel } from "./parseTable";
import { fileTooLargeMessage, normalizeExcelRange } from "./uploadLimits";

function excelBuffer(sheets: Record<string, (string | number)[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const table = parseCsv("A,B\n1,2\n3,4\n");
    expect(table.columns).toEqual(["A", "B"]);
    expect(table.rows).toHaveLength(2);
  });
});

describe("parseExcel", () => {
  it("lists sheets and parses a named sheet", () => {
    const buf = excelBuffer({
      Sales: [
        ["Region", "Amount"],
        ["N", 10],
        ["S", 20],
      ],
      Meta: [["Key"], ["x"]],
    });
    expect(listExcelSheets(buf)).toEqual(["Sales", "Meta"]);
    const table = parseExcel(buf, { sheet: "Sales" });
    expect(table.columns).toEqual(["Region", "Amount"]);
    expect(table.rows).toHaveLength(2);
  });

  it("honours an A1 range", () => {
    const buf = excelBuffer({
      Data: [
        ["ignore", "ignore"],
        ["ignore", "ignore"],
        ["", "ColA", "ColB"],
        ["", 1, 2],
        ["", 3, 4],
      ],
    });
    const table = parseExcel(buf, { sheet: "Data", range: "B3:C5" });
    expect(table.columns).toEqual(["ColA", "ColB"]);
    expect(table.rows).toEqual([
      { ColA: 1, ColB: 2 },
      { ColA: 3, ColB: 4 },
    ]);
  });
});

describe("uploadLimits", () => {
  it("formats oversized file messages", () => {
    expect(fileTooLargeMessage(12 * 1024 * 1024, 10 * 1024 * 1024)).toContain(
      "too large",
    );
    expect(normalizeExcelRange(" a1:d10 ")).toBe("A1:D10");
    expect(() => normalizeExcelRange("not-a-range")).toThrow(/Invalid Excel range/);
  });
});
