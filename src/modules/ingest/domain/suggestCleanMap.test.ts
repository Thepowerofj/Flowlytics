import { describe, expect, it } from "vitest";
import { suggestCleanMapConfig, suggestColumnTransform } from "./suggestCleanMap";

describe("suggestCleanMap", () => {
  it("casts dates, currency, and numbers explicitly", () => {
    const table = {
      columns: ["Month", "Revenue", "Units", "Active"],
      rows: [
        { Month: "2024-01-01", Revenue: "R 1,200.50", Units: "10", Active: "yes" },
        { Month: "2024-02-01", Revenue: "R 980.00", Units: "8", Active: "no" },
        { Month: "2024-03-01", Revenue: "R 1,450.25", Units: "12", Active: "yes" },
      ],
    };

    expect(suggestColumnTransform(table, "Month").type).toBe("date");
    expect(suggestColumnTransform(table, "Revenue").type).toBe("currency");
    expect(suggestColumnTransform(table, "Revenue").currencyCode).toBe("ZAR");
    expect(suggestColumnTransform(table, "Units").type).toBe("number");
    expect(suggestColumnTransform(table, "Active").type).toBe("boolean");

    const cfg = suggestCleanMapConfig(table);
    expect(cfg.transforms.Month?.type).toBe("date");
    expect(cfg.transforms.Revenue?.type).toBe("currency");
    expect(cfg._columnFormats.Revenue?.kind).toBe("currency");
  });

  it("casts Excel serial month columns as dates", () => {
    const table = {
      columns: ["tx_month", "total_missed_value"],
      rows: [
        { tx_month: 46082, total_missed_value: 100 },
        { tx_month: 46113, total_missed_value: 120 },
        { tx_month: 46143, total_missed_value: 140 },
      ],
    };
    expect(suggestColumnTransform(table, "tx_month").type).toBe("date");
    expect(suggestCleanMapConfig(table).transforms.tx_month?.type).toBe("date");
  });

  it("drops fully empty columns", () => {
    const cfg = suggestCleanMapConfig({
      columns: ["A", "Empty"],
      rows: [
        { A: "x", Empty: null },
        { A: "y", Empty: "" },
      ],
    });
    expect(cfg.dropColumns).toContain("Empty");
    expect(cfg.transforms.A?.type).toBe("string");
  });
});
