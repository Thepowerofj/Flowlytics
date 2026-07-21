import { describe, expect, it } from "vitest";
import {
  applyTableTransforms,
  defaultColumnTransform,
  parseDate,
  transformCell,
} from "./columnTransform";

describe("columnTransform", () => {
  it("trims and lowercases strings", () => {
    const t = { ...defaultColumnTransform(), textCase: "lower" as const };
    expect(transformCell("  Hello ", t)).toBe("hello");
  });

  it("parses currency numbers when stripCurrency is on", () => {
    const t = {
      ...defaultColumnTransform(),
      type: "number" as const,
      stripCurrency: true,
      decimals: 2,
    };
    expect(transformCell("$1,234.5", t)).toBe(1234.5);
  });

  it("parses currency type (Rand, symbols, thousands separators)", () => {
    const t = {
      ...defaultColumnTransform(),
      type: "currency" as const,
      decimals: 2,
    };
    expect(transformCell("R 1,234.50", t)).toBe(1234.5);
    expect(transformCell("€99", t)).toBe(99);
    expect(transformCell("ZAR 10.2", t)).toBe(10.2);
  });

  it("parses dmy dates", () => {
    const t = {
      ...defaultColumnTransform(),
      type: "date" as const,
      dateFormat: "dmy" as const,
    };
    expect(transformCell("31/01/2024", t)).toBe("2024-01-31");
  });

  it("parses dates robustly (excel serial, auto DMY, month names)", () => {
    expect(parseDate("31/01/2024", "auto")).toBe("2024-01-31");
    expect(parseDate("01/02/2024", "auto")).toBe("2024-02-01"); // DMY, not US MDY
    expect(parseDate("01/02/2024", "mdy")).toBe("2024-01-02");
    expect(parseDate("2024-01-31", "auto")).toBe("2024-01-31");
    expect(parseDate("2024-01-31T15:30:00Z", "iso")).toBe("2024-01-31");
    expect(parseDate("21 Jan 2024", "auto")).toBe("2024-01-21");
    expect(parseDate("January 21, 2024", "auto")).toBe("2024-01-21");
    expect(parseDate(45322, "auto")).toBe("2024-01-31"); // Excel serial
    expect(parseDate("45322", "auto")).toBe("2024-01-31");
    expect(parseDate("31/02/2024", "dmy")).toBeNull(); // invalid calendar day
    // Month-year (no day) → first of month
    expect(parseDate("Jan-24", "auto")).toBe("2024-01-01");
    expect(parseDate("Jan 2024", "auto")).toBe("2024-01-01");
    expect(parseDate("February-24", "auto")).toBe("2024-02-01");
    expect(parseDate("2024-01", "auto")).toBe("2024-01-01");
    expect(parseDate("01-2024", "auto")).toBe("2024-01-01");
  });

  it("drops rows when dropIfEmpty is set", () => {
    const result = applyTableTransforms(
      {
        columns: ["name", "email"],
        rows: [
          { name: "Ada", email: "a@x.com" },
          { name: "Bob", email: "" },
        ],
      },
      {
        dropColumns: [],
        columnMap: { name: "name", email: "email" },
        transforms: {
          name: defaultColumnTransform(),
          email: { ...defaultColumnTransform(), dropIfEmpty: true },
        },
      },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Ada");
  });
});
