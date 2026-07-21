import type { FlowEdge, FlowGraph, FlowNode } from "@/modules/blocks/domain/types";

export type FlowLayoutOptions = {
  startX?: number;
  startY?: number;
  /** Horizontal gap between node boxes (not centres). */
  hGap?: number;
  /** Vertical gap between sibling rows. */
  vGap?: number;
  /** Estimated activity height for stacking. */
  nodeHeight?: number;
};

/** Approximate canvas width so showcases / structure don't overlap. */
export function estimatedNodeWidth(type: string): number {
  if (type === "output.structure") return 280;
  if (
    type === "analyse.chart" ||
    type === "analyse.projection" ||
    type.startsWith("ai.")
  ) {
    return 340;
  }
  if (type === "analyse.stats" || type === "transform.aggregate") return 240;
  return 220;
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

  // Kahn with longest-path rank
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

  // Isolated / cycle leftovers
  for (const id of nodeIds) {
    if (!ranks.has(id)) ranks.set(id, 0);
  }
  return ranks;
}

/**
 * Left-to-right layered layout for pipeline graphs.
 * Reused by Auto Align on the canvas and the auto-pipeline builder.
 */
export function alignFlowGraph(
  graph: FlowGraph,
  options: FlowLayoutOptions = {},
): FlowGraph {
  const startX = options.startX ?? 72;
  const startY = options.startY ?? 100;
  const hGap = options.hGap ?? 72;
  const vGap = options.vGap ?? 56;
  const nodeHeight = options.nodeHeight ?? 160;

  if (!graph.nodes.length) return graph;

  const ids = graph.nodes.map((n) => n.id);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
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

  // Stable order within a layer: average predecessor order, then original index
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

  // Column x from cumulative max width per rank
  const rankX = new Map<number, number>();
  let cursorX = startX;
  for (const r of sortedRanks) {
    rankX.set(r, cursorX);
    const layer = layers.get(r)!;
    const maxW = Math.max(
      ...layer.map((id) => estimatedNodeWidth(byId.get(id)!.type)),
      220,
    );
    cursorX += maxW + hGap;
  }

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const r = ranks.get(n.id) ?? 0;
    const layer = layers.get(r) ?? [n.id];
    const index = layer.indexOf(n.id);
    const layerCount = layer.length;
    const stackHeight = layerCount * nodeHeight + Math.max(0, layerCount - 1) * vGap;
    const top = startY - stackHeight / 2 + nodeHeight / 2;
    return {
      ...n,
      x: rankX.get(r) ?? startX,
      y: top + index * (nodeHeight + vGap),
    };
  });

  // Keep edges as-is (ids / ports unchanged)
  const edges: FlowEdge[] = graph.edges.map((e) => ({ ...e }));
  return { nodes, edges };
}
