"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlowGraph, TabularData } from "@/modules/blocks/domain/types";
import {
  materializeAutoPipelineGraph,
  planAutoPipeline,
} from "@/modules/flows/domain/autoPipeline";
import { alignFlowGraph } from "@/modules/flows/domain/flowLayout";
import { ActivityConfigWindow } from "./ActivityConfigWindow";
import { ActivityNode } from "./ActivityNode";
import { ActivityPalette } from "./ActivityPalette";
import type { QuickRecipe } from "./activityMeta";
import { normalizeInsightReport } from "@/modules/ai/domain/insightReport";
import type { InsightReport } from "@/modules/ai/domain/insightReport";
import { AiInsightShowcase } from "./AiInsightShowcase";
import { InsightCard } from "./InsightCard";
import { MiniChart } from "./MiniChart";
import {
  autoMapOnConnect,
  bindConfigToUpstream,
  propagatePreviewFrom,
  suggestNextAfter,
} from "./autoMap";
import {
  applyRunOutputsToNodes,
  mergeRunOutputIntoConfig,
  stepOutputsByBlockId,
} from "./applyRunOutputs";
import { patchAffectsPreviewOutput } from "./previewPipeline";
import { checkFlow, issueCounts } from "./flowChecks";
import { flowGraphToRf, rfToFlowGraph } from "./graphConvert";
import { portsFor } from "./ports";
import type { ActivityNodeData, BlockSummary, RunState } from "./types";
import type { ChartSpec } from "@/modules/analyse/domain/charts";
import { formatDateTime } from "@/shared/lib/formatUi";
import { downloadTableCsv } from "./downloadCsv";
import { RunHistory, type RunHistoryItem } from "./RunHistory";
import {
  listAncestorSources,
  rewireInboundSource,
} from "./upstreamSources";
import {
  formatDurationMs,
  runDurationMs,
} from "@/modules/jobs/domain/runTiming";
import { isFlowGraph } from "@/modules/jobs/domain/runGraph";
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  fileTooLargeMessage,
} from "@/modules/ingest";
import { ScheduleEarlyAccessNotice } from "@/components/schedules/ScheduleEarlyAccessNotice";
import { ScheduleManagerPanel } from "@/components/schedules/ScheduleManagerPanel";
import { RunLogPanel } from "./RunLogPanel";
import {
  buildRunLog,
  edgeRunVisual,
  nodeRunVisual,
} from "./runProgress";

const EDGE_STYLE = {
  type: "smoothstep" as const,
  animated: false,
  style: { stroke: "#0D9488", strokeWidth: 2 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: "#0D9488",
  },
};

const nodeTypes = { activity: ActivityNode };

type Props = {
  flowId: string;
  initialName: string;
  initialGraph: FlowGraph;
};

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Refresh every downstream snapshot from roots so dropped/renamed columns can't linger. */
function syncPreviewPipeline<T extends Node<ActivityNodeData>>(
  list: T[],
  edgeList: Edge[],
): T[] {
  const roots = list.filter((n) => !edgeList.some((e) => e.target === n.id));
  let next = list;
  const starts = roots.length ? roots : list;
  for (const root of starts) {
    next = propagatePreviewFrom(next, edgeList, root.id);
  }
  return next;
}

function FlowEditorInner({ flowId, initialName, initialGraph }: Props) {
  const [name, setName] = useState(initialName);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const labels = useMemo(
    () => Object.fromEntries(blocks.map((b) => [b.type, b.label])),
    [blocks],
  );
  const seeded = useRef(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ActivityNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** True while the canvas shows a past run’s frozen pipeline (not the live editor). */
  const [historicView, setHistoricView] = useState(false);
  const [historicHasSnapshot, setHistoricHasSnapshot] = useState(true);
  const [status, setStatus] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [autoBuildBusy, setAutoBuildBusy] = useState(false);
  const [autoBuildDialogOpen, setAutoBuildDialogOpen] = useState(false);
  const [pendingAutoFile, setPendingAutoFile] = useState<File | null>(null);
  const [autoBuildGoal, setAutoBuildGoal] = useState("");
  const [autoPipelineBanner, setAutoPipelineBanner] = useState<{
    title: string;
    rationale: string;
  } | null>(null);
  const autoFileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRunIdRef = useRef<string | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  /** Live editor graph stashed while browsing a historic run. */
  const liveGraphRef = useRef<FlowGraph | null>(null);
  const liveNameRef = useRef<string | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const didFit = useRef(false);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("built") === "1") {
        const raw = sessionStorage.getItem("flowlytics.autoPipeline");
        if (raw) {
          const parsed = JSON.parse(raw) as {
            title?: string;
            rationale?: string;
          };
          if (parsed.rationale || parsed.title) {
            setAutoPipelineBanner({
              title: parsed.title || "Auto analysis pipeline ready",
              rationale:
                parsed.rationale ||
                "Review the wired activities, enable AI keys if needed, then Run.",
            });
          }
          sessionStorage.removeItem("flowlytics.autoPipeline");
        } else {
          setAutoPipelineBanner({
            title: "Auto analysis pipeline ready",
            rationale:
              "We profiled your data and wired Clean → explore → visualise → insights → export. Review configs, then Run.",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const { nodes: n, edges: e } = flowGraphToRf(initialGraph, {});
    setNodes(n);
    setEdges(e);
  }, [initialGraph, setEdges, setNodes]);

  useEffect(() => {
    if (didFit.current || nodes.length === 0) return;
    didFit.current = true;
    const timer = setTimeout(() => {
      fitView({ padding: 0.45, maxZoom: 0.7, minZoom: 0.4, duration: 180 });
    }, 40);
    return () => clearTimeout(timer);
  }, [nodes.length, fitView]);

  useEffect(() => {
    fetch("/api/blocks")
      .then((r) => r.json())
      .then((list: BlockSummary[]) => {
        setBlocks(list);
        const map = Object.fromEntries(list.map((b) => [b.type, b.label]));
        setNodes((prev) =>
          prev.map((n) => ({
            ...n,
            data: { ...n.data, label: map[n.data.blockType] ?? n.data.label },
          })),
        );
      })
      .catch(() => undefined);
  }, [setNodes]);

  const refreshRunHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/flows/${flowId}/runs?limit=30`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.runs)) {
        setRunHistory(data.runs as RunHistoryItem[]);
      }
    } catch {
      /* ignore — history is non-blocking */
    } finally {
      setHistoryLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    void refreshRunHistory();
  }, [refreshRunHistory]);

  const applyGraphToCanvas = useCallback(
    (graph: FlowGraph, labelMap: Record<string, string>) => {
      const { nodes: n, edges: e } = flowGraphToRf(graph, labelMap);
      const styledEdges = e.map((edge) => ({
        ...edge,
        ...EDGE_STYLE,
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }));
      nodesRef.current = n;
      edgesRef.current = styledEdges;
      setNodes(n);
      setEdges(styledEdges);
      setTimeout(() => {
        fitView({ padding: 0.4, maxZoom: 0.7, duration: 220 });
      }, 40);
    },
    [fitView, setEdges, setNodes],
  );

  const exitHistoricView = useCallback(() => {
    const live = liveGraphRef.current;
    if (live) {
      applyGraphToCanvas(live, labels);
    }
    if (liveNameRef.current != null) {
      setName(liveNameRef.current);
    }
    liveGraphRef.current = null;
    liveNameRef.current = null;
    setHistoricView(false);
    setHistoricHasSnapshot(true);
    setRun(null);
    setRunLogOpen(false);
    setConfigNodeId(null);
    setStatus("Back to live editor");
  }, [applyGraphToCanvas, labels]);

  const selectHistoricRun = useCallback(
    async (runId: string) => {
      setStatus("Loading historic run…");
      try {
        const res = await fetch(`/api/runs/${runId}`);
        const body = await res.json();
        if (!res.ok) {
          setStatus(body.error ?? "Could not load run");
          return;
        }
        const loaded = body as RunState;

        // Stash the live pipeline once when entering historic mode.
        if (!historicView) {
          liveGraphRef.current = rfToFlowGraph(nodesRef.current, edgesRef.current);
          liveNameRef.current = name;
        }

        const snap = loaded.graphSnapshotJson;
        const hasSnap = isFlowGraph(snap);
        setHistoricHasSnapshot(hasSnap);
        if (hasSnap) {
          applyGraphToCanvas(snap, labels);
        }

        setHistoricView(true);
        setRun(loaded);
        setRunLogOpen(true);
        setConfigNodeId(null);

        // Overlay full per-step tables onto the historic canvas (stats/chart/etc.).
        if (loaded.steps?.length) {
          const withOutputs = applyRunOutputsToNodes(
            nodesRef.current,
            loaded.steps,
          );
          nodesRef.current = withOutputs;
          setNodes(withOutputs);
        }

        const when = loaded.startedAt ?? loaded.createdAt;
        const whenLabel = when ? formatDateTime(when) : "past run";
        const dur = runDurationMs({
          status: loaded.status,
          createdAt: loaded.createdAt ?? new Date().toISOString(),
          startedAt: loaded.startedAt,
          finishedAt: loaded.finishedAt,
        });
        if (!hasSnap) {
          setStatus(
            `Historic view · ${whenLabel} · no pipeline snapshot (showing current canvas)`,
          );
        } else if (loaded.status === "FAILED") {
          setStatus(loaded.errorMessage ?? `Historic view · ${whenLabel}`);
        } else if (loaded.status === "SUCCEEDED") {
          setStatus(
            dur != null
              ? `Historic view · ${whenLabel} · ${formatDurationMs(dur)}`
              : `Historic view · ${whenLabel}`,
          );
        } else {
          setStatus(`Historic view · ${whenLabel} · ${loaded.status}`);
        }
      } catch {
        setStatus("Could not load run");
      }
    },
    [applyGraphToCanvas, historicView, labels, name],
  );

  const persist = useCallback(
    (
      nextNodes = nodesRef.current,
      nextEdges = edgesRef.current,
      nextName = name,
      opts?: { skipPreviewSync?: boolean },
    ) => {
      // Never autosave while inspecting a historic snapshot.
      if (historicView) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const skipPreviewSync = Boolean(opts?.skipPreviewSync);
      saveTimer.current = setTimeout(async () => {
        // After a full Run, keep per-step tables — don't re-sample via preview cascade.
        const synced = skipPreviewSync
          ? nextNodes
          : syncPreviewPipeline(nextNodes, nextEdges);
        const graph = rfToFlowGraph(synced, nextEdges);
        const res = await fetch(`/api/flows/${flowId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName, graph }),
        });
        setStatus(res.ok ? "Saved" : "Save failed");
      }, 450);
    },
    [flowId, historicView, name],
  );

  const applyFullRunResults = useCallback(
    (body: RunState) => {
      if (!body.steps?.length) return;
      const next = applyRunOutputsToNodes(nodesRef.current, body.steps);
      nodesRef.current = next;
      setNodes(next);
      if (!historicView) {
        persist(next, edgesRef.current, name, { skipPreviewSync: true });
      }
    },
    [historicView, name, persist, setNodes],
  );

  const stopRunPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRunIdRef.current = null;
  }, []);

  const startRunPolling = useCallback(
    (runId: string) => {
      if (pollingRunIdRef.current === runId && pollTimerRef.current) return;
      stopRunPolling();
      pollingRunIdRef.current = runId;
      pollTimerRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/runs/${runId}`);
          const body = await r.json();
          if (!r.ok) return;
          setRun(body);
          if (body.status === "QUEUED") {
            setStatus(
              `Queued #${body.queuePosition ?? "?"} · ETA ~${body.etaSeconds ?? "?"}s · runs in background`,
            );
          } else if (body.status === "RUNNING") {
            const current =
              body.currentBlockId &&
              nodesRef.current.find((n) => n.id === body.currentBlockId)?.data
                .label;
            setStatus(
              current
                ? `Running · ${current} · continues if you leave`
                : "Running in background…",
            );
          } else if (body.status === "SUCCEEDED") {
            applyFullRunResults(body as RunState);
            const dur = runDurationMs({
              status: body.status,
              createdAt: body.createdAt ?? new Date().toISOString(),
              startedAt: body.startedAt,
              finishedAt: body.finishedAt,
            });
            setStatus(
              dur != null
                ? `Run succeeded · full results on canvas · ${formatDurationMs(dur)}`
                : "Run succeeded · full results on canvas",
            );
            stopRunPolling();
            void refreshRunHistory();
          } else if (body.status === "FAILED") {
            applyFullRunResults(body as RunState);
            setStatus(body.errorMessage ?? "Run failed");
            stopRunPolling();
            void refreshRunHistory();
          }
        } catch {
          /* keep polling */
        }
      }, 800);
    },
    [applyFullRunResults, refreshRunHistory, stopRunPolling],
  );

  useEffect(() => () => stopRunPolling(), [stopRunPolling]);

  /** Resume live progress if a run was started from home or before leaving the canvas. */
  useEffect(() => {
    if (historicView) return;
    const active = runHistory.find(
      (r) => r.status === "QUEUED" || r.status === "RUNNING",
    );
    if (!active) return;
    if (pollingRunIdRef.current === active.id) return;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/runs/${active.id}`);
        const body = await r.json();
        if (cancelled || !r.ok) return;
        setRun(body);
        setRunLogOpen(true);
        if (body.status === "QUEUED" || body.status === "RUNNING") {
          setStatus(
            body.status === "QUEUED"
              ? `Resumed · queued #${body.queuePosition ?? "?"} · running in background`
              : "Resumed live run…",
          );
          startRunPolling(active.id);
        } else if (body.status === "SUCCEEDED" || body.status === "FAILED") {
          applyFullRunResults(body as RunState);
          setStatus(
            body.status === "SUCCEEDED"
              ? "Latest background run finished — results on canvas"
              : (body.errorMessage ?? "Latest background run failed"),
          );
          void refreshRunHistory();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    runHistory,
    historicView,
    startRunPolling,
    applyFullRunResults,
    refreshRunHistory,
  ]);

  const onChangeConfig = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (historicView) return;
      setNodes((prev) => {
        let next = prev.map((node) => {
          if (node.id !== nodeId) return node;
          const nextConfig = { ...node.data.config, ...patch };
          const w = Number(patch.nodeWidth);
          const h = Number(patch.nodeHeight);
          const sized = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
          return {
            ...node,
            ...(sized
              ? {
                  width: w,
                  height: h,
                  style: { ...node.style, width: w, height: h },
                }
              : {}),
            data: {
              ...node.data,
              config: nextConfig,
            },
          };
        });
        const changed = next.find((n) => n.id === nodeId);
        if (
          changed &&
          patchAffectsPreviewOutput(changed.data.blockType, patch)
        ) {
          // Clean/Map (or ingest table) edits → refresh downstream preview tables
          next = propagatePreviewFrom(next, edgesRef.current, nodeId);
        }
        nodesRef.current = next;
        persist(next, edgesRef.current);
        return next;
      });
    },
    [historicView, persist, setNodes],
  );

  const uploadToNode = useCallback(
    async (
      nodeId: string,
      file: File | null,
      options?: { sheet?: string; range?: string; fileId?: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (historicView) {
        const error = "Historic view is read-only — switch back to live to edit";
        setStatus(error);
        return { ok: false, error };
      }

      if (file && file.size > DEFAULT_MAX_UPLOAD_BYTES) {
        const error = fileTooLargeMessage(file.size, DEFAULT_MAX_UPLOAD_BYTES);
        setStatus(error);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    config: { ...n.data.config, uploadError: error },
                  },
                }
              : n,
          ),
        );
        return { ok: false, error };
      }

      setStatus(options?.fileId ? "Updating sheet…" : "Uploading…");
      const form = new FormData();
      if (file) form.append("file", file);
      if (options?.fileId) form.append("fileId", options.fileId);
      if (options?.sheet) form.append("sheet", options.sheet);
      if (options?.range) form.append("range", options.range);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const error =
            (data.error as string) ||
            (res.status === 413
              ? "File is too large for upload."
              : "Upload failed. Please try again.");
          setStatus(error);
          setNodes((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      config: { ...n.data.config, uploadError: error },
                    },
                  }
                : n,
            ),
          );
          return { ok: false, error };
        }

        setDisclaimer(data.disclaimer ?? null);
        setNodes((prev) => {
          let next = prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    config: {
                      ...n.data.config,
                      fileName: data.fileName,
                      fileId: data.fileId,
                      // Full table kept on ingest for Run; canvas previews sample downstream
                      table: data.table,
                      sheetNames: data.sheetNames ?? [],
                      excelSheet: data.sheet ?? null,
                      excelRange: data.range ?? "",
                      piiFindings: data.piiFindings ?? [],
                      piiAcknowledged: (data.piiFindings ?? []).length === 0,
                      _sourceColumns: data.table?.columns ?? [],
                      _previewSample: false,
                      uploadError: null,
                    },
                  },
                }
              : n,
          );
          next = propagatePreviewFrom(next, edgesRef.current, nodeId);
          nodesRef.current = next;
          persist(next, edgesRef.current);
          return next;
        });
        setSuggestion(suggestNextAfter("ingest.csv_excel"));
        const sheetNote = data.sheet ? ` · sheet ${data.sheet}` : "";
        setStatus(`Loaded ${data.fileName}${sheetNote}`);
        setConfigNodeId(nodeId);
        return { ok: true };
      } catch {
        const error = "Network error while uploading. Check your connection and try again.";
        setStatus(error);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    config: { ...n.data.config, uploadError: error },
                  },
                }
              : n,
          ),
        );
        return { ok: false, error };
      }
    },
    [historicView, persist, setNodes],
  );

  const openConfig = useCallback((nodeId: string) => {
    setConfigNodeId(nodeId);
  }, []);

  const deleteNodesById = useCallback(
    (ids: string[]) => {
      if (historicView) {
        setStatus("Historic view is read-only — switch back to live to edit");
        return;
      }
      if (!ids.length) return;
      const idSet = new Set(ids);
      const nextNodes = nodesRef.current.filter((n) => !idSet.has(n.id));
      const nextEdges = edgesRef.current.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target),
      );
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      persist(nextNodes, nextEdges);
      setConfigNodeId((current) => (current && idSet.has(current) ? null : current));
      setStatus(ids.length === 1 ? "Activity deleted" : `${ids.length} activities deleted`);
    },
    [historicView, persist, setEdges, setNodes],
  );

  const runStepOutputs = useMemo(
    () => stepOutputsByBlockId(run?.steps),
    [run?.steps],
  );

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      const runStatus = nodeRunVisual(n.id, run);

      const incoming = edges.find((e) => e.target === n.id);
      const upstream = incoming
        ? nodes.find((u) => u.id === incoming.source)
        : undefined;
      // Live bind so canvas/config always show post-transform columns
      const boundConfig =
        upstream && portsFor(n.data.blockType).hasInput
          ? bindConfigToUpstream(
              n.data.blockType,
              n.data.config,
              upstream.data.blockType,
              upstream.data.config,
            )
          : n.data.config;

      // Prefer this activity's full-run step output (stats/chart/structure/etc.).
      // Clean/Map & Aggregate keep `table` as input — see mergeRunOutputIntoConfig.
      const dataConfig = mergeRunOutputIntoConfig(
        boundConfig,
        runStepOutputs.get(n.id),
        n.data.blockType,
      );

      const cfg = dataConfig ?? {};
      const hasTable = Boolean(
        cfg.table &&
          typeof cfg.table === "object" &&
          Array.isArray((cfg.table as { columns?: unknown }).columns) &&
          (cfg.table as { columns: unknown[] }).columns.length,
      );
      const isChart =
        (n.data.blockType === "analyse.chart" ||
          n.data.blockType === "analyse.projection") &&
        hasTable;
      const isStats = n.data.blockType === "analyse.stats" && hasTable;
      const isAi =
        (n.data.blockType === "ai.analyse" ||
          n.data.blockType === "ai.explain") &&
        (Boolean(cfg.insightReport) ||
          Boolean(cfg.explanation) ||
          (Array.isArray(cfg.insights) && cfg.insights.length > 0));
      const fallbackW =
        Number(cfg.nodeWidth) ||
        (isChart ? 480 : isStats ? 340 : isAi ? 440 : 0);
      const fallbackH =
        Number(cfg.nodeHeight) ||
        (isChart
          ? n.data.blockType === "analyse.projection"
            ? 440
            : 420
          : isStats
            ? 340
            : isAi
              ? 400
              : 0);
      // Keep live RF dimensions while dragging; don't overwrite with stale config
      const w =
        typeof n.width === "number" && n.width > 0 ? n.width : fallbackW;
      const h =
        typeof n.height === "number" && n.height > 0 ? n.height : fallbackH;
      const sized = (isChart || isStats || isAi) && w > 0 && h > 0;

      return {
        ...n,
        ...(sized ? { style: { ...n.style, width: w, height: h }, width: w, height: h } : {}),
        data: {
          ...n.data,
          config: dataConfig,
          runStatus,
          onChangeConfig: historicView ? undefined : onChangeConfig,
          onUploadFile: historicView ? undefined : uploadToNode,
          onOpenConfig: openConfig,
          onDelete: historicView
            ? undefined
            : (nodeId: string) => deleteNodesById([nodeId]),
        },
      };
    });
  }, [
    nodes,
    edges,
    run,
    runStepOutputs,
    historicView,
    onChangeConfig,
    uploadToNode,
    openConfig,
    deleteNodesById,
  ]);

  const displayEdges = useMemo(() => {
    const active = Boolean(
      run &&
        (run.status === "QUEUED" ||
          run.status === "RUNNING" ||
          run.status === "SUCCEEDED" ||
          run.status === "FAILED"),
    );
    return edges.map((edge) => {
      if (!active) {
        return {
          ...edge,
          animated: false,
          className: undefined,
          style: EDGE_STYLE.style,
        };
      }
      const visual = edgeRunVisual(edge.source, edge.target, run);
      if (visual === "running") {
        return {
          ...edge,
          animated: true,
          className: "flow-edge--active",
          style: { stroke: "#0D9488", strokeWidth: 2.75 },
        };
      }
      if (visual === "succeeded") {
        return {
          ...edge,
          animated: false,
          className: "flow-edge--done",
          style: { stroke: "#027A48", strokeWidth: 2.25 },
        };
      }
      if (visual === "failed") {
        return {
          ...edge,
          animated: false,
          className: "flow-edge--failed",
          style: { stroke: "#B42318", strokeWidth: 2.25 },
        };
      }
      return {
        ...edge,
        animated: false,
        className: "flow-edge--pending",
        style: { stroke: "#94A3B8", strokeWidth: 1.75, opacity: 0.55 },
      };
    });
  }, [edges, run]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const source = nodesRef.current.find((n) => n.id === connection.source);
      const target = nodesRef.current.find((n) => n.id === connection.target);
      if (!source || !target) return false;
      if (!portsFor(source.data.blockType).hasOutput) return false;
      if (!portsFor(target.data.blockType).hasInput) return false;
      return true;
    },
    [],
  );

  const configNode = useMemo(() => {
    if (!configNodeId) return null;
    const node = nodes.find((n) => n.id === configNodeId);
    if (!node) return null;
    const incoming = edges.find((e) => e.target === node.id);
    const upstream = incoming
      ? nodes.find((n) => n.id === incoming.source)
      : undefined;
    const bound = upstream
      ? bindConfigToUpstream(
          node.data.blockType,
          node.data.config,
          upstream.data.blockType,
          upstream.data.config,
        )
      : node.data.config;
    // Config window should show full-run tables when available (same as canvas).
    // Clean/Map & Aggregate keep input `table` — not their own step output.
    let config = mergeRunOutputIntoConfig(
      bound,
      runStepOutputs.get(node.id),
      node.data.blockType,
    );
    // Live Clean/Map / Aggregate / AI edits win over re-bind.
    if (
      node.data.blockType === "transform.clean_map" ||
      node.data.blockType === "transform.aggregate" ||
      node.data.blockType.startsWith("ai.")
    ) {
      config = {
        ...config,
        datasetName: node.data.config.datasetName ?? config.datasetName,
      };
    }
    if (node.data.blockType === "transform.clean_map") {
      config = {
        ...config,
        columnMap: node.data.config.columnMap ?? config.columnMap,
        dropColumns: node.data.config.dropColumns ?? config.dropColumns,
        transforms: node.data.config.transforms ?? config.transforms,
        _columnFormats: node.data.config._columnFormats ?? config._columnFormats,
        // Prefer stored input table when present; else rebound upstream sample
        table: node.data.config.table ?? config.table,
        _sourceColumns:
          node.data.config._sourceColumns ?? config._sourceColumns,
      };
    }
    return {
      ...node,
      data: {
        ...node.data,
        config,
      },
    };
  }, [configNodeId, nodes, edges, runStepOutputs]);

  const flowIssues = useMemo(
    () =>
      checkFlow(
        nodes.map((n) => ({ id: n.id, data: n.data })),
        edges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [nodes, edges],
  );

  const configAncestors = useMemo(() => {
    if (!configNodeId) return [];
    return listAncestorSources(
      nodes.map((n) => ({ id: n.id, data: n.data })),
      edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      configNodeId,
    );
  }, [configNodeId, nodes, edges]);

  const onSelectSource = useCallback(
    (sourceNodeId: string) => {
      if (historicView || !configNodeId) return;
      const targetId = configNodeId;
      const source = nodesRef.current.find((n) => n.id === sourceNodeId);
      const target = nodesRef.current.find((n) => n.id === targetId);
      if (!source || !target) return;

      setEdges((eds) => {
        const nextEdges = rewireInboundSource(eds, targetId, sourceNodeId, uid("e"));
        // Ensure edge style on new edge
        const styled = nextEdges.map((e) =>
          e.target === targetId && e.source === sourceNodeId
            ? { ...e, ...EDGE_STYLE }
            : e,
        );
        edgesRef.current = styled;

        setNodes((prev) => {
          const mapped = {
            ...autoMapOnConnect(
              source.data.blockType,
              source.data.config,
              target.data.blockType,
              target.data.config,
            ),
            sourceNodeId,
          };
          let next = prev.map((n) =>
            n.id === targetId
              ? { ...n, data: { ...n.data, config: mapped } }
              : n,
          );
          next = propagatePreviewFrom(next, styled, targetId);
          nodesRef.current = next;
          persist(next, styled);
          return next;
        });
        return styled;
      });
      setStatus(`Data source → ${source.data.label}`);
    },
    [historicView, configNodeId, persist, setEdges, setNodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (historicView) {
        setStatus("Historic view is read-only — switch back to live to edit");
        return;
      }
      setEdges((eds) => {
        const nextEdges = addEdge(
          {
            ...connection,
            id: uid("e"),
            ...EDGE_STYLE,
          },
          eds,
        );
        edgesRef.current = nextEdges;

        setNodes((prev) => {
          const source = prev.find((n) => n.id === connection.source);
          const target = prev.find((n) => n.id === connection.target);
          if (!source || !target) {
            persist(prev, nextEdges);
            return prev;
          }
          const mapped = {
            ...autoMapOnConnect(
              source.data.blockType,
              source.data.config,
              target.data.blockType,
              target.data.config,
            ),
            sourceNodeId: source.id,
          };
          let next = prev.map((n) =>
            n.id === target.id ? { ...n, data: { ...n.data, config: mapped } } : n,
          );
          // Cascade cleaned/sampled preview through anything already wired below the target
          next = propagatePreviewFrom(next, nextEdges, target.id);
          nodesRef.current = next;
          persist(next, nextEdges);
          return next;
        });
        return nextEdges;
      });
      setStatus("Connected · preview uses cleaned sample; Run uses full data");
      const target = nodesRef.current.find((n) => n.id === connection.target);
      if (
        target &&
        (target.data.blockType === "transform.clean_map" ||
          target.data.blockType === "transform.aggregate" ||
          target.data.blockType === "output.structure" ||
          target.data.blockType === "analyse.chart")
      ) {
        setConfigNodeId(connection.target);
      }
    },
    [historicView, persist, setEdges, setNodes],
  );

  function findWireSource(
    list: Node<ActivityNodeData>[],
    targetType: string,
  ): Node<ActivityNodeData> | null {
    if (!portsFor(targetType).hasInput) return null;
    const selected = list.find((n) => n.selected && portsFor(n.data.blockType).hasOutput);
    if (selected) return selected;
    // Prefer the rightmost node with an unused/available out port
    const withOut = [...list]
      .filter((n) => portsFor(n.data.blockType).hasOutput)
      .sort((a, b) => b.position.x - a.position.x || b.position.y - a.position.y);
    return withOut[0] ?? null;
  }

  function addActivity(type: string, position?: { x: number; y: number }, wire = true) {
    if (historicView) {
      setStatus("Historic view is read-only — switch back to live to edit");
      return;
    }
    const def = blocks.find((b) => b.type === type);
    const source = wire ? findWireSource(nodesRef.current, type) : null;
    const pos =
      position ??
      (source
        ? { x: source.position.x + 280, y: source.position.y }
        : {
            x: 140 + nodesRef.current.length * 36,
            y: 100 + (nodesRef.current.length % 5) * 36,
          });
    const node: Node<ActivityNodeData> = {
      id: uid("n"),
      type: "activity",
      position: pos,
      data: {
        blockType: type,
        label: def?.label ?? type,
        config: {
          ...(def?.requiresAiOptIn ? { aiOptIn: false } : {}),
        },
      },
    };

    let nextNodes = [...nodesRef.current, node];
    let nextEdges = edgesRef.current;

    if (source) {
      const mapped = autoMapOnConnect(
        source.data.blockType,
        source.data.config,
        type,
        node.data.config,
      );
      node.data = { ...node.data, config: mapped };
      nextNodes = [...nodesRef.current, node];
      nextEdges = addEdge(
        {
          id: uid("e"),
          source: source.id,
          target: node.id,
          sourceHandle: "table",
          targetHandle: "table",
          ...EDGE_STYLE,
        },
        nextEdges,
      );
      setStatus(`Added ${def?.label ?? type} · wired from ${source.data.label}`);
    }

    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    persist(nextNodes, nextEdges);

    const suggest = suggestNextAfter(type);
    if (suggest) setSuggestion(suggest);
    if (
      type === "ingest.csv_excel" ||
      type === "transform.clean_map" ||
      type === "transform.aggregate" ||
      type === "analyse.chart"
    ) {
      setConfigNodeId(node.id);
    }
    return node.id;
  }

  const styleEdges = useCallback((raw: Edge[]) => {
    return raw.map((e) => ({ ...e, ...EDGE_STYLE }));
  }, []);

  const collectNodeSizes = useCallback(() => {
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const n of nodesRef.current) {
      const measured = (
        n as Node<ActivityNodeData> & {
          measured?: { width?: number; height?: number };
        }
      ).measured;
      const cfg = n.data.config ?? {};
      const w =
        (typeof n.width === "number" && n.width > 0 ? n.width : 0) ||
        (typeof measured?.width === "number" && measured.width > 0
          ? measured.width
          : 0) ||
        Number(cfg.nodeWidth) ||
        0;
      const h =
        (typeof n.height === "number" && n.height > 0 ? n.height : 0) ||
        (typeof measured?.height === "number" && measured.height > 0
          ? measured.height
          : 0) ||
        Number(cfg.nodeHeight) ||
        0;
      if (w > 0 && h > 0) {
        sizes[n.id] = { width: w, height: h };
      }
    }
    return sizes;
  }, []);

  const applyAlignedGraph = useCallback(
    (aligned: ReturnType<typeof alignFlowGraph>) => {
      const { nodes: n, edges: e } = flowGraphToRf(aligned, labels);
      const nextEdges = styleEdges(e);
      // Apply reserved showcase width/height onto RF nodes so layout matches paint
      const sized = n.map((node) => {
        const w = Number(node.data.config.nodeWidth);
        const h = Number(node.data.config.nodeHeight);
        if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
          return {
            ...node,
            width: w,
            height: h,
            style: { ...node.style, width: w, height: h },
          };
        }
        return node;
      });
      nodesRef.current = sized;
      edgesRef.current = nextEdges;
      setNodes(sized);
      setEdges(nextEdges);
      persist(sized, nextEdges);
      return sized;
    },
    [labels, persist, setEdges, setNodes, styleEdges],
  );

  const autoAlignActivities = useCallback(() => {
    if (historicView) {
      setStatus("Historic view is read-only — switch back to live to edit");
      return;
    }
    if (!nodesRef.current.length) {
      setStatus("Add activities before aligning");
      return;
    }
    const runPass = (useMeasured: boolean) => {
      const graph = rfToFlowGraph(nodesRef.current, edgesRef.current);
      const aligned = alignFlowGraph(graph, {
        sizes: useMeasured ? collectNodeSizes() : undefined,
      });
      applyAlignedGraph(aligned);
    };
    // Pass 1: content-aware estimates (+ any saved nodeWidth/Height)
    runPass(true);
    setStatus("Activities aligned");
    // Pass 2: after paint, re-measure expanded showcases and tighten spacing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runPass(true);
        fitView({ padding: 0.32, maxZoom: 0.7, duration: 280 });
      });
    });
  }, [
    applyAlignedGraph,
    collectNodeSizes,
    fitView,
    historicView,
  ]);

  const applyAutoPipelineGraph = useCallback(
    (
      plan: ReturnType<typeof planAutoPipeline>,
      seed?: Parameters<typeof materializeAutoPipelineGraph>[1],
    ) => {
      // materializeAutoPipelineGraph already runs alignFlowGraph (content-aware sizes)
      const graph = materializeAutoPipelineGraph(plan, seed);
      const sized = applyAlignedGraph(graph);
      setAutoPipelineBanner({
        title: plan.title,
        rationale: plan.rationale,
      });
      setStatus(`Built: ${plan.title}`);
      setSuggestion(null);
      const ingest = sized.find((x) => x.data.blockType === "ingest.csv_excel");
      const first = ingest ?? sized[0];
      if (first) setConfigNodeId(first.id);
      // Second pass once showcases mount with table previews
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const again = alignFlowGraph(
            rfToFlowGraph(nodesRef.current, edgesRef.current),
            { sizes: collectNodeSizes() },
          );
          applyAlignedGraph(again);
          fitView({ padding: 0.32, maxZoom: 0.6, duration: 280 });
        });
      });
    },
    [applyAlignedGraph, collectNodeSizes, fitView],
  );

  const stageAutoPipelineFile = useCallback(
    (file: File) => {
      if (historicView) {
        setStatus("Historic view is read-only — switch back to live to edit");
        return;
      }
      setPendingAutoFile(file);
      setAutoBuildGoal("");
      setAutoBuildDialogOpen(true);
    },
    [historicView],
  );

  const confirmAutoPipelineBuild = useCallback(async () => {
    const file = pendingAutoFile;
    if (!file) return;
    if (nodesRef.current.length > 0) {
      const ok = window.confirm(
        "Replace the current canvas with an auto-built analysis pipeline?",
      );
      if (!ok) return;
    }
    setAutoBuildBusy(true);
    setStatus("Profiling data & building pipeline…");
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) {
        throw new Error((upData.error as string) || "Upload failed");
      }
      const table = upData.table as TabularData;
      const plan = planAutoPipeline({
        table,
        enableAi: true,
        goal: autoBuildGoal.trim() || undefined,
      });
      applyAutoPipelineGraph(plan, {
        fileId: upData.fileId,
        fileName: upData.fileName,
        table,
        sheetNames: upData.sheetNames,
        excelSheet: upData.sheet,
        excelRange: upData.range ?? "",
        piiFindings: upData.piiFindings ?? [],
      });
      if (upData.disclaimer) setDisclaimer(upData.disclaimer);
      setAutoBuildDialogOpen(false);
      setPendingAutoFile(null);
      setAutoBuildGoal("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Auto-build failed");
    } finally {
      setAutoBuildBusy(false);
    }
  }, [applyAutoPipelineGraph, autoBuildGoal, pendingAutoFile]);

  function addQuickRecipe(recipe: QuickRecipe) {
    if (historicView) {
      setStatus("Historic view is read-only — switch back to live to edit");
      return;
    }
    const startX = 120;
    const startY = 140 + (nodesRef.current.length % 3) * 40;
    const gap = 280;
    const created: Node<ActivityNodeData>[] = [];
    const newEdges: Edge[] = [];

    recipe.steps.forEach((type, index) => {
      const def = blocks.find((b) => b.type === type);
      let config: Record<string, unknown> = {
        ...(def?.requiresAiOptIn
          ? { aiOptIn: recipe.id === "auto-analyse" }
          : {}),
      };
      if (index > 0) {
        config = autoMapOnConnect(
          created[index - 1]!.data.blockType,
          created[index - 1]!.data.config,
          type,
          config,
        );
      }
      const node: Node<ActivityNodeData> = {
        id: uid("n"),
        type: "activity",
        position: { x: startX + index * gap, y: startY },
        data: {
          blockType: type,
          label: def?.label ?? type,
          config,
        },
      };
      created.push(node);
      if (index > 0) {
        newEdges.push({
          id: uid("e"),
          source: created[index - 1]!.id,
          target: node.id,
          sourceHandle: "table",
          targetHandle: "table",
          ...EDGE_STYLE,
        });
      }
    });

    const mergedNodes = [...nodesRef.current, ...created];
    const mergedEdges = [...edgesRef.current, ...newEdges];
    const aligned = alignFlowGraph(rfToFlowGraph(mergedNodes, mergedEdges));
    applyAlignedGraph(aligned);
    setSuggestion(null);
    setStatus(`Quick path: ${recipe.label}`);
    if (created[0]) setConfigNodeId(created[0].id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const again = alignFlowGraph(
          rfToFlowGraph(nodesRef.current, edgesRef.current),
          { sizes: collectNodeSizes() },
        );
        applyAlignedGraph(again);
        fitView({ padding: 0.35, maxZoom: 0.65, duration: 240 });
      });
    });
  }

  const onNodeDragStop = useCallback(() => {
    persist(nodesRef.current, edgesRef.current);
  }, [persist]);

  async function runFlow(retryFromBlockId?: string) {
    if (historicView) {
      setStatus("Switch back to the live editor before running");
      return;
    }
    const synced = syncPreviewPipeline(nodesRef.current, edgesRef.current);
    nodesRef.current = synced;
    setNodes(synced);
    const graph = rfToFlowGraph(synced, edgesRef.current);
    await fetch(`/api/flows/${flowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, graph }),
    });
    setStatus("Enqueueing…");
    const res = await fetch(`/api/flows/${flowId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retryFromBlockId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Run failed to queue");
      return;
    }
    setRun(data);
    setRunLogOpen(true);
    setStatus(
      `Queued #${data.queuePosition ?? "?"} · ETA ~${data.etaSeconds ?? "?"}s · continues if you leave`,
    );
    void refreshRunHistory();
    startRunPolling(data.id);
  }

  const [scheduleMenuOpen, setScheduleMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [manageSchedulesOpen, setManageSchedulesOpen] = useState(false);
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [customEvery, setCustomEvery] = useState(6);
  const [customUnit, setCustomUnit] = useState<"h" | "d">("h");

  async function schedule(
    body:
      | { cronKind: "daily" }
      | { cronKind: "weekly" }
      | { cronKind: "custom"; every: number; unit: "h" | "d" },
  ) {
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Schedule failed");
      return;
    }
    setStatus(`Scheduled · ${data.label ?? body.cronKind}`);
    setCustomOpen(false);
    setScheduleMenuOpen(false);
    setManageSchedulesOpen(true);
    setScheduleRefresh((n) => n + 1);
  }

  const resultTable = run?.resultJson?.table as TabularData | undefined;
  const checkSummary = issueCounts(flowIssues);
  const nodeIdLabels = useMemo(
    () => Object.fromEntries(nodes.map((n) => [n.id, n.data.label])),
    [nodes],
  );
  const byBlockId = (run?.resultJson?.byBlockId ?? {}) as Record<
    string,
    {
      table?: TabularData;
      chart?: ChartSpec;
      explanation?: string;
      insights?: string[];
      insightReport?: InsightReport;
    }
  >;
  /** Per-step findings for a report-style Results rail (not last-wins only). */
  const resultFindings = useMemo(() => {
    const charts: { blockId: string; label: string; chart: ChartSpec }[] = [];
    const insights: {
      blockId: string;
      label: string;
      explanation?: string;
      lines?: string[];
      report?: InsightReport | null;
    }[] = [];
    for (const [blockId, out] of Object.entries(byBlockId)) {
      const label = nodeIdLabels[blockId] ?? blockId;
      if (out?.chart?.points?.length) {
        // Findings live in the written section below — avoid duplicating under the plot
        const { insights: _i, ...chartOnly } = out.chart;
        charts.push({ blockId, label, chart: chartOnly });
      }
      const report = normalizeInsightReport(out?.insightReport);
      if (report) {
        insights.push({ blockId, label, report });
      } else if (
        typeof out?.explanation === "string" &&
        out.explanation.trim()
      ) {
        insights.push({
          blockId,
          label,
          explanation: out.explanation,
          lines: Array.isArray(out.insights) ? out.insights : undefined,
        });
      } else if (Array.isArray(out?.insights) && out.insights.length) {
        insights.push({ blockId, label, lines: out.insights });
      }
    }
    // Fallback to top-level last-wins when byBlockId missing (older runs)
    if (!charts.length) {
      const legacy = run?.resultJson?.chart as ChartSpec | undefined;
      if (legacy?.points?.length) {
        charts.push({ blockId: "", label: "Chart", chart: legacy });
      }
    }
    if (!insights.length) {
      const legacyReport = normalizeInsightReport(run?.resultJson?.insightReport);
      if (legacyReport) {
        insights.push({ blockId: "", label: "Insights", report: legacyReport });
      } else {
        const legacy = run?.resultJson?.explanation as string | undefined;
        if (legacy?.trim()) {
          insights.push({ blockId: "", label: "Insights", explanation: legacy });
        }
      }
    }
    return { charts, insights };
  }, [
    byBlockId,
    nodeIdLabels,
    run?.resultJson?.chart,
    run?.resultJson?.explanation,
    run?.resultJson?.insightReport,
  ]);
  const downloadableSteps = useMemo(() => {
    return Object.entries(byBlockId)
      .filter(([, out]) => out?.table?.columns?.length)
      .map(([blockId, out]) => ({
        blockId,
        label: nodeIdLabels[blockId] ?? blockId,
        table: out.table!,
      }));
  }, [byBlockId, nodeIdLabels]);
  const [downloadStepId, setDownloadStepId] = useState<string>("");
  const selectedDownload =
    downloadableSteps.find((s) => s.blockId === downloadStepId) ??
    downloadableSteps[0] ??
    (resultTable?.columns?.length
      ? { blockId: "", label: "Latest table", table: resultTable }
      : null);
  const activeRunDuration = run
    ? runDurationMs({
        status: run.status,
        createdAt: run.createdAt ?? new Date().toISOString(),
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      })
    : null;
  const failedActivityLabel = run?.failedBlockId
    ? nodeIdLabels[run.failedBlockId] ?? "activity"
    : null;
  const runLogLines = useMemo(
    () => buildRunLog(run, nodeIdLabels),
    [run, nodeIdLabels],
  );
  const currentRunLabel = run?.currentBlockId
    ? nodeIdLabels[run.currentBlockId] ?? null
    : null;
  const runIsLive = run?.status === "QUEUED" || run?.status === "RUNNING";

  const structureNode = nodes.find((n) => n.data.blockType === "output.structure");
  const exportFileName =
    (structureNode?.data.config.fileName as string) || "flowlytics-export.csv";

  async function downloadResultCsv() {
    const table = selectedDownload?.table;
    if (!table?.columns?.length) {
      setStatus("No table result yet — run the flow first");
      return;
    }
    const shortRun = run?.id ? run.id.slice(-6) : "export";
    const base =
      selectedDownload?.label?.replace(/[^\w\-]+/g, "-").toLowerCase() ||
      exportFileName.replace(/\.csv$/i, "");
    const filename = `${base}-${shortRun}.csv`;
    try {
      await downloadTableCsv(table, filename);
      setStatus(`Downloaded ${filename}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Download failed");
    }
  }

  function focusIssue(nodeId: string) {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === nodeId })));
    setConfigNodeId(nodeId);
    fitView({
      nodes: [{ id: nodeId }],
      padding: 0.6,
      maxZoom: 0.85,
      duration: 200,
    });
  }

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[560px] overflow-hidden bg-bg">
      {autoBuildDialogOpen ? (
        <div
          className="auto-pipeline-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !autoBuildBusy) {
              setAutoBuildDialogOpen(false);
              setPendingAutoFile(null);
              setAutoBuildGoal("");
            }
          }}
        >
          <div
            className="auto-pipeline-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Build analysis pipeline"
          >
            <header className="auto-pipeline-modal__head">
              <h2 className="auto-pipeline-modal__title">Build analysis pipeline</h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={autoBuildBusy}
                onClick={() => {
                  setAutoBuildDialogOpen(false);
                  setPendingAutoFile(null);
                  setAutoBuildGoal("");
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <p className="auto-pipeline-modal__lead">
              Add a goal to steer the pipeline, then confirm. Nothing is built until you click
              Build.
            </p>
            <label className="auto-pipeline-modal__field">
              Analysis goal
              <textarea
                className="input mt-1 min-h-[72px] resize-y text-sm"
                placeholder="e.g. forecast sales, break down by region…"
                value={autoBuildGoal}
                disabled={autoBuildBusy}
                autoFocus
                onChange={(e) => setAutoBuildGoal(e.target.value)}
              />
            </label>
            <div className="auto-pipeline-modal__file">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted">File</p>
                <p className="mt-0.5 truncate text-sm text-ink">
                  {pendingAutoFile?.name ?? "No file"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={autoBuildBusy}
                onClick={() => autoFileRef.current?.click()}
              >
                Change
              </button>
            </div>
            <footer className="auto-pipeline-modal__foot">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={autoBuildBusy}
                onClick={() => {
                  setAutoBuildDialogOpen(false);
                  setPendingAutoFile(null);
                  setAutoBuildGoal("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={autoBuildBusy || !pendingAutoFile}
                onClick={() => void confirmAutoPipelineBuild()}
              >
                {autoBuildBusy ? "Building…" : "Build pipeline"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <ActivityPalette
        blocks={blocks}
        onAdd={(type) => addActivity(type)}
        onQuickRecipe={addQuickRecipe}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {autoPipelineBanner ? (
          <div className="auto-pipeline-banner mx-3 mt-2">
            <div>
              <strong>{autoPipelineBanner.title}</strong>
              <p>{autoPipelineBanner.rationale}</p>
              <p className="mt-1">
                Tip: click <strong className="font-semibold text-ink">Run</strong> when ready.
                AI steps need your API key in Settings.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost shrink-0"
              onClick={() => setAutoPipelineBanner(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="flow-toolbar z-10 flex flex-wrap items-center gap-1.5 border-b border-border bg-surface/90 px-3 py-1.5 backdrop-blur-md">
          <input
            className="input max-w-[200px] font-medium"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => persist(nodesRef.current, edgesRef.current, name)}
            aria-label="Flow name"
            disabled={historicView}
          />
          <div className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <button
            className="btn btn-sm btn-primary"
            type="button"
            onClick={() => runFlow()}
            disabled={historicView}
            title={
              historicView
                ? "Switch back to live to run"
                : "Queue a background run — safe to leave the canvas; results land in History"
            }
          >
            Run
          </button>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={() => autoAlignActivities()}
            disabled={historicView || nodes.length === 0}
            title="Space activities into a clean left-to-right pipeline layout"
          >
            Auto align
          </button>
          {!historicView && run?.status === "FAILED" && run.failedBlockId && (
            <button
              className="btn btn-sm btn-secondary"
              type="button"
              onClick={() => runFlow(run.failedBlockId!)}
            >
              Retry
            </button>
          )}
          <div className="relative">
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => {
                setManageSchedulesOpen(false);
                setCustomOpen(false);
                setScheduleMenuOpen((v) => !v);
              }}
              aria-expanded={scheduleMenuOpen || manageSchedulesOpen}
              title="Schedule runs (early — no external connectors yet)"
            >
              Schedule
              <span className="schedule-early-pill" aria-hidden>
                Early
              </span>
            </button>
            {scheduleMenuOpen && (
              <div className="schedule-popover schedule-popover--menu settle">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Schedule this pipeline
                </p>
                <div className="mt-2">
                  <ScheduleEarlyAccessNotice compact />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    onClick={() => schedule({ cronKind: "daily" })}
                  >
                    Daily
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    onClick={() => schedule({ cronKind: "weekly" })}
                  >
                    Weekly
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    onClick={() => setCustomOpen((v) => !v)}
                    aria-expanded={customOpen}
                  >
                    Custom
                  </button>
                </div>
                {customOpen && (
                  <div className="mt-2.5 rounded-lg border border-border bg-bg/60 p-2.5">
                    <p className="text-[11px] text-muted">Repeating interval</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs text-muted">Every</span>
                      <input
                        className="input w-16 py-1 text-center text-sm"
                        type="number"
                        min={1}
                        max={customUnit === "h" ? 168 : 30}
                        value={customEvery}
                        onChange={(e) => setCustomEvery(Number(e.target.value) || 1)}
                        aria-label="Interval amount"
                      />
                      <select
                        className="input py-1 text-sm"
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value as "h" | "d")}
                        aria-label="Interval unit"
                      >
                        <option value="h">hours</option>
                        <option value="d">days</option>
                      </select>
                    </div>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setCustomOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() =>
                          schedule({
                            cronKind: "custom",
                            every: customEvery,
                            unit: customUnit,
                          })
                        }
                      >
                        Add schedule
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      setScheduleMenuOpen(false);
                      setManageSchedulesOpen(true);
                    }}
                  >
                    Manage
                  </button>
                  <a href="/schedules" className="btn btn-sm btn-ghost">
                    Calendar
                  </a>
                </div>
              </div>
            )}
            <ScheduleManagerPanel
              flowId={flowId}
              open={manageSchedulesOpen}
              onClose={() => setManageSchedulesOpen(false)}
              refreshToken={scheduleRefresh}
            />
          </div>
          {run && !runLogOpen && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setRunLogOpen(true)}
            >
              Run log
            </button>
          )}
          <span className="ml-auto text-[11px] text-muted">{status}</span>
        </div>

        {historicView && (
          <div className="historic-banner" role="status">
            <div className="historic-banner__text">
              <strong>Historic view</strong>
              <span>
                {historicHasSnapshot
                  ? "Showing the pipeline snapshot from this run — edits are disabled."
                  : "This run has no saved pipeline snapshot (older run). Canvas may not match what executed."}
              </span>
              {run?.startedAt || run?.createdAt ? (
                <span className="historic-banner__when">
                  {formatDateTime(run.startedAt ?? run.createdAt!, {
                    withYear: true,
                  })}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={exitHistoricView}
            >
              Back to live
            </button>
          </div>
        )}

        {suggestion && (
          <div className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-white/95 px-4 py-2 shadow-soft backdrop-blur settle">
            <span className="text-sm text-muted">Suggested next</span>
            <strong className="text-sm text-ink">{labels[suggestion] ?? suggestion}</strong>
            <button
              className="btn btn-sm btn-primary"
              type="button"
              onClick={() => {
                addActivity(suggestion);
                setSuggestion(null);
              }}
            >
              Add
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </div>
        )}

        <div
          className={`relative flex min-h-0 flex-1 flex-col ${runIsLive ? "flow-stage--running" : ""} ${historicView ? "flow-stage--historic" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (historicView) return;
            const type = e.dataTransfer.getData("application/flowlytics-block");
            if (!type) return;
            const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            addActivity(type, position);
          }}
        >
          <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={historicView ? undefined : onNodesChange}
            onEdgesChange={historicView ? undefined : onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={historicView ? undefined : onNodeDragStop}
            nodesDraggable={!historicView}
            nodesConnectable={!historicView}
            elementsSelectable
            onNodesDelete={(deleted) => {
              if (historicView) return;
              const idSet = new Set(deleted.map((n) => n.id));
              const nextNodes = nodesRef.current.filter((n) => !idSet.has(n.id));
              const nextEdges = edgesRef.current.filter(
                (e) => !idSet.has(e.source) && !idSet.has(e.target),
              );
              nodesRef.current = nextNodes;
              edgesRef.current = nextEdges;
              persist(nextNodes, nextEdges);
              setConfigNodeId((current) =>
                current && idSet.has(current) ? null : current,
              );
              setStatus(
                deleted.length === 1
                  ? "Activity deleted"
                  : `${deleted.length} activities deleted`,
              );
            }}
            onEdgesDelete={(deleted) => {
              if (historicView) return;
              const remove = new Set(deleted.map((e) => e.id));
              const nextEdges = edgesRef.current.filter((e) => !remove.has(e.id));
              edgesRef.current = nextEdges;
              persist(nodesRef.current, nextEdges);
              setStatus("Connection deleted");
            }}
            deleteKeyCode={historicView ? null : ["Backspace", "Delete"]}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Strict}
            nodeTypes={nodeTypes}
            defaultViewport={{ x: 60, y: 40, zoom: 0.65 }}
            minZoom={0.25}
            maxZoom={1.25}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={EDGE_STYLE}
            connectionLineStyle={{ stroke: "#0D9488", strokeWidth: 2.5 }}
            onNodeDoubleClick={(_, node) => openConfig(node.id)}
          >
            <Background
              id="canvas-dots"
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.4}
              color="var(--canvas-dot)"
            />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#0D9488" maskColor="rgba(15,31,28,0.06)" />
            {nodes.length === 0 && (
              <Panel position="top-center" className="pointer-events-none !mt-16">
                <div className="pointer-events-auto max-w-md rounded-xl border border-border bg-white/95 px-5 py-4 text-center shadow-soft backdrop-blur settle">
                  <p className="brand text-xl text-accent">Start from the palette</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Add activities manually, or auto-build from a file after you set an analysis goal.
                  </p>
                  <input
                    ref={autoFileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) stageAutoPipelineFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={autoBuildBusy || historicView}
                      onClick={() => autoFileRef.current?.click()}
                    >
                      Auto-build from file…
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => addActivity("ingest.csv_excel", { x: 180, y: 160 })}
                    >
                      Add ingest only
                    </button>
                  </div>
                </div>
              </Panel>
            )}
          </ReactFlow>
          </div>
          <RunLogPanel
            open={runLogOpen && Boolean(run)}
            status={run?.status}
            currentLabel={currentRunLabel}
            lines={runLogLines}
            onClose={() => setRunLogOpen(false)}
          />
        </div>
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col border-l border-border bg-surface/80 backdrop-blur-md">
        <div className="px-4 pb-2 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Checks</h2>
            <span className="text-[10px] text-muted">
              {checkSummary.errors ? (
                <span className="text-danger">
                  {checkSummary.errors} error{checkSummary.errors === 1 ? "" : "s"}
                </span>
              ) : checkSummary.warnings ? (
                <span>
                  {checkSummary.warnings} note{checkSummary.warnings === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-success">Ready</span>
              )}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">Wiring and setup before you run</p>
        </div>
        <div className="mx-3 mb-3 max-h-[180px] overflow-y-auto rounded-xl border border-border bg-white/90 px-2 py-2">
          {flowIssues.length === 0 ? (
            <p className="px-1 py-1 text-[11px] leading-snug text-muted">
              No issues — wiring looks good.
            </p>
          ) : (
            <ul className="space-y-1">
              {flowIssues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    className={`palette-issue palette-issue--${issue.severity}`}
                    disabled={!issue.nodeId}
                    onClick={() => issue.nodeId && focusIssue(issue.nodeId)}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-3 pb-1 pt-3">
          <RunHistory
            runs={runHistory}
            selectedId={run?.id}
            nodeLabels={nodeIdLabels}
            onSelect={selectHistoricRun}
            onRefresh={() => void refreshRunHistory()}
            loading={historyLoading}
          />
        </div>

        <div className="border-t border-border px-4 pb-2 pt-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Results</h2>
          <p className="mt-0.5 text-xs text-muted">
            {historicView
              ? `Historic run output${run ? ` · ${run.status}` : ""}`
              : `Output for the selected run${run ? ` · ${run.status}` : ""}`}
          </p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-4 text-sm">
          {disclaimer && (
            <p className="rounded-xl bg-bg px-3 py-2 text-xs leading-relaxed text-muted">
              {disclaimer}
            </p>
          )}
          {!run && (
            <div className="rounded-2xl border border-dashed border-border bg-bg/50 px-3 py-4 text-xs leading-relaxed text-muted">
              Connect activities, run the flow, and charts or tables will appear here.
              Historic runs show under Run history.
            </div>
          )}
          {run && (
            <div className="rounded-2xl border border-border bg-white px-3 py-3 text-xs shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Status</span>
                <strong className="text-ink">{run.status}</strong>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-muted">Duration</span>
                <strong className="tabular-nums text-ink">
                  {activeRunDuration != null
                    ? formatDurationMs(activeRunDuration)
                    : "—"}
                </strong>
              </div>
              {failedActivityLabel && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-muted">Failed at</span>
                  <strong className="text-danger">{failedActivityLabel}</strong>
                </div>
              )}
              {run.errorMessage && (
                <div className="mt-2 rounded-lg bg-danger/10 px-2 py-1.5 text-danger">
                  {run.errorMessage}
                </div>
              )}
              {run.status === "FAILED" && run.failedBlockId && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary mt-2 w-full"
                  onClick={() => runFlow(run.failedBlockId ?? undefined)}
                >
                  Retry from failed step
                </button>
              )}
            </div>
          )}
          {resultFindings.charts.map((item) => (
            <div
              key={`chart-${item.blockId || item.label}`}
              className="rounded-2xl border border-border bg-white p-3 shadow-soft"
            >
              <h3 className="mb-2 text-sm font-semibold">
                {item.label}
                <span className="ml-1.5 text-[11px] font-normal text-muted">
                  chart
                </span>
              </h3>
              <MiniChart chart={item.chart} size="lg" interactive />
            </div>
          ))}
          {resultFindings.insights.map((item) => (
            <div
              key={`insight-${item.blockId || item.label}`}
              className="rounded-2xl border border-border bg-white p-3 shadow-soft"
            >
              <h3 className="mb-1 text-sm font-semibold">
                {item.label}
                <span className="ml-1.5 text-[11px] font-normal text-muted">
                  findings
                </span>
              </h3>
              {item.report ? (
                <AiInsightShowcase report={item.report} variant="panel" />
              ) : (
                <InsightCard
                  explanation={item.explanation}
                  lines={item.lines}
                />
              )}
            </div>
          ))}
          {selectedDownload?.table?.columns?.length ? (
            <div className="rounded-2xl border border-border bg-white p-3 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">Download table</h3>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {selectedDownload.table.rows.length} rows ·{" "}
                    {selectedDownload.table.columns.length} columns
                  </p>
                  {downloadableSteps.length > 1 ? (
                    <label className="mt-2 block text-[11px] text-muted">
                      Activity
                      <select
                        className="input mt-1 py-1 text-xs text-ink"
                        value={selectedDownload.blockId}
                        onChange={(e) => setDownloadStepId(e.target.value)}
                      >
                        {downloadableSteps.map((s) => (
                          <option key={s.blockId} value={s.blockId}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="mt-1 text-[11px] font-medium text-ink">
                      {selectedDownload.label}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary shrink-0"
                  onClick={downloadResultCsv}
                >
                  Download CSV
                </button>
              </div>
              <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-[10px]">
                  <thead className="sticky top-0 bg-bg text-muted">
                    <tr>
                      {selectedDownload.table.columns.slice(0, 6).map((c) => (
                        <th key={c} className="px-2 py-1.5 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDownload.table.rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {selectedDownload.table.columns.slice(0, 6).map((c) => (
                          <td key={c} className="max-w-[80px] truncate px-2 py-1 text-ink">
                            {row[c] == null ? "—" : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-muted">
                File downloads to your device. Run history keeps the table in Results for this
                flow run.
              </p>
            </div>
          ) : null}
        </div>
      </aside>

      {configNode && (
        <ActivityConfigWindow
          nodeId={configNode.id}
          data={configNode.data}
          onClose={() => setConfigNodeId(null)}
          onChangeConfig={onChangeConfig}
          onUploadFile={uploadToNode}
          readOnly={historicView}
          ancestors={configAncestors}
          onSelectSource={historicView ? undefined : onSelectSource}
        />
      )}
    </div>
  );
}

export function FlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
