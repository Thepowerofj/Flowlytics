import { describe, expect, it } from "vitest";
import {
  formatPaymentReference,
  generatePaymentReference,
  looksLikePaymentReference,
  normalizePaymentReference,
} from "./paymentReference";

describe("paymentReference", () => {
  it("generates short FL-XXXXXX codes without ambiguous characters", () => {
    const ref = generatePaymentReference();
    expect(ref).toMatch(/^FL-[2-9A-HJ-NP-Z]{6}$/);
    // Body (after FL-) avoids 0/O/1/I/L lookalikes; prefix keeps brand letters
    const body = ref.slice(3);
    expect(body).not.toMatch(/[01IOL]/);
    expect(ref.length).toBe(9); // FL- + 6
  });

  it("normalizes messy bank / user input for lookup", () => {
    expect(normalizePaymentReference("fl k7m3pq")).toBe("FL-K7M3PQ");
    expect(normalizePaymentReference("FLK7M3PQ")).toBe("FL-K7M3PQ");
    expect(normalizePaymentReference("K7M3PQ")).toBe("FL-K7M3PQ");
    expect(formatPaymentReference("fl-ab12cd")).toBe("FL-AB12CD");
  });

  it("recognises valid payment references", () => {
    expect(looksLikePaymentReference("FL-AB23CD")).toBe(true);
    expect(looksLikePaymentReference("user@example.com")).toBe(false);
    expect(looksLikePaymentReference("EFT-1234567890")).toBe(false);
  });
});
