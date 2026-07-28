import type { FlowGraph } from "@/modules/blocks/domain/types";

export function retryHydrationPlan(input: {
  graph: FlowGraph;
  fullOrder: string[];
  retryFromBlockId?: string | null;
  availableOutputIds: Iterable<string>;
}): { order: string[]; upstreamIds: string[]; hydrated: boolean } {
  const retryFrom = input.retryFromBlockId;
  const retryIdx = retryFrom ? input.fullOrder.indexOf(retryFrom) : -1;
  if (!retryFrom || retryIdx < 0) {
    return { order: input.fullOrder, upstreamIds: [], hydrated: false };
  }

  const upstreamIds = input.fullOrder.slice(0, retryIdx);
  const available = new Set(input.availableOutputIds);
  const canHydrate = input.graph.edges.every((edge) => {
    const sourceIdx = input.fullOrder.indexOf(edge.source);
    const targetIdx = input.fullOrder.indexOf(edge.target);
    if (sourceIdx < retryIdx && targetIdx >= retryIdx) {
      return available.has(edge.source);
    }
    return true;
  });

  return {
    order: canHydrate ? input.fullOrder.slice(retryIdx) : input.fullOrder,
    upstreamIds,
    hydrated: canHydrate,
  };
}
