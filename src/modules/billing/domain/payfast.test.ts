import { describe, expect, it } from "vitest";
import { payfastSignature, verifyPayfastSignature } from "./payfast";

describe("payfast signature", () => {
  it("is stable for sorted fields", () => {
    const fields = {
      merchant_id: "10000100",
      merchant_key: "46f0cd694581a",
      amount: "100.00",
      item_name: "Test",
    };
    const sig = payfastSignature(fields, "pass");
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
    expect(
      verifyPayfastSignature({ ...fields, signature: sig }, "pass"),
    ).toBe(true);
  });

  it("rejects tampered amount", () => {
    const fields = {
      merchant_id: "10000100",
      amount: "100.00",
      item_name: "Test",
    };
    const sig = payfastSignature(fields);
    expect(
      verifyPayfastSignature(
        { ...fields, amount: "1.00", signature: sig },
      ),
    ).toBe(false);
  });
});
