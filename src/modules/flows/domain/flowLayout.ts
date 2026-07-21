import type { FlowEdge, FlowGraph, FlowNode } from "@/modules/blocks/domain/types";

export type NodeSize = { width: number; height: number };

export type FlowLayoutOptions = {
  startX?: number;
  startY?: number;
  /** Horizontal gap between node boxes (not centres). */
  hGap?: number;
  /** Vertical gap between sibling rows. */
  vGap?: number;
  /**
   * Live / measured sizes from the canvas (React Flow `measured` / `width`/`height`).
   * When present these win over config estimates.
   */
  sizes?: Record<string, Partial<NodeSize>>;
};

/** Match ActivityNode defaults for expanded showcases. */
export const SHOWCASE_SIZES = {
  compact: { width: 220, height: 168 },
  wide: { width: 260, height: 180 },
  structure: { width: 280, height: 260 },
  structureFilled: { width: 280, height: 340 },
  stats: { width: 340, height: 340 },
  chart: { width: 480, height: 420 },
  forecast: { width: 480, height: 440 },
  aiInsight: { width: 440, height: 400 },
  aiCompact: { width: 220, height: 156 },
  aggregate: { width: 240, height: 176 },
} as const;

function hasTablePreview(config: Record<string, unknown>): boolean {
  const table = config.table as { columns?: unknown[] } | null | undefined;
  return Boolean(table?.columns && table.columns.length > 0);
}

function hasChartContent(config: Record<string, unknown>): boolean {
  if (hasTablePreview(config)) return true;
  const run = config._runChart as { points?: unknown[] } | undefined;
  return Boolean(run?.points && run.points.length > 0);
}

function hasAiInsightContent(config: Record<string, unknown>): boolean {
  if (config.insightReport && typeof config.insightReport === "object") return true;
  if (typeof config.explanation === "string" && config.explanation.trim()) return true;
  if (Array.isArray(config.insights) && config.insights.length > 0) return true;
  const table = config.table as { columns?: unknown[]; rows?: unknown[] } | undefined;
  // Structured findings table from Analyse/Explain
  if (table?.columns?.includes("title") && (table.rows?.length ?? 0) > 0) return true;
  return false;
}

/**
 * Estimate on-canvas footprint. Showcase activities grow when they have
 * table / chart / insight content — layout must reserve that space.
 */
export function estimateNodeSize(node: Pick<FlowNode, "type" | "config">): NodeSize {
  const config = (node.config ?? {}) as Record<string, unknown>;
  const savedW = Number(config.nodeWidth);
  const savedH = Number(config.nodeHeight);
  const hasSaved =
    Number.isFinite(savedW) &&
    savedW > 0 &&
    Number.isFinite(savedH) &&
    savedH > 0;

  const type = node.type;

  if (type === "analyse.chart") {
    if (hasChartContent(config)) {
      return hasSaved
        ? { width: savedW, height: savedH }
        : { ...SHOWCASE_SIZES.chart };
    }
    return { ...SHOWCASE_SIZES.compact };
  }

  if (type === "analyse.projection") {
    if (hasChartContent(config)) {
      return hasSaved
        ? { width: savedW, height: savedH }
        : { ...SHOWCASE_SIZES.forecast };
    }
    return { ...SHOWCASE_SIZES.compact };
  }

  if (type === "analyse.stats") {
    if (hasTablePreview(config)) {
      return hasSaved
        ? { width: savedW, height: savedH }
        : { ...SHOWCASE_SIZES.stats };
    }
    return { ...SHOWCASE_SIZES.compact };
  }

  if (type === "ai.analyse" || type === "ai.explain") {
    if (hasAiInsightContent(config)) {
      return hasSaved
        ? { width: savedW, height: savedH }
        : { ...SHOWCASE_SIZES.aiInsight };
    }
    return { ...SHOWCASE_SIZES.aiCompact };
  }

  if (type === "output.structure") {
    const cols =
      (config.selectedColumns as string[] | undefined)?.length ||
      (config._sourceColumns as string[] | undefined)?.length ||
      0;
    return cols > 0
      ? { ...SHOWCASE_SIZES.structureFilled }
      : { ...SHOWCASE_SIZES.structure };
  }

  if (type === "transform.aggregate") {
    return { ...SHOWCASE_SIZES.aggregate };
  }

  if (type === "transform.clean_map" && hasTablePreview(config)) {
    // Compact card, but a bit taller when column casts are seeded
    return { width: 220, height: 188 };
  }

  if (type === "ingest.csv_excel" && hasTablePreview(config)) {
    return { width: 220, height: 176 };
  }

  return { ...SHOWCASE_SIZES.compact };
}

/** @deprecated use estimateNodeSize — kept for call sites/tests */
export function estimatedNodeWidth(type: string, config?: Record<string, unknown>): number {
  return estimateNodeSize({ type, config: config ?? {} }).width;
}

export function estimatedNodeHeight(type: string, config?: Record<string, unknown>): number {
  return estimateNodeSize({ type, config: config ?? {} }).height;
}

function resolveSize(
  node: FlowNode,
  overrides?: Record<string, Partial<NodeSize>>,
): NodeSize {
  const estimated = estimateNodeSize(node);
  const o = overrides?.[node.id];
  const width =
    o?.width && o.width > 0 ? o.width : estimated.width;
  const height =
    o?.height && o.height > 0 ? o.height : estimated.height;
  return { width, height };
}

function longestPathRanks(
  nodeIds: string[],
  outgoing: Map<string, string[]>,
  incomingCount: Map<string, number>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const indeg = new Map(incomingCount);
  const queue = nodeIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  for (const id of queue) ranks.set(id, 0);

  const q = [...queue];
  while (q.length) {
    const id = q.shift()!;
    const rank = ranks.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      const nextRank = Math.max(ranks.get(next) ?? 0, rank + 1);
      ranks.set(next, nextRank);
      const left = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, left);
      if (left === 0) q.push(next);
    }
  }

  for (const id of nodeIds) {
    if (!ranks.has(id)) ranks.set(id, 0);
  }
  return ranks;
}

/**
 * Left-to-right layered layout for pipeline graphs.
 * Uses per-node width/height (showcase content + optional live measurements)
 * so expanded chart/stats/AI activities do not overlap.
 */
export function alignFlowGraph(
  graph: FlowGraph,
  options: FlowLayoutOptions = {},
): FlowGraph {
  const startX = options.startX ?? 72;
  const startY = options.startY ?? 120;
  const hGap = options.hGap ?? 96;
  const vGap = options.vGap ?? 72;

  if (!graph.nodes.length) return graph;

  const ids = graph.nodes.map((n) => n.id);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const sizeById = new Map(
    graph.nodes.map((n) => [n.id, resolveSize(n, options.sizes)] as const),
  );

  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const id of ids) {
    outgoing.set(id, []);
    incomingCount.set(id, 0);
  }
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  }

  const ranks = longestPathRanks(ids, outgoing, incomingCount);
  const layers = new Map<number, string[]>();
  for (const id of ids) {
    const r = ranks.get(id) ?? 0;
    const list = layers.get(r) ?? [];
    list.push(id);
    layers.set(r, list);
  }

  const originalIndex = new Map(ids.map((id, i) => [id, i]));
  const sortedRanks = [...layers.keys()].sort((a, b) => a - b);
  const orderInLayer = new Map<string, number>();

  for (const r of sortedRanks) {
    const layer = layers.get(r)!;
    layer.sort((a, b) => {
      const predsA = graph.edges
        .filter((e) => e.target === a)
        .map((e) => orderInLayer.get(e.source) ?? originalIndex.get(e.source) ?? 0);
      const predsB = graph.edges
        .filter((e) => e.target === b)
        .map((e) => orderInLayer.get(e.source) ?? originalIndex.get(e.source) ?? 0);
      const avgA = predsA.length
        ? predsA.reduce((s, n) => s + n, 0) / predsA.length
        : originalIndex.get(a) ?? 0;
      const avgB = predsB.length
        ? predsB.reduce((s, n) => s + n, 0) / predsB.length
        : originalIndex.get(b) ?? 0;
      if (avgA !== avgB) return avgA - avgB;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    });
    layer.forEach((id, i) => orderInLayer.set(id, i));
  }

  // Column x from cumulative max *actual* width per rank
  const rankX = new Map<number, number>();
  let cursorX = startX;
  for (const r of sortedRanks) {
    rankX.set(r, cursorX);
    const layer = layers.get(r)!;
    const maxW = Math.max(
      ...layer.map((id) => sizeById.get(id)!.width),
      SHOWCASE_SIZES.compact.width,
    );
    cursorX += maxW + hGap;
  }

  // Midline so single-node columns share a vertical centre (handles line up)
  let maxStack = 0;
  for (const r of sortedRanks) {
    const layer = layers.get(r)!;
    const stack =
      layer.reduce((s, id) => s + sizeById.get(id)!.height, 0) +
      Math.max(0, layer.length - 1) * vGap;
    maxStack = Math.max(maxStack, stack);
  }
  const midline = startY + maxStack / 2;

  const position = new Map<string, { x: number; y: number }>();
  for (const r of sortedRanks) {
    const layer = layers.get(r)!;
    const heights = layer.map((id) => sizeById.get(id)!.height);
    const stackH =
      heights.reduce((s, h) => s + h, 0) + Math.max(0, layer.length - 1) * vGap;
    let y = midline - stackH / 2;
    const x = rankX.get(r) ?? startX;
    for (let i = 0; i < layer.length; i++) {
      const id = layer[i]!;
      position.set(id, { x, y });
      y += heights[i]! + vGap;
    }
  }

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const pos = position.get(n.id) ?? { x: startX, y: startY };
    const size = sizeById.get(n.id)!;
    const cfg = (n.config ?? {}) as Record<string, unknown>;
    // Persist showcase footprint so RF remounts at the reserved size
    const persistShowcase =
      ((n.type === "analyse.chart" || n.type === "analyse.projection") &&
        hasChartContent(cfg)) ||
      (n.type === "analyse.stats" && hasTablePreview(cfg)) ||
      ((n.type === "ai.analyse" || n.type === "ai.explain") &&
        hasAiInsightContent(cfg));

    return {
      ...n,
      x: pos.x,
      y: pos.y,
      config: persistShowcase
        ? {
            ...n.config,
            nodeWidth: Math.round(size.width),
            nodeHeight: Math.round(size.height),
          }
        : n.config,
    };
  });

  const edges: FlowEdge[] = graph.edges.map((e) => ({ ...e }));
  return { nodes, edges };
}
