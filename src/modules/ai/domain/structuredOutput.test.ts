import { describe, expect, it } from "vitest";
import {
  buildStructurePrompt,
  buildStructureRawInput,
  inferSchemaFromTable,
  normalizeOutputColumns,
  normalizeStructuredTable,
  parseLlmJson,
  previewTableFromSchema,
} from "./structuredOutput";

describe("structuredOutput", () => {
  it("normalizes column specs and drops duplicates", () => {
    expect(
      normalizeOutputColumns([
        { name: " Amount ", type: "number" },
        { name: "amount", type: "string" },
        { name: "item", type: "string", description: "Product" },
      ]),
    ).toEqual([
      { name: "Amount", type: "number" },
      { name: "item", type: "string", description: "Product" },
    ]);
  });

  it("builds an empty preview table from schema", () => {
    expect(
      previewTableFromSchema([
        { name: "date", type: "date" },
        { name: "amount", type: "number" },
      ]),
    ).toEqual({ columns: ["date", "amount"], rows: [] });
  });

  it("parses fenced JSON from the model", () => {
    const parsed = parseLlmJson('```json\n{"columns":["a"],"rows":[{"a":1}]}\n```');
    expect(parsed).toEqual({ columns: ["a"], rows: [{ a: 1 }] });
  });

  it("forces model rows into the configured schema types", () => {
    const table = normalizeStructuredTable(
      {
        columns: ["item", "qty", "extra"],
        rows: [{ item: "Tea", qty: "3", extra: "x" }, { Item: "Coffee", qty: "n/a" }],
      },
      [
        { name: "item", type: "string" },
        { name: "qty", type: "number" },
      ],
    );
    expect(table.columns).toEqual(["item", "qty"]);
    expect(table.rows).toEqual([
      { item: "Tea", qty: 3 },
      { item: "Coffee", qty: null },
    ]);
  });

  it("includes schema names in the structure prompt", () => {
    const prompt = buildStructurePrompt({
      raw: "sold 2 teas for 40",
      schema: [{ name: "item", type: "string" }, { name: "amount", type: "number" }],
      instructions: "ZAR only",
    });
    expect(prompt).toContain('"name":"item"');
    expect(prompt).toContain("ZAR only");
    expect(prompt).toContain("sold 2 teas");
  });

  it("combines upstream table and notes for the model", () => {
    const raw = buildStructureRawInput({
      table: {
        columns: ["line"],
        rows: [{ line: "tea 10" }],
      },
      rawText: "prefer ZAR",
    });
    expect(raw).toContain("COLUMNS: line");
    expect(raw).toContain("NOTES:");
    expect(raw).toContain("prefer ZAR");
  });

  it("infers a typed builder schema from the AI table", () => {
    const schema = inferSchemaFromTable({
      columns: ["date", "amount", "ok"],
      rows: [
        { date: "2024-01-02", amount: 12.5, ok: "yes" },
        { date: "2024-02-03", amount: 40, ok: "no" },
      ],
    });
    expect(schema.find((c) => c.name === "date")?.type).toBe("date");
    expect(schema.find((c) => c.name === "amount")?.type).toBe("number");
    expect(schema.find((c) => c.name === "ok")?.type).toBe("boolean");
  });
});
