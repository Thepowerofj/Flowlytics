import type { TabularData } from "@/modules/blocks/domain/types";
import { displayDatasetLabel } from "./DatasetNameField";
import { previewOutputTable } from "./previewPipeline";

export type AncestorSource = {
  id: string;
  label: string;
  /** Activity kind label (Clean / Map, Aggregate, …) for the picker subtitle. */
  kindLabel: string;
  blockType: string;
  datasetName: string;
};

type NodeLike = {
  id: string;
  data: {
    blockType: string;
    label: string;
    config: Record<string, unknown>;
  };
};

type EdgeLike = { id?: string; source: string; target: string };

/** All ancestors of target (BFS over incoming edges), nearest-first, excluding self. */
export function listAncestorSources(
  nodes: NodeLike[],
  edges: EdgeLike[],
  targetId: string,
): AncestorSource[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(targetId)) return [];

  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.target) ?? [];
    list.push(e.source);
    incoming.set(e.target, list);
  }

  const ordered: AncestorSource[] = [];
  const seen = new Set<string>();
  const queue = [...(incoming.get(targetId) ?? [])];

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || id === targetId) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    const kindLabel = node.data.label || node.data.blockType;
    const datasetName =
      typeof node.data.config.datasetName === "string"
        ? node.data.config.datasetName.trim()
        : "";
    ordered.push({
      id: node.id,
      label: displayDatasetLabel(kindLabel, node.data.config),
      kindLabel,
      blockType: node.data.blockType,
      datasetName,
    });
    for (const parent of incoming.get(id) ?? []) {
      if (!seen.has(parent)) queue.push(parent);
    }
  }

  return ordered;
}

export function isAncestorOf(
  nodes: NodeLike[],
  edges: EdgeLike[],
  ancestorId: string,
  targetId: string,
): boolean {
  return listAncestorSources(nodes, edges, targetId).some((a) => a.id === ancestorId);
}

/** Preview table emitted by an ancestor activity (post clean/aggregate when relevant). */
export function resolveAncestorPreviewTable(
  node: NodeLike | undefined,
): TabularData | null {
  if (!node) return null;
  // Prefer full-run output for transform / AI structure steps
  const runOut = node.data.config._runOutputTable as TabularData | undefined;
  if (
    (node.data.blockType === "transform.clean_map" ||
      node.data.blockType === "transform.aggregate" ||
      node.data.blockType === "ai.structure") &&
    runOut?.columns?.length
  ) {
    return runOut;
  }
  return previewOutputTable(node.data.blockType, node.data.config);
}

/** Rewire single inbound edge so sourceNodeId → targetId. */
export function rewireInboundSource<T extends EdgeLike>(
  edges: T[],
  targetId: string,
  sourceNodeId: string,
  newEdgeId: string,
): T[] {
  const without = edges.filter((e) => e.target !== targetId);
  const template = edges.find((e) => e.target === targetId);
  const next = {
    ...(template ?? {}),
    id: newEdgeId,
    source: sourceNodeId,
    target: targetId,
  } as T;
  return [...without, next];
}
