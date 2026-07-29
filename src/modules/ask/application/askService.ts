import { prisma } from "@/shared/lib/prisma";
import { AppError } from "@/shared/lib/errors";
import {
  compactJsonValue,
  isStackOverflowError,
  toJsonValueSafe,
} from "@/shared/lib/json";
import {
  normalizeChartSpec,
  type ChartSpec,
} from "@/modules/analyse/domain/charts";
import type { TabularData, FlowGraph } from "@/modules/blocks/domain/types";
import { blockLabel } from "@/modules/blocks/catalog";
import {
  createFlowWithGraph,
  extractIngestSeedFromGraph,
  getFlowForUser,
  graphStepTypes,
  buildValidatedAutoPipeline,
  saveFlowGraph,
  suggestFlowName,
  type IngestSeed,
} from "@/modules/flows";
import {
  sampleTable,
  stratifiedGraphSample,
} from "@/modules/flows/domain/sampleTable";
import { enqueueFlowRun } from "@/modules/jobs";
import {
  buildClarifyPayload,
  goalLooksComplete,
  mergeGoalWithAnswers,
  wantsSkipClarify,
} from "../domain/clarify";
import {
  buildDatasetMetaSummary,
  buildLlmContext,
  summarizeForStackRecovery,
} from "../domain/contextBudget";
import { healAskPipeline } from "./healAskPipeline";
import { loadUploadedTable } from "./loadUploadedTable";

function metaKind(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const kind = (meta as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : undefined;
}

function findStoredDatasetMeta(
  messages: { metaJson: unknown }[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = messages[i]?.metaJson as { datasetMeta?: string } | null;
    if (typeof meta?.datasetMeta === "string" && meta.datasetMeta.trim()) {
      return meta.datasetMeta.trim();
    }
  }
  return null;
}

const PLAN_SAMPLE_ROWS = 2_500;
const GRAPH_SAMPLE_ROWS = 40;

function slimIngestSeed(seed: IngestSeed): IngestSeed {
  const table = seed.table;
  if (!table?.columns?.length) return seed;
  const total =
    (table as TabularData & { _rowCount?: number })._rowCount ??
    table.rows.length;
  const sampled = stratifiedGraphSample(table, GRAPH_SAMPLE_ROWS);
  // Keep fileId + small sample in the graph; ingest reloads full file at run time
  return {
    ...seed,
    table: {
      columns: sampled.columns,
      rows: sampled.rows,
      _compacted: true,
      _rowCount: total,
    } as TabularData & { _compacted: boolean; _rowCount: number },
  };
}

type AskTablePreview = {
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  fileName?: string;
};


function extractAskArtifacts(resultJson: unknown): {
  content: string;
  charts: ChartSpec[];
  tablePreview: AskTablePreview | null;
  exports: { csv: boolean; presentation: boolean };
  steps: string[];
  forecastTrust?: Record<string, unknown>;
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
  const tableCandidates: { table: TabularData; score: number }[] = [];
  let hasPresentation = false;
  const steps: string[] = [];
  let forecastTrust: Record<string, unknown> | undefined;

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
      const projection = out.projection as Record<string, unknown> | undefined;
      if (projection?.diagnostics || projection?.leaderboard) {
        forecastTrust = {
          method: projection.method,
          recommendedMethod: projection.recommendedMethod,
          selectedModelReason: projection.selectedModelReason,
          diagnostics: projection.diagnostics,
          leaderboard: projection.leaderboard,
          backtest: projection.backtest,
          intervalMethod: projection.intervalMethod,
          scenarios: projection.scenarios,
        };
      }
      {
        const chart = normalizeChartSpec(out.chart);
        if (chart) collectedCharts.push(chart);
      }
      const t = out.table as TabularData | undefined;
      if (t?.columns?.length && t.rows) {
        const looksLikeForecast =
          t.columns.includes("series") || t.columns.includes("forecast");
        const contract = out.contract as
          | {
              kind?: string;
              transformations?: unknown[];
              grain?: string;
            }
          | undefined;
        const isAiFindings = Boolean(out.insightReport);
        tableCandidates.push({
          table: t,
          score:
            (looksLikeForecast ? 60 : 0) +
            (Array.isArray(contract?.transformations) ? 40 : 0) +
            (contract?.kind === "table" ? 30 : 0) +
            (contract?.grain ? 15 : 0) +
            (isAiFindings ? -80 : 10) +
            tableCandidates.length,
        });
      }
      if (out.presentation) hasPresentation = true;
    }
  }

  {
    const chart = normalizeChartSpec(r.chart);
    if (chart) collectedCharts.push(chart);
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
    if (top?.columns?.length) {
      tableCandidates.push({ table: top, score: 0 });
    }
  }
  table = tableCandidates.sort((a, b) => b.score - a.score)[0]?.table ?? null;
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
      // Deck can always be built from run results (not only when a presentation block ran)
      presentation:
        hasPresentation || Boolean(charts.length || parts.length || table),
    },
    steps,
    forecastTrust,
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
  excelSheet?: string | null;
  excelRange?: string | null;
  piiFindings?: unknown[];
  piiAcknowledged?: boolean;
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
          ? toJsonValueSafe({
              fileId: input.fileId,
              fileName: input.fileName,
              excelSheet: input.excelSheet,
              excelRange: input.excelRange,
              piiFindings: input.piiFindings,
              piiAcknowledged: input.piiAcknowledged,
            }).value
          : undefined,
    },
  });

  const recentFull = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    take: 24,
    select: { role: true, content: true, metaJson: true },
  });

  const lastClarify = [...recentFull]
    .reverse()
    .find((m) => {
      const meta = m.metaJson as { kind?: string } | null;
      return m.role === "assistant" && meta?.kind === "clarify";
    });
  const clarifyMeta = lastClarify?.metaJson as
    | {
        kind?: string;
        pendingSeed?: IngestSeed;
        suggestedGoal?: string;
        originalGoal?: string;
      }
    | undefined;
  const answeringClarify = Boolean(clarifyMeta?.kind === "clarify");

  let priorSteps: string[] = [];
  let seed: IngestSeed = {
    fileId: input.fileId,
    fileName: input.fileName,
    table: input.table,
    excelSheet: input.excelSheet ?? null,
    excelRange: input.excelRange ?? undefined,
    piiFindings: input.piiFindings,
    piiAcknowledged: input.piiAcknowledged,
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
          excelSheet: input.excelSheet ?? fromGraph.excelSheet,
          excelRange: input.excelRange ?? fromGraph.excelRange,
          piiFindings: input.piiFindings ?? fromGraph.piiFindings,
          piiAcknowledged: input.piiAcknowledged ?? fromGraph.piiAcknowledged,
        };
      }
    }
  }

  if (!seed.fileId && clarifyMeta?.pendingSeed?.fileId) {
    seed = {
      ...clarifyMeta.pendingSeed,
      table: seed.table ?? clarifyMeta.pendingSeed.table,
    };
  }

  // Restore upload from clarify fileId (never rehydrate huge tables from chat meta)
  const restoreFileId = seed.fileId || clarifyMeta?.pendingSeed?.fileId;
  const tableLooksSample =
    Boolean(seed.table?.columns?.length) &&
    Boolean(seed.fileId) &&
    (seed.table?.rows.length ?? 0) <= GRAPH_SAMPLE_ROWS;
  if (
    restoreFileId &&
    (!seed.table?.columns?.length || tableLooksSample || input.forceBuild)
  ) {
    const loaded = await loadUploadedTable(input.userId, restoreFileId, {
      sheet: seed.excelSheet,
      range: seed.excelRange,
    });
    if (loaded) {
      seed = {
        fileId: restoreFileId,
        fileName:
          loaded.fileName ||
          seed.fileName ||
          clarifyMeta?.pendingSeed?.fileName,
        datasetName:
          seed.datasetName || clarifyMeta?.pendingSeed?.datasetName,
        excelSheet: seed.excelSheet ?? null,
        excelRange: seed.excelRange,
        piiFindings: seed.piiFindings,
        piiAcknowledged: seed.piiAcknowledged,
        // Keep a sample in memory for Ask; worker reloads full file via fileId
        table: sampleTable(loaded.table, PLAN_SAMPLE_ROWS),
      };
      // Preserve true size on the slim marker used when materializing the graph
      (seed.table as TabularData & { _rowCount?: number })._rowCount =
        loaded.table.rows.length;
    }
  }

  const effectiveGoal = answeringClarify
    ? mergeGoalWithAnswers(
        clarifyMeta?.originalGoal || "",
        question,
        clarifyMeta?.suggestedGoal,
      )
    : question;

  const trueRowCount =
    (seed.table as TabularData & { _rowCount?: number } | undefined)?._rowCount ??
    seed.table?.rows.length;
  let datasetMeta =
    findStoredDatasetMeta(recentFull) ||
    (seed.table?.columns?.length
      ? buildDatasetMetaSummary(sampleTable(seed.table, PLAN_SAMPLE_ROWS), {
          fileName: seed.fileName,
          totalRowCount: trueRowCount,
          goal: effectiveGoal,
        })
      : "");

  // Compact digest + durable metadata — never replay full attachment history to the LLM
  const conversationContext = buildLlmContext({
    turns: recentFull.map((m) => ({
      role: m.role,
      content: m.content,
      meta: { kind: metaKind(m.metaJson) },
    })),
    datasetMeta,
    followUp: isUpdate,
  });

  // First pass with data: ask questions — client only builds on explicit Go ahead
  const shouldClarify =
    !input.forceBuild &&
    !isUpdate &&
    !answeringClarify &&
    Boolean(seed.table?.columns?.length) &&
    !wantsSkipClarify(question) &&
    !goalLooksComplete(question, seed.table);

  if (shouldClarify && seed.table) {
    if (!seed.fileId) {
      throw new AppError(
        "Attach the file again so we can build after your answers.",
        "NEED_FILE",
        400,
      );
    }
    try {
      const trueRows =
        (seed.table as TabularData & { _rowCount?: number })._rowCount ??
        seed.table.rows.length;
      const clarify = buildClarifyPayload(
        sampleTable(seed.table, PLAN_SAMPLE_ROWS),
        question,
        seed.fileName,
        trueRows,
      );
      datasetMeta =
        datasetMeta ||
        buildDatasetMetaSummary(sampleTable(seed.table, PLAN_SAMPLE_ROWS), {
          fileName: seed.fileName,
          totalRowCount: trueRows,
          goal: question,
        });
      const content = [
        "I scanned your file and tailored a few questions from your goal — answer each, then click **Go ahead** to build.",
        "",
        clarify.datasetBrief,
        "",
        "_Answers stay in the boxes until you confirm — nothing runs until Go ahead._",
      ].join("\n");

      await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content,
          metaJson: toJsonValueSafe({
            kind: "clarify",
            datasetBrief: clarify.datasetBrief,
            datasetMeta,
            questions: clarify.questions,
            suggestedGoal: clarify.suggestedGoal,
            originalGoal: question,
            // Lightweight only — reload table from storage on Go ahead
            pendingSeed: {
              fileId: seed.fileId,
              fileName: seed.fileName,
              datasetName: seed.datasetName,
              excelSheet: seed.excelSheet,
              excelRange: seed.excelRange,
              piiFindings: seed.piiFindings,
              piiAcknowledged: seed.piiAcknowledged,
            },
          }).value,
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
    } catch (error) {
      // Silent fallback: skip clarify UI and continue into pipeline build
      if (!isStackOverflowError(error)) throw error;
    }
  }

  // Clarify answers without Go ahead must not accidentally build
  if (answeringClarify && !input.forceBuild && !wantsSkipClarify(question)) {
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content:
          "Got it — I’ve noted that. Finish the other answers, then click **Go ahead** to build the pipeline.",
        metaJson: toJsonValueSafe({
          kind: "clarify_ack",
          pendingSeed: clarifyMeta?.pendingSeed,
          suggestedGoal: clarifyMeta?.suggestedGoal,
          originalGoal: clarifyMeta?.originalGoal,
          datasetMeta:
            (clarifyMeta as { datasetMeta?: string } | undefined)?.datasetMeta ||
            datasetMeta,
        }).value,
      },
    });
    return {
      threadId: thread.id,
      phase: "clarify" as const,
      flowId: null,
      flowName: null,
      runId: null,
      steps: [] as string[],
      questions: [],
    };
  }

  const buildOnce = async (opts: {
    seed: IngestSeed;
    context: string;
    recovered: boolean;
  }) => {
    let planSource = opts.seed.table;
    // Prefer file reload only to ensure we have columns; never plan on 100k+ rows in Ask
    if (
      (!planSource?.columns?.length ||
        (planSource as { _compacted?: boolean })._compacted) &&
      opts.seed.fileId
    ) {
      const loaded = await loadUploadedTable(input.userId, opts.seed.fileId);
      if (loaded?.table?.columns?.length) planSource = loaded.table;
    }
    const planTable = planSource
      ? sampleTable(planSource, PLAN_SAMPLE_ROWS)
      : undefined;

    // Always persist a slim graph when fileId can reload the full file at run
    const graphSeed =
      opts.seed.fileId && opts.seed.table
        ? slimIngestSeed({
            ...opts.seed,
            table: planSource ?? opts.seed.table,
          })
        : opts.seed.table
          ? {
              ...opts.seed,
              table: stratifiedGraphSample(opts.seed.table, GRAPH_SAMPLE_ROWS),
            }
          : opts.seed;

    const built = buildValidatedAutoPipeline({
      table: planTable,
      rawText: planTable ? undefined : effectiveGoal,
      enableAi: input.enableAi !== false,
      goal: effectiveGoal,
      priorSteps: isUpdate ? priorSteps : undefined,
      seed: graphSeed,
    });
    const plan = built.plan;
    const graph = built.graph as FlowGraph;
    const stepTypes = plan.steps.map((s) => s.type);
    const pipelineContext = stepTypes.map((t) => blockLabel(t)).join(" → ");

    // Refresh meta from the planning sample when missing
    if (!datasetMeta && planTable?.columns?.length) {
      datasetMeta = buildDatasetMetaSummary(planTable, {
        fileName: opts.seed.fileName,
        totalRowCount:
          (opts.seed.table as TabularData & { _rowCount?: number } | undefined)
            ?._rowCount ?? planTable.rows.length,
        goal: effectiveGoal,
      });
    }

    for (const node of graph.nodes) {
      if (node.type === "ai.analyse" || node.type === "ai.explain") {
        node.config = {
          ...node.config,
          userQuestion: effectiveGoal.slice(0, 500),
          conversationContext: opts.context,
          datasetMeta,
          // First build may include a tiny sample; follow-ups are metadata-only
          followUp: isUpdate || opts.recovered,
          contextMode: isUpdate || opts.recovered ? "meta" : "full",
          skipRawSample: isUpdate || opts.recovered,
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
          goalPrompt: effectiveGoal.slice(0, 500),
        };
      }
      // Never leave accidental full dumps on non-ingest nodes
      if (node.type !== "ingest.csv_excel" && node.config.table) {
        node.config.table = compactJsonValue(node.config.table, {
          maxTableRows: 40,
        });
      }
    }

    let nextFlowId = flowId;
    let nextFlowName = flowName;
    if (!nextFlowId) {
      const flow = await createFlowWithGraph(
        input.userId,
        suggestFlowName(plan, opts.seed.fileName) ||
          effectiveGoal.slice(0, 60),
        graph,
      );
      nextFlowId = flow.id;
      nextFlowName = flow.name;
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          flowId: nextFlowId,
          title:
            thread.title === "New chat"
              ? effectiveGoal.slice(0, 80)
              : thread.title,
        },
      });
    } else {
      await saveFlowGraph(
        nextFlowId,
        input.userId,
        nextFlowName || plan.title,
        graph,
      );
    }

    const run = await enqueueFlowRun({
      flowId: nextFlowId,
      userId: input.userId,
    });

    const progressIntro = isUpdate
      ? `Updating **${nextFlowName || plan.title}** from your latest request and re-running…`
      : `Building **${plan.title}** and running it…`;

    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: `${progressIntro}\n\n${plan.rationale}\n\nPipeline: ${pipelineContext}`,
        runId: run.id,
        metaJson: toJsonValueSafe({
          kind: "run_progress",
          plan: {
            archetype: plan.archetype,
            title: plan.title,
            steps: stepTypes,
          },
          steps: stepTypes,
          flowId: nextFlowId,
          flowName: nextFlowName || plan.title,
          status: "QUEUED",
          updating: isUpdate,
          datasetMeta,
        }).value,
      },
    });

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    return {
      threadId: thread.id,
      phase: "running" as const,
      flowId: nextFlowId,
      flowName: nextFlowName,
      runId: run.id,
      steps: stepTypes,
    };
  };

  try {
    return await buildOnce({
      seed,
      context: conversationContext,
      recovered: false,
    });
  } catch (error) {
    const recoverable =
      isStackOverflowError(error) ||
      (error instanceof Error &&
        /stack|too large|payload|JSON|serialize/i.test(error.message));
    if (!recoverable) throw error;

    console.error("[ask] build failed, retrying with slim seed", error);

    // Silent backup: summarise for LLM/pipeline only — never show that text in chat
    const recoveryContext = summarizeForStackRecovery(
      recentFull.map((m) => ({
        role: m.role,
        content: m.content,
        meta: { kind: metaKind(m.metaJson) },
      })),
      {
        goal: effectiveGoal,
        fileName: seed.fileName,
        datasetMeta,
      },
    );

    try {
      // Continue automatically into the normal build path (same UX as a clean run)
      return await buildOnce({
        seed: slimIngestSeed(seed),
        context: recoveryContext,
        recovered: true,
      });
    } catch (retryError) {
      console.error("[ask] slim retry failed", retryError);
      throw retryError instanceof Error
        ? retryError
        : new AppError("Could not build the pipeline", "ASK_BUILD_FAILED", 500);
    }
  }
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
  let flowGraph: FlowGraph | null = null;
  if (thread.flowId) {
    const f = await prisma.flow.findFirst({
      where: { id: thread.flowId, userId },
      select: { name: true, graphJson: true },
    });
    flowName = f?.name ?? null;
    flowGraph = (f?.graphJson as FlowGraph | null) ?? null;
    if (flowGraph?.nodes?.length) {
      pipelineSteps = flowGraph.nodes.map((n) => n.type);
    }
  }

  if (run.status === "QUEUED" || run.status === "RUNNING") {
    const snap = (run.graphSnapshotJson as FlowGraph | null) ?? flowGraph;
    if (snap?.nodes?.length) {
      pipelineSteps = snap.nodes.map((n) => n.type);
    }
    const node = snap?.nodes?.find((n) => n.id === run.currentBlockId);
    return {
      status: run.status,
      pending: true as const,
      flowId: thread.flowId,
      flowName,
      steps: pipelineSteps,
      currentBlockId: run.currentBlockId,
      currentStepType: node?.type ?? null,
    };
  }

  // Auto-correct failed Ask pipelines and continue without surfacing a hard stop
  if (run.status === "FAILED") {
    try {
      const healed = await healAskPipeline({
        userId,
        threadId,
        failedRunId: runId,
      });
      if (healed) {
        return {
          status: "QUEUED" as const,
          pending: true as const,
          healed: true as const,
          runId: healed.runId,
          flowId: healed.flowId,
          flowName,
          steps: healed.steps,
          currentStepType: healed.steps[0] ?? null,
          healReason: healed.reason,
        };
      }
    } catch (error) {
      console.error("[ask] auto-heal failed", error);
    }
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
      // Allow a failed-run notice even if an auto_heal message exists for another run
    },
  });
  if (!already) {
    const prior = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: { metaJson: true },
    });
    const datasetMeta = findStoredDatasetMeta(prior);
    // Cap chart geometry so Prisma JSON never recursive-blows on huge point arrays
    const charts = artifacts.charts
      .map((c) =>
        normalizeChartSpec({
          ...c,
          points: Array.isArray(c.points) ? c.points.slice(0, 48) : [],
          insights: c.insights,
        }),
      )
      .filter((c): c is ChartSpec => Boolean(c));
    const metaJson = toJsonValueSafe(
      {
        kind: "run_result",
        flowId: thread.flowId,
        flowName,
        status: run.status,
        openBuilder: Boolean(thread.flowId),
        steps: Array.isArray(pipelineSteps)
          ? pipelineSteps
          : Array.isArray(artifacts.steps)
            ? artifacts.steps
            : [],
        charts,
        tablePreview: artifacts.tablePreview
          ? compactJsonValue(artifacts.tablePreview, { maxTableRows: 24 })
          : null,
        exports: artifacts.exports,
        forecastTrust: artifacts.forecastTrust,
        datasetMeta: datasetMeta || undefined,
      },
      "ask-run-result",
    ).value;
    await prisma.chatMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: artifacts.content.slice(0, 6000),
        runId,
        metaJson,
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
