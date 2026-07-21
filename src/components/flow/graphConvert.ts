import type { Edge, Node } from "@xyflow/react";
import type { FlowGraph } from "@/modules/blocks/domain/types";
import type { ActivityNodeData } from "./types";

export function flowGraphToRf(
  graph: FlowGraph,
  labels: Record<string, string>,
): { nodes: Node<ActivityNodeData>[]; edges: Edge[] } {
  const nodes: Node<ActivityNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "activity",
    position: { x: n.x, y: n.y },
    data: {
      blockType: n.type,
      label: labels[n.type] ?? n.type,
      config: n.config ?? {},
    },
  }));

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourcePort || "table",
    targetHandle: e.targetPort || "table",
    type: "smoothstep",
    animated: false,
  }));

  return { nodes, edges };
}

export function rfToFlowGraph(
  nodes: Node<ActivityNodeData>[],
  edges: Edge[],
): FlowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.blockType,
      x: n.position.x,
      y: n.position.y,
      config: n.data.config ?? {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourcePort: e.sourceHandle ?? "table",
      target: e.target,
      targetPort: e.targetHandle ?? "table",
    })),
  };
}
