import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiStructureBlock } from "./aiStructure";

describe("aiStructureBlock", () => {
  const callLlm = vi.fn();

  beforeEach(() => {
    callLlm.mockReset();
  });

  it("uses wired table input and fills suggested schema when builder is empty", async () => {
    callLlm.mockResolvedValue(
      JSON.stringify({
        columns: ["item", "amount"],
        rows: [
          { item: "Tea", amount: "12.5" },
          { item: "Coffee", amount: 18 },
        ],
      }),
    );

    const out = await aiStructureBlock.run(
      {
        aiOptIn: true,
        rawText: "",
        outputColumns: [],
        lockSchema: false,
      },
      {
        table: {
          columns: ["notes"],
          rows: [{ notes: "tea 12.50" }],
        },
      },
      {
        userId: "u1",
        runId: "r1",
        optInAi: true,
        aiCreditCost: 0,
        hasLlmKey: true,
        callLlm,
      },
    );

    expect(callLlm).toHaveBeenCalledWith(
      expect.stringContaining("COLUMNS: notes"),
      { json: true },
    );
    expect(out.schemaAutoFilled).toBe(true);
    expect(out.suggestedOutputColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "item", type: "string" }),
        expect.objectContaining({ name: "amount", type: "number" }),
      ]),
    );
    expect(out.outputColumns).toEqual(out.suggestedOutputColumns);
  });

  it("keeps builder schema when columns are set", async () => {
    callLlm.mockResolvedValue(
      JSON.stringify({
        columns: ["item", "amount"],
        rows: [{ item: "Tea", amount: "12.5" }],
      }),
    );

    const out = await aiStructureBlock.run(
      {
        aiOptIn: true,
        rawText: "tea 12.50",
        outputColumns: [
          { name: "item", type: "string" },
          { name: "amount", type: "number" },
        ],
      },
      {},
      {
        userId: "u1",
        runId: "r1",
        optInAi: true,
        aiCreditCost: 0,
        hasLlmKey: true,
        callLlm,
      },
    );

    expect(callLlm).toHaveBeenCalledWith(expect.stringContaining('"name":"item"'), {
      json: true,
    });
    expect(out.schemaAutoFilled).toBe(false);
    expect(out.outputColumns).toEqual([
      { name: "item", type: "string" },
      { name: "amount", type: "number" },
    ]);
    expect(out.table).toEqual({
      columns: ["item", "amount"],
      rows: [{ item: "Tea", amount: 12.5 }],
    });
  });

  it("requires opt-in and a key", async () => {
    await expect(
      aiStructureBlock.run({ aiOptIn: false, rawText: "x" }, {}, {
        userId: "u1",
        runId: "r1",
        optInAi: false,
        aiCreditCost: 0,
        hasLlmKey: true,
        callLlm,
      }),
    ).rejects.toThrow(/opt-in/i);

    await expect(
      aiStructureBlock.run({ aiOptIn: true, rawText: "x" }, {}, {
        userId: "u1",
        runId: "r1",
        optInAi: true,
        aiCreditCost: 0,
        hasLlmKey: false,
        callLlm,
      }),
    ).rejects.toThrow(/API key/i);
  });
});
