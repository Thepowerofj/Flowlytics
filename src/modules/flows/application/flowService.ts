import type { FlowGraph } from "@/modules/blocks";
import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import { toJsonValueSafe } from "@/shared/lib/json";

export async function listFlows(userId: string) {
  const flows = await prisma.flow.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      createdAt: true,
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          queuePosition: true,
          etaSeconds: true,
          createdAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      },
    },
  });
  return flows.map(({ runs, ...flow }) => ({
    ...flow,
    lastRun: runs[0] ?? null,
  }));
}

export async function getFlowForUser(flowId: string, userId: string) {
  const flow = await prisma.flow.findFirst({ where: { id: flowId, userId } });
  if (!flow) throw new AppError("Flow not found", "NOT_FOUND", 404);
  return flow;
}

export async function createFlow(userId: string, name: string) {
  const graph: FlowGraph = { nodes: [], edges: [] };
  return prisma.flow.create({
    data: { userId, name, graphJson: toJsonValueSafe(graph, "flow-graph").value },
  });
}

/** Create a flow already populated with a graph (e.g. auto-pipeline). */
export async function createFlowWithGraph(
  userId: string,
  name: string,
  graph: FlowGraph,
) {
  return prisma.flow.create({
    data: {
      userId,
      name,
      graphJson: toJsonValueSafe(graph, "flow-graph").value,
    },
  });
}

export async function saveFlowGraph(
  flowId: string,
  userId: string,
  name: string,
  graph: FlowGraph,
) {
  await getFlowForUser(flowId, userId);
  return prisma.flow.update({
    where: { id: flowId },
    data: {
      name,
      graphJson: toJsonValueSafe(graph, "flow-graph").value,
    },
  });
}

export async function assertFlowOwned(flowId: string, userId: string) {
  return getFlowForUser(flowId, userId);
}

export async function deleteFlow(flowId: string, userId: string) {
  await getFlowForUser(flowId, userId);
  await prisma.flow.delete({ where: { id: flowId } });
}
