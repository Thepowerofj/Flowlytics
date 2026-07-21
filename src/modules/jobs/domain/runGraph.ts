import type { FlowGraph } from "@/modules/blocks/domain/types";

/** True when value looks like a persistable flow graph. */
export function isFlowGraph(value: unknown): value is FlowGraph {
  if (!value || typeof value !== "object") return false;
  const g = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(g.nodes) && Array.isArray(g.edges);
}

/**
 * Prefer the snapshot captured at enqueue. Fall back to the live flow graph
 * for older runs created before snapshots existed.
 */
export function graphForRun(
  run: { graphSnapshotJson?: unknown | null },
  flow: { graphJson: unknown },
): FlowGraph {
  if (isFlowGraph(run.graphSnapshotJson)) {
    return run.graphSnapshotJson;
  }
  if (isFlowGraph(flow.graphJson)) {
    return flow.graphJson;
  }
  return { nodes: [], edges: [] };
}
