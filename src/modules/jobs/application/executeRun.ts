import { getBlock } from "@/modules/blocks/registry";
import type { FlowGraph } from "@/modules/blocks/domain/types";
import { getEnv } from "@/shared/config/env";
import { prisma } from "@/shared/lib/prisma";
import { toJsonValue } from "@/shared/lib/json";
import { callLlm } from "@/modules/ai/infrastructure/llmAdapter";
import { decryptSecret } from "@/modules/identity/domain/secretBox";
import { assertActiveAccess } from "@/modules/identity/application/accountAccess";
import { inputsForNode, topologicalOrder } from "../domain/dag";
import { graphForRun } from "../domain/runGraph";

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
  let order = topologicalOrder(graph);
  if (run.retryFromBlockId) {
    const idx = order.indexOf(run.retryFromBlockId);
    if (idx >= 0) order = order.slice(idx);
  }

  await prisma.flowRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date(), currentBlockId: order[0] },
  });
  await prisma.workerHeartbeat.upsert({
    where: { id: "default" },
    create: { id: "default", busy: true, lastSeen: new Date(), metaJson: { workerId } },
    update: { busy: true, lastSeen: new Date(), metaJson: { workerId } },
  });

  const outputs = new Map<string, Record<string, unknown>>();
  const result: Record<string, unknown> = {};

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
        // Keep last-wins keys for Results panel convenience, plus per-block map
        // so later steps don't erase earlier tables (stats/chart/structure).
        const byBlock =
          (result.byBlockId as Record<string, Record<string, unknown>> | undefined) ??
          {};
        byBlock[nodeId] = output;
        result.byBlockId = byBlock;
        Object.assign(result, output);
        await prisma.runStep.update({
          where: { id: step.id },
          data: {
            status: "SUCCEEDED",
            outputJson: toJsonValue(output),
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

    await prisma.flowRun.update({
      where: { id: runId },
      data: {
        status: "SUCCEEDED",
        resultJson: toJsonValue(result),
        finishedAt: new Date(),
        currentBlockId: null,
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
      where: { id: "default" },
      data: { busy: false, lastSeen: new Date() },
    });
  }
}
