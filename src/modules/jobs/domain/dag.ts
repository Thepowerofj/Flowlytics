import type { FlowGraph } from "@/modules/blocks/domain/types";

export function topologicalOrder(graph: FlowGraph): string[] {
  const indegree = new Map<string, number>();
  const edges = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    edges.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    edges.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of edges.get(id) ?? []) {
      const d = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== graph.nodes.length) {
    throw new Error("Flow has a cycle; connect blocks as an acyclic graph.");
  }
  return order;
}

export function inputsForNode(
  graph: FlowGraph,
  nodeId: string,
  outputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const edge of graph.edges.filter((e) => e.target === nodeId)) {
    const from = outputs.get(edge.source);
    if (from && edge.sourcePort in from) {
      inputs[edge.targetPort] = from[edge.sourcePort];
    }
  }
  return inputs;
}
