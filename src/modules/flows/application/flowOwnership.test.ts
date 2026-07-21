import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    flow: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/shared/lib/prisma";
import { deleteFlow, getFlowForUser } from "./flowService";

describe("flow ownership (CAP-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects flow access when not owned by the authenticated user", async () => {
    vi.mocked(prisma.flow.findFirst).mockResolvedValue(null);
    await expect(getFlowForUser("flow_a", "user_b")).rejects.toMatchObject({
      status: 404,
      message: "Flow not found",
    });
    expect(prisma.flow.findFirst).toHaveBeenCalledWith({
      where: { id: "flow_a", userId: "user_b" },
    });
  });

  it("deletes only after scoping by flowId + userId", async () => {
    vi.mocked(prisma.flow.findFirst).mockResolvedValue({
      id: "flow_a",
      userId: "user_a",
    } as never);
    vi.mocked(prisma.flow.delete).mockResolvedValue({} as never);

    await deleteFlow("flow_a", "user_a");

    expect(prisma.flow.findFirst).toHaveBeenCalledWith({
      where: { id: "flow_a", userId: "user_a" },
    });
    expect(prisma.flow.delete).toHaveBeenCalledWith({ where: { id: "flow_a" } });
  });
});
