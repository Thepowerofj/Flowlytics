import { describe, expect, it } from "vitest";
import {
  displayFormatFromTransform,
  formatChartValue,
  formatDisplayValue,
  formatsFromCleanMap,
  resolveValueFormat,
} from "./columnFormat";
import { defaultColumnTransform } from "./columnTransform";

describe("columnFormat", () => {
  it("builds currency format from transform with code and grouping", () => {
    const fmt = displayFormatFromTransform({
      ...defaultColumnTransform(),
      type: "currency",
      currencyCode: "USD",
      decimals: 2,
      useGrouping: true,
    });
    expect(fmt).toEqual({
      kind: "currency",
      currencyCode: "USD",
      decimals: 2,
      useGrouping: true,
    });
  });

  it("maps Clean/Map formats onto renamed output columns", () => {
    const formats = formatsFromCleanMap({
      _sourceColumns: ["amt", "name"],
      dropColumns: [],
      columnMap: { amt: "Amount", name: "Name" },
      transforms: {
        amt: {
          ...defaultColumnTransform(),
          type: "currency",
          currencyCode: "ZAR",
          decimals: 2,
        },
        name: defaultColumnTransform(),
      },
    });
    expect(formats.Amount?.kind).toBe("currency");
    expect(formats.Amount?.currencyCode).toBe("ZAR");
    expect(formats.Name?.kind).toBe("string");
  });

  it("formats numbers with thousand separators", () => {
    const text = formatDisplayValue(1234567.8, {
      kind: "number",
      decimals: 1,
      useGrouping: true,
    });
    expect(text.replace(/\s/g, "")).toMatch(/1.?234.?567/);
    expect(text).toContain("8");
  });

  it("keeps currency on compact chart labels", () => {
    const large = formatChartValue(1500, {
      kind: "currency",
      currencyCode: "USD",
      decimals: 2,
      useGrouping: true,
    });
    expect(large).toBe("$1.5k");

    const small = formatChartValue(42.5, {
      kind: "currency",
      currencyCode: "ZAR",
      decimals: 2,
      useGrouping: true,
    });
    expect(small).toMatch(/42/);
    expect(small).toMatch(/R/);
  });

  it("resolves measure format after aggregation / forecast", () => {
    const formats = {
      Total: { kind: "currency" as const, currencyCode: "ZAR" as const, decimals: 2 },
      value: { kind: "currency" as const, currencyCode: "ZAR" as const, decimals: 2 },
    };
    expect(resolveValueFormat(formats, "Total")?.currencyCode).toBe("ZAR");
    expect(resolveValueFormat(formats, "missing")?.kind).toBe("currency");
  });
});
