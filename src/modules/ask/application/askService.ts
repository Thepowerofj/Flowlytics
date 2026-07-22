import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import { toJsonValue } from "@/shared/lib/json";
import type { ChartSpec } from "@/modules/analyse/domain/charts";
import type { TabularData, FlowGraph } from "@/modules/blocks/domain/types";
import { blockLabel } from "@/modules/blocks/catalog";
import {
  createFlowWithGraph,
  extractIngestSeedFromGraph,
  getFlowForUser,
  graphStepTypes,
  materializeAutoPipelineGraph,
  planAutoPipeline,
  saveFlowGraph,
  suggestFlowName,
  type IngestSeed,
} from "@/modules/flows";
import { enqueueFlowRun } from "@/modules/jobs";
import {
  buildClarifyPayload,
  goalLooksComplete,
  mergeGoalWithAnswers,
  wantsSkipClarify,
} from "../domain/clarify";

type AskTablePreview = {
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  fileName?: string;
};

function isChartSpec(value: unknown): value is ChartSpec {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.type === "string" &&
    typeof c.title === "string" &&
    Array.isArray(c.points)
  );
}

function extractAskArtifacts(resultJson: unknown): {
  content: string;
  charts: ChartSpec[];
  tablePreview: AskTablePreview | null;
  exports: { csv: boolean; presentation: boolean };
  steps: string[];
} {
  if (!resultJson || typeof resultJson !== "object") {
    return {
      content: "Run finished. Open the Builder to inspect full results.",
      charts: [],
      tablePreview: null,
      exports: { csv: false, presentation: false },
      steps: [],
    };
  }
  const r = resultJson as Record<string, unknown>;
  const parts: string[] = [];
  const charts: ChartSpec[] = [];
  let table: TabularData | null = null;
  let hasPresentation = false;
  const steps: string[] = [];

  if (typeof r.explanation === "string" && r.explanation.trim()) {
    parts.push(r.explanation.trim().slice(0, 1600));
  }

  const collectedCharts: ChartSpec[] = [];
  const byBlock = r.byBlockId as Record<string, Record<string, unknown>> | undefined;
  if (byBlock) {
    for (const [blockId, out] of Object.entries(byBlock)) {
      steps.push(blockId);
      const report = out.insightReport as
        | { headline?: string; summary?: string; findings?: { title?: string; detail?: string }[] }
        | undefined;
      if (report?.headline) {
        parts.push(`**${report.headline}**\n\n${report.summary ?? ""}`);
        if (Array.isArray(report.findings)) {
          for (const f of report.findings.slice(0, 4)) {
            if (f?.title) {
              parts.push(`• **${f.title}**${f.detail ? ` — ${f.detail}` : ""}`);
            }
          }
        }
      } else if (typeof out.explanation === "string" && out.explanation.trim()) {
        parts.push(out.explanation.trim().slice(0, 700));
      }
      if (isChartSpec(out.chart)) {
        collectedCharts.push(out.chart);
      }
      // Prefer projection/history tables over AI insight tables for CSV preview
      const t = out.table as TabularData | undefined;
      if (t?.columns?.length && t.rows) {
        const looksLikeForecast =
          t.columns.includes("series") || t.columns.includes("forecast");
        if (!table || looksLikeForecast) table = t;
      }
      if (out.presentation) hasPresentation = true;
    }
  }

  if (isChartSpec(r.chart)) {
    collectedCharts.push(r.chart);
  }

  // Prefer forecast charts (orange series) so Ask shows the outlook, not only history bars
  collectedCharts.sort((a, b) => {
    const score = (c: ChartSpec) =>
      (c.forecastSplit ? 10 : 0) +
      (c.points?.some((p) => p.series === "Forecast") ? 10 : 0) +
      (/forecast/i.test(c.title) ? 5 : 0);
    return score(b) - score(a);
  });
  charts.push(...collectedCharts.slice(0, 3));
  if (!table) {
    const top = r.table as TabularData | undefined;
    if (top?.columns?.length) table = top;
  }
  if (r.presentation) hasPresentation = true;

  if (!parts.length) {
    parts.push(
      charts.length || table
        ? "Pipeline completed. Results are shown below."
        : "Pipeline completed. Open the Builder for full results.",
    );
  }

  const tablePreview: AskTablePreview | null = table
    ? {
        columns: table.columns.slice(0, 12),
        rows: table.rows.slice(0, 6).map((row) => {
          const next: Record<string, string | number | null> = {};
          for (const c of table!.columns.slice(0, 12)) next[c] = row[c] ?? null;
          return next;
        }),
        rowCount: table.rows.length,
        fileName: "flowlytics-export.csv",
      }
    : null;

  return {
    content: parts.slice(0, 8).join("\n\n"),
    charts,
    tablePreview,
    exports: {
      csv: Boolean(table),
      presentation: hasPresentation,
    },
    steps,
  };
}

export async function listAskThreads(userId: string) {
  return prisma.chatThread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      title: true,
      flowId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

export async function getAskThread(userId: string, threadId: string) {
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  });
  if (!thread) throw new AppError("Thread not found", "NOT_FOUND", 404);

  let flow: { id: string; name: string } | null = null;
  let pipelineSteps: string[] = [];
  if (thread.flowId) {
    const f = await prisma.flow.findFirst({
      where: { id: thread.flowId, userId },
      select: { id: true, name: true, graphJson: true },
    });
    if (f) {
      flow = { id: f.id, name: f.name };
      const graph = f.graphJson as FlowGraph | null;
      if (graph?.nodes?.length) {
        pipelineSteps = graph.nodes.map((n) => n.type);
      }
    }
  }

  return {
    id: thread.id,
    title: thread.title,
    flowId: thread.flowId,
    flow,
    pipelineSteps,
    messages: thread.messages,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };
}

export async function createAskThread(userId: string, title?: string) {
  return prisma.chatThread.create({
    data: {
      userId,
      title: title?.trim() || "New chat",
    },
  });
}

export async function askTurn(input: {
  userId: string;
  threadId: string;
  message: string;
  table?: TabularData;
  fileId?: string;
  fileName?: string;
  enableAi?: boolean;
  /** Skip clarify and build immediately */
  forceBuild?: boolean;
}) {
  const thread = await prisma.chatThread.findFirst({
    where: { id: input.threadId, userId: input.userId },
  });
  if (!thread) throw new AppError("Thread not found", "NOT_FOUND", 404);

  const question = input.message.trim();
  if (!question) throw new AppError("Message required", "BAD_REQUEST", 400);

  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      content: question,
      metaJson:
        input.fileId || input.fileName
          ? toJsonValue({
              fileId: input.fileId,
              fileName: input.fileName,
            })
          : undefined,
    },
  });

  const recentFull = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    take: 24,
    select: { role: true, content: true, metaJson: true },
  });
  const conversationContext = recentFull
    .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
    .join("\n")
    .slice(0, 2000);

  const lastClarify = [...recentFull]
    .reverse()
    .find((m) => {
      const meta = m.metaJson as { kind?: string } | null;
      return m.role === "assistant" && meta?.kind === "clarify";
    });
  const clarifyMeta = lastClarify?.metaJson as
    | {
        kind?: string;
        pendingSeed?: IngestSeed & { table?: TabularData };
        suggestedGoal?: string;
        originalGoal?: string;
      }
    | undefined;
  const answeringClarify = Boolean(
    clarifyMeta?.kind === "clarify" && clarifyMeta.pendingSeed?.table?.columns?.length,
  );

  let priorSteps: string[] = [];
  let seed: IngestSeed = {
    fileId: input.fileId,
    fileName: input.fileName,
    table: input.table,
    datasetName: input.fileName
      ? input.fileName.replace(/\.[^.]+$/, "")
      : undefined,
  };
  let isUpdate = false;
  let flowId = thread.flowId;
  let flowName = "";

  if (flowId) {
    const existing = await getFlowForUser(flowId, input.userId);
    flowName = existing.name;
    const priorGraph = existing.graphJson as FlowGraph;
    priorSteps = graphStepTypes(priorGraph);
    isUpdate = true;
    if (!seed.table?.columns?.length) {
      const fromGraph = extractIngestSeedFromGraph(priorGraph);
      if (fromGraph) {
        seed = {
          ...fromGraph,
          fileId: input.fileId || fromGraph.fileId,
          fileName: input.fileName || fromGraph.fileName,
        };
      }
    }
  }

  // Restore pending upload from the clarify turn when the user answers
  if (!seed.table?.columns?.length && clarifyMeta?.pendingSeed?.table?.columns?.length) {
    seed = {
      ...clarifyMeta.pendingSeed,
      fileId: input.fileId || clarifyMeta.pendingSeed.fileId,
      fileName: input.fileName || clarifyMeta.pendingSeed.fileName,
    };
  }

  const effectiveGoal = answeringClarify
    ? mergeGoalWithAnswers(
        clarifyMeta?.originalGoal || "",
        question,
        clarifyMeta?.suggestedGoal,
      )
    : question;

  // First pass with data: ask a few sharp questions before building (unless skipped)
  const shouldClarify =
    !input.forceBuild &&
    !isUpdate &&
    !answeringClarify &&
    Boolean(seed.table?.columns?.length) &&
    !wantsSkipClarify(question) &&
    !goalLooksComplete(question, seed.table);

  if (shouldClarify && seed.table) {
    const clarify = buildClarifyPayload(
      seed.table,
      question,
      seed.fileName,
    );
    // Compact table kept for the answer turn (rows capped for meta size)
    const pendingTable: TabularData = {
      columns: seed.table.columns,
      rows: seed.table.rows.slice(0, 5000),
    };
    const content = [
      "I scanned your file — a few quick choices will make the pipeline sharper.",
      "",
      clarify.datasetBrief,
      "",
      ...clarify.questions.map(
        (q, i) => `**${i + 1}. ${q.prompt}**\n${q.suggestions.map((s) => `• ${s}`).join("\n")}`,
      ),
      "",
      "_Reply with your picks (or tap a suggestion), or say **go ahead** to build with my defaults._",
    ].join("\n");

    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content,
        metaJson: toJsonValue({
          kind: "clarify",
          datasetBrief: clarify.datasetBrief,
          questions: clarify.questions,
          suggestedGoal: clarify.suggestedGoal,
          originalGoal: question,
          pendingSeed: {
            fileId: seed.fileId,
            fileName: seed.fileName,
            datasetName: seed.datasetName,
            table: pendingTable,
          },
        }),
      },
    });
    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        updatedAt: new Date(),
        title:
          thread.title === "New chat" ? question.slice(0, 80) : thread.title,
      },
    });
    return {
      threadId: thread.id,
      phase: "clarify" as const,
      flowId: null,
      flowName: null,
      runId: null,
      steps: [] as string[],
      questions: clarify.questions,
    };
  }

  const plan = planAutoPipeline({
    table: seed.table,
    rawText: seed.table ? undefined : effectiveGoal,
    enableAi: input.enableAi !== false,
    goal: effectiveGoal,
    priorSteps: isUpdate ? priorSteps : undefined,
  });

  const graph = materializeAutoPipelineGraph(plan, seed) as FlowGraph;
  const stepTypes = plan.steps.map((s) => s.type);
  const pipelineContext = stepTypes.map((t) => blockLabel(t)).join(" → ");

  for (const node of graph.nodes) {
    if (node.type === "ai.analyse" || node.type === "ai.explain") {
      node.config = {
        ...node.config,
        userQuestion: effectiveGoal,
        conversationContext,
        pipelineContext: isUpdate
          ? `Updating existing pipeline (${flowName || plan.title}): ${pipelineContext}`
          : `New pipeline: ${pipelineContext}`,
        answerStyle: "exec",
        aiOptIn: true,
      };
    }
    if (node.type === "analyse.projection") {
      node.config = {
        ...node.config,
        goalPrompt: effectiveGoal,
      };
    }
  }

  if (!flowId) {
    const flow = await createFlowWithGraph(
      input.userId,
      suggestFlowName(plan, seed.fileName) || effectiveGoal.slice(0, 60),
      graph,
    );
    flowId = flow.id;
    flowName = flow.name;
    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        flowId,
        title:
          thread.title === "New chat"
            ? effectiveGoal.slice(0, 80)
            : thread.title,
      },
    });
  } else {
    await saveFlowGraph(flowId, input.userId, flowName || plan.title, graph);
  }

  const run = await enqueueFlowRun({ flowId, userId: input.userId });

  const progressIntro = isUpdate
    ? `Updating **${flowName || plan.title}** from your latest request and re-running…`
    : `Building **${plan.title}** and running it…`;

  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      content: `${progressIntro}\n\n${plan.rationale}\n\nPipeline: ${pipelineContext}`,
      runId: run.id,
      metaJson: toJsonValue({
        kind: "run_progress",
        plan: {
          archetype: plan.archetype,
          title: plan.title,
          steps: stepTypes,
        },
        steps: stepTypes,
        flowId,
        flowName: flowName || plan.title,
        status: "QUEUED",
        updating: isUpdate,
      }),
    },
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });

  return {
    threadId: thread.id,
    phase: "running" as const,
    flowId,
    flowName,
    runId: run.id,
    steps: stepTypes,
  };
}

export async function completeAskRun(
  userId: string,
  threadId: string,
  runId: string,
) {
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, userId },
  });
  if (!thread) throw new AppError("Thread not found", "NOT_FOUND", 404);

  const run = await prisma.flowRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) throw new AppError("Run not found", "NOT_FOUND", 404);

  let flowName: string | null = null;
  let pipelineSteps: string[] = [];
  if (thread.flowId) {
    const f = await prisma.flow.findFirst({
      where: { id: thread.flowId, userId },
      select: { name: true, graphJson: true },
    });
    flowName = f?.name ?? null;
    const graph = f?.graphJson as FlowGraph | null;
    if (graph?.nodes?.length) {
      pipelineSteps = graph.nodes.map((n) => n.type);
    }
  }

  if (run.status === "QUEUED" || run.status === "RUNNING") {
    return {
      status: run.status,
      pending: true as const,
      flowId: thread.flowId,
      flowName,
      steps: pipelineSteps,
    };
  }

  const artifacts =
    run.status === "SUCCEEDED"
      ? extractAskArtifacts(run.resultJson)
      : {
          content: `Run ${run.status.toLowerCase()}${
            run.errorMessage ? `: ${run.errorMessage}` : ""
          }`,
          charts: [] as ChartSpec[],
          tablePreview: null as AskTablePreview | null,
          exports: { csv: false, presentation: false },
          steps: pipelineSteps,
        };

  const already = await prisma.chatMessage.findFirst({
    where: {
      threadId,
      runId,
      role: "assistant",
      NOT: { content: { startsWith: "Building " } },
    },
  });
  if (!already) {
    await prisma.chatMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: artifacts.content,
        runId,
        metaJson: toJsonValue({
          kind: "run_result",
          flowId: thread.flowId,
          flowName,
          status: run.status,
          openBuilder: Boolean(thread.flowId),
          steps: pipelineSteps.length ? pipelineSteps : artifacts.steps,
          charts: artifacts.charts,
          tablePreview: artifacts.tablePreview,
          exports: artifacts.exports,
        }),
      },
    });
  }

  return {
    status: run.status,
    pending: false as const,
    content: artifacts.content,
    flowId: thread.flowId,
    flowName,
    steps: pipelineSteps,
  };
}
