import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./secretBox";

describe("secretBox", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("sk-test-secret-key", "auth-secret-at-least-16");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc, "auth-secret-at-least-16")).toBe("sk-test-secret-key");
  });

  it("fails closed on wrong secret", () => {
    const enc = encryptSecret("sk-test", "auth-secret-at-least-16");
    expect(decryptSecret(enc, "different-secret-xx")).toBeNull();
  });

  it("masks keys", () => {
    expect(maskSecret("sk-abcdefghij")).toMatch(/^sk-…/);
  });
});
