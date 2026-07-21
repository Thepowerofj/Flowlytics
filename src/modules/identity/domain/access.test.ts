import { describe, expect, it } from "vitest";
import {
  accessExpiresInDays,
  accessStatusOf,
  hasActiveAccess,
} from "./access";

describe("account access", () => {
  it("admins always have access", () => {
    expect(
      hasActiveAccess({
        role: "ADMIN",
        disabled: false,
        accessExpiresAt: null,
      }),
    ).toBe(true);
  });

  it("users need a future expiry", () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    expect(
      hasActiveAccess({ role: "USER", disabled: false, accessExpiresAt: future }),
    ).toBe(true);
    expect(
      hasActiveAccess({ role: "USER", disabled: false, accessExpiresAt: past }),
    ).toBe(false);
    expect(
      hasActiveAccess({ role: "USER", disabled: false, accessExpiresAt: null }),
    ).toBe(false);
  });

  it("reports pending vs expired vs disabled status", () => {
    expect(
      accessStatusOf({ role: "USER", disabled: false, accessExpiresAt: null }),
    ).toBe("pending_payment");
    expect(
      accessStatusOf({
        role: "USER",
        disabled: false,
        accessExpiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe("expired");
    expect(
      accessStatusOf({
        role: "USER",
        disabled: true,
        accessExpiresAt: new Date(Date.now() - 1000),
      }),
    ).toBe("disabled");
  });

  it("adds access period days", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    expect(accessExpiresInDays(from, 30).toISOString().slice(0, 10)).toBe(
      "2024-01-31",
    );
  });
});
