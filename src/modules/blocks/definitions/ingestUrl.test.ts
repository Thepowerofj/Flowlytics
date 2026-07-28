import { describe, expect, it } from "vitest";
import { ingestUrlBlock, isBlockedHostname, isBlockedIp } from "./ingestUrl";

describe("ingestUrlBlock", () => {
  it("requires HTTPS URLs", async () => {
    await expect(
      ingestUrlBlock.run({ url: "http://example.com/data.csv" }, {}, {
        userId: "u1",
        runId: "r1",
        optInAi: false,
        aiCreditCost: 0,
      }),
    ).rejects.toThrow(/only https/i);
  });

  it("blocks local and private network targets", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.2")).toBe(true);
    expect(isBlockedIp("172.16.1.3")).toBe(true);
    expect(isBlockedIp("192.168.1.20")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});
