import type { TabularData } from "@/modules/blocks/domain/types";

export type ActivityNodeData = {
  blockType: string;
  label: string;
  config: Record<string, unknown>;
  runStatus?: "idle" | "pending" | "running" | "failed" | "succeeded";
  onChangeConfig?: (nodeId: string, patch: Record<string, unknown>) => void;
  onUploadFile?: (
    nodeId: string,
    file: File | null,
    options?: { sheet?: string; range?: string; fileId?: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }> | void;
  onOpenConfig?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  [key: string]: unknown;
};

export type BlockSummary = {
  type: string;
  label: string;
  description: string;
  category: string;
  requiresAiOptIn?: boolean;
};

export type RunStepState = {
  id: string;
  blockId: string;
  blockType: string;
  status: string;
  errorMessage?: string | null;
  /** Per-block full-run output (table/stats/chart) when the step succeeded. */
  outputJson?: Record<string, unknown> | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type RunState = {
  id: string;
  status: string;
  queuePosition?: number | null;
  etaSeconds?: number | null;
  failedBlockId?: string | null;
  errorMessage?: string | null;
  resultJson?: Record<string, unknown> | null;
  /** Pipeline graph frozen at enqueue time (nodes/edges/config). */
  graphSnapshotJson?: {
    nodes: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      sourcePort?: string;
      target: string;
      targetPort?: string;
    }>;
  } | null;
  currentBlockId?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  steps?: RunStepState[];
};

export function tablePreview(config: Record<string, unknown>): TabularData | null {
  const table = config.table as TabularData | undefined;
  if (
    !table ||
    !Array.isArray(table.columns) ||
    !table.columns.length ||
    !Array.isArray(table.rows)
  ) {
    return null;
  }
  return table;
}
