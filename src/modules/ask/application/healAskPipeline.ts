import { prisma } from "@/shared/lib/prisma";
import { toJsonValueSafe } from "@/shared/lib/json";
import type { FlowGraph, TabularData } from "@/modules/blocks/domain/types";
import { blockLabel } from "@/modules/blocks/catalog";
import {
  extractIngestSeedFromGraph,
  getFlowForUser,
  materializeAutoPipelineGraph,
  planAutoPipeline,
  saveFlowGraph,
} from "@/modules/flows";
import { enqueueFlowRun } from "@/modules/jobs";
import {
  healHintFromFailure,
  maxHealAttempts,
} from "../domain/pipelineHeal";
import { loadUploadedTable } from "./loadUploadedTable";

const PLAN_SAMPLE_ROWS = 2_500;

function sampleTable(table: TabularData, maxRows: number): TabularData {
  if (table.rows.length <= maxRows) return table;
  return { columns: table.columns, rows: table.rows.slice(0, maxRows) };
}

function slimSeedTable(table: TabularData, totalRows: number): TabularData {
  return {
    columns: table.columns,
    rows: table.rows.slice(0, 40),
    ...({ _compacted: true, _rowCount: totalRows } as object),
  } as TabularData;
}

/**
 * After an Ask run fails, rebuild a safer pipeline and enqueue a new run.
 * Returns null when healing is not possible / already exhausted.
 */
export async function healAskPipeline(input: {
  userId: string;
  threadId: string;
  failedRunId: string;
  goal?: string;
}): Promise<{
  runId: string;
  flowId: string;
  steps: string[];
  reason: string;
} | null> {
  const run = await prisma.flowRun.findFirst({
    where: { id: input.failedRunId, userId: input.userId },
  });
  if (!run || run.status !== "FAILED") return null;

  const thread = await prisma.chatThread.findFirst({
    where: { id: input.threadId, userId: input.userId },
  });
  if (!thread?.flowId) return null;

  const recentMeta = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { metaJson: true },
  });
  const priorHeals = recentMeta.filter((m) => {
    const kind = (m.metaJson as { kind?: string } | null)?.kind;
    return kind === "auto_heal";
  }).length;
  if (priorHeals >= maxHealAttempts()) return null;

  // Don't heal the same failure twice
  const already = recentMeta.some((m) => {
    const meta = m.metaJson as { healedFromRunId?: string } | null;
    return meta?.healedFromRunId === input.failedRunId;
  });
  if (already) return null;

  const snap = run.graphSnapshotJson as FlowGraph | null;
  const flow = await getFlowForUser(thread.flowId, input.userId);
  const graph = (snap ?? (flow.graphJson as FlowGraph)) as FlowGraph;
  const failedNode = graph.nodes.find((n) => n.id === run.failedBlockId);
  const failedType = failedNode?.type ?? null;

  const hint = healHintFromFailure({
    errorMessage: run.errorMessage,
    failedBlockType: failedType,
    priorHealCount: priorHeals,
  });
  if (!hint) return null;

  let seed = extractIngestSeedFromGraph(graph);
  if (seed?.fileId && (!seed.table?.columns?.length || (seed.table.rows?.length ?? 0) <= 40)) {
    const loaded = await loadUploadedTable(input.userId, seed.fileId);
    if (loaded?.table?.columns?.length) {
      seed = {
        ...seed,
        fileName: loaded.fileName || seed.fileName,
        table: sampleTable(loaded.table, PLAN_SAMPLE_ROWS),
      };
      (seed.table as TabularData & { _rowCount?: number })._rowCount =
        loaded.table.rows.length;
    }
  }

  if (!seed?.table?.columns?.length && !seed?.fileId) return null;

  const goal =
    input.goal?.trim() ||
    (await latestUserGoal(thread.id)) ||
    "Analyse my data";

  const planTable = seed.table
    ? sampleTable(seed.table, PLAN_SAMPLE_ROWS)
    : undefined;

  const plan = planAutoPipeline({
    table: planTable,
    enableAi: !hint.disableAi,
    goal,
    priorSteps: graph.nodes.map((n) => n.type),
    heal: {
      disableForecast: hint.disableForecast,
      disableAi: hint.disableAi,
      disablePresentation: hint.disablePresentation,
    },
  });

  const totalRows =
    (seed.table as TabularData & { _rowCount?: number } | undefined)?._rowCount ??
    seed.table?.rows.length ??
    0;
  const graphSeed = {
    ...seed,
    table:
      seed.fileId && seed.table
        ? slimSeedTable(seed.table, totalRows || seed.table.rows.length)
        : seed.table,
  };

  const nextGraph = materializeAutoPipelineGraph(plan, graphSeed) as FlowGraph;

  if (hint.acknowledgePii) {
    for (const node of nextGraph.nodes) {
      if (node.type === "ingest.csv_excel") {
        node.config = { ...node.config, piiAcknowledged: true };
      }
    }
  }

  // Preserve Ask AI question context on AI nodes when kept
  for (const node of nextGraph.nodes) {
    if (node.type === "ai.analyse" || node.type === "ai.explain") {
      node.config = {
        ...node.config,
        userQuestion: goal.slice(0, 500),
        aiOptIn: true,
        followUp: true,
        contextMode: "meta",
        skipRawSample: true,
      };
    }
    if (node.type === "analyse.projection") {
      node.config = { ...node.config, goalPrompt: goal.slice(0, 500) };
    }
  }

  await saveFlowGraph(thread.flowId, input.userId, flow.name, nextGraph);
  const nextRun = await enqueueFlowRun({
    flowId: thread.flowId,
    userId: input.userId,
  });

  const steps = plan.steps.map((s) => s.type);
  const pipelineContext = steps.map((t) => blockLabel(t)).join(" → ");

  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: `Adjusting the pipeline and continuing…\n\n${plan.rationale}\n\nPipeline: ${pipelineContext}`,
      runId: nextRun.id,
      metaJson: toJsonValueSafe({
        kind: "auto_heal",
        healedFromRunId: input.failedRunId,
        reason: hint.reason,
        failedBlockType: failedType,
        plan: {
          archetype: plan.archetype,
          title: plan.title,
          steps,
        },
        steps,
        flowId: thread.flowId,
        flowName: flow.name,
        status: "QUEUED",
        attempt: priorHeals + 1,
      }).value,
    },
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });

  return {
    runId: nextRun.id,
    flowId: thread.flowId,
    steps,
    reason: hint.reason,
  };
}

async function latestUserGoal(threadId: string): Promise<string> {
  const msg = await prisma.chatMessage.findFirst({
    where: { threadId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });
  return msg?.content?.trim() || "";
}
