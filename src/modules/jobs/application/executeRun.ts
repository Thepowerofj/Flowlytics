import { getBlock } from "@/modules/blocks/registry";
import type { FlowGraph } from "@/modules/blocks/domain/types";
import { getEnv } from "@/shared/config/env";
import { prisma } from "@/shared/lib/prisma";
import { compactJsonValue, toJsonValueSafe } from "@/shared/lib/json";
import { callLlm } from "@/modules/ai/infrastructure/llmAdapter";
import { decryptSecret } from "@/modules/identity/domain/secretBox";
import { assertActiveAccess } from "@/modules/identity/application/accountAccess";
import { inputsForNode, topologicalOrder } from "../domain/dag";
import { retryHydrationPlan } from "../domain/retryHydration";
import { graphForRun } from "../domain/runGraph";

type RunForRetry = {
  id: string;
  flowId: string;
  userId: string;
  createdAt: Date;
  retryFromBlockId?: string | null;
};

async function hydrateRetryOutputs(input: {
  run: RunForRetry;
  graph: FlowGraph;
  fullOrder: string[];
}): Promise<{
  order: string[];
  outputs: Map<string, Record<string, unknown>>;
  result: Record<string, unknown>;
}> {
  const outputs = new Map<string, Record<string, unknown>>();
  const result: Record<string, unknown> = {};
  const retryFrom = input.run.retryFromBlockId;
  const retryIdx = retryFrom ? input.fullOrder.indexOf(retryFrom) : -1;
  if (!retryFrom || retryIdx < 0) {
    return { order: input.fullOrder, outputs, result };
  }

  const previous = await prisma.flowRun.findFirst({
    where: {
      id: { not: input.run.id },
      flowId: input.run.flowId,
      userId: input.run.userId,
      createdAt: { lt: input.run.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!previous) {
    return { order: input.fullOrder, outputs, result };
  }

  const upstream = new Set(input.fullOrder.slice(0, retryIdx));
  if (!upstream.size) {
    return { order: input.fullOrder.slice(retryIdx), outputs, result };
  }

  const steps = await prisma.runStep.findMany({
    where: {
      runId: previous.id,
      blockId: { in: [...upstream] },
      status: "SUCCEEDED",
    },
    select: { blockId: true, outputJson: true },
  });
  for (const step of steps) {
    if (step.outputJson && typeof step.outputJson === "object") {
      outputs.set(step.blockId, step.outputJson as Record<string, unknown>);
    }
  }

  const plan = retryHydrationPlan({
    graph: input.graph,
    fullOrder: input.fullOrder,
    retryFromBlockId: retryFrom,
    availableOutputIds: outputs.keys(),
  });
  if (!plan.hydrated) {
    return { order: input.fullOrder, outputs: new Map(), result: {} };
  }

  const byBlockId: Record<string, Record<string, unknown>> = {};
  for (const [blockId, output] of outputs) {
    byBlockId[blockId] = compactJsonValue(output) as Record<string, unknown>;
    Object.assign(result, byBlockId[blockId]);
  }
  result.byBlockId = byBlockId;

  return {
    order: plan.order,
    outputs,
    result,
  };
}

async function notifyRunOutcome(input: {
  userId: string;
  flowId: string;
  flowName: string;
  runId: string;
  ok: boolean;
  errorMessage?: string;
  failedBlockId?: string;
  graph?: FlowGraph;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  if (!user?.email) return;

  const {
    sendRunFailedEmail,
    sendRunSucceededEmail,
  } = await import("@/modules/notify");

  if (input.ok) {
    await sendRunSucceededEmail({
      to: user.email,
      flowName: input.flowName,
      flowId: input.flowId,
      runId: input.runId,
    });
    return;
  }

  const failedNode = input.failedBlockId
    ? input.graph?.nodes.find((n) => n.id === input.failedBlockId)
    : undefined;
  let blockLabel: string | null = null;
  if (failedNode) {
    try {
      blockLabel = getBlock(failedNode.type).label;
    } catch {
      blockLabel = failedNode.type;
    }
  }
  const label =
    (failedNode?.config?.datasetName as string | undefined) || blockLabel;

  await sendRunFailedEmail({
    to: user.email,
    flowName: input.flowName,
    flowId: input.flowId,
    runId: input.runId,
    errorMessage: input.errorMessage || "Unknown error",
    failedActivity: label,
  });
}

export async function executeRun(runId: string, workerId: string) {
  const env = getEnv();
  const run = await prisma.flowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { flow: true },
  });
  await assertActiveAccess(run.userId);

  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: run.userId },
    select: { llmApiKeyEnc: true },
  });
  const userApiKey = owner.llmApiKeyEnc
    ? decryptSecret(owner.llmApiKeyEnc, env.AUTH_SECRET)
    : null;

  const graph = graphForRun(run, run.flow);
  const fullOrder = topologicalOrder(graph);
  const hydrated = await hydrateRetryOutputs({
    run,
    graph,
    fullOrder,
  });
  const order = hydrated.order;

  await prisma.flowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date(), currentBlockId: order[0] },
  });
  await prisma.workerHeartbeat.upsert({
    where: { id: workerId },
    create: { id: workerId, busy: true, lastSeen: new Date(), metaJson: { workerId } },
    update: { busy: true, lastSeen: new Date(), metaJson: { workerId } },
  });

  const outputs = hydrated.outputs;
  const result: Record<string, unknown> = hydrated.result;

  try {
    for (const nodeId of order) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      const block = getBlock(node.type);
      await prisma.flowRun.update({
        where: { id: runId },
        data: { currentBlockId: nodeId },
      });
      const step = await prisma.runStep.create({
        data: {
          runId,
          blockId: nodeId,
          blockType: node.type,
          status: "RUNNING",
          startedAt: new Date(),
        },
      });

      try {
        const inputMap = inputsForNode(graph, nodeId, outputs);
        const output = await block.run(node.config, inputMap, {
          userId: run.userId,
          runId,
          optInAi: Boolean(node.config.aiOptIn),
          aiCreditCost: env.AI_CREDIT_COST,
          hasLlmKey: Boolean(userApiKey),
          callLlm: env.LLM_ENABLED
            ? (prompt, options) =>
                callLlm(prompt, {
                  apiKey: userApiKey ?? undefined,
                  json: options?.json,
                })
            : undefined,
        });
        outputs.set(nodeId, output);
        // Persist a compacted copy — keep full output in-memory for downstream blocks
        const persistOut = compactJsonValue(output) as Record<string, unknown>;
        // Keep last-wins keys for Results panel convenience, plus per-block map
        // so later steps don't erase earlier tables (stats/chart/structure).
        const byBlock =
          (result.byBlockId as Record<string, Record<string, unknown>> | undefined) ??
          {};
        byBlock[nodeId] = persistOut;
        result.byBlockId = byBlock;
        Object.assign(result, persistOut);
        const stepJson = toJsonValueSafe(persistOut, `step:${node.type}`);
        await prisma.runStep.update({
          where: { id: step.id },
          data: {
            status: "SUCCEEDED",
            outputJson: stepJson.value,
            finishedAt: new Date(),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Block failed";
        await prisma.runStep.update({
          where: { id: step.id },
          data: {
            status: "FAILED",
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
        await prisma.flowRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            failedBlockId: nodeId,
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
        void notifyRunOutcome({
          userId: run.userId,
          flowId: run.flowId,
          flowName: run.flow.name,
          runId,
          ok: false,
          errorMessage: message,
          failedBlockId: nodeId,
          graph,
        }).catch((err) => console.error("[mail] run failed", err));
        throw error;
      }
    }

    const resultJson = toJsonValueSafe(result, "run-result");
    await prisma.flowRun.update({
      where: { id: runId },
      data: {
        status: "SUCCEEDED",
        resultJson: resultJson.value,
        finishedAt: new Date(),
        currentBlockId: null,
        ...(resultJson.compacted
          ? {
              errorMessage: null,
            }
          : {}),
      },
    });
    void notifyRunOutcome({
      userId: run.userId,
      flowId: run.flowId,
      flowName: run.flow.name,
      runId,
      ok: true,
    }).catch((err) => console.error("[mail] run success", err));
  } finally {
    await prisma.workerHeartbeat.update({
      where: { id: workerId },
      data: { busy: false, lastSeen: new Date() },
    });
  }
}
