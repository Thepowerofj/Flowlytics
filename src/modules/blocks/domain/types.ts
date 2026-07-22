export type TabularData = {
  columns: string[];
  rows: Record<string, string | number | null>[];
};

export type BlockPort = {
  id: string;
  label: string;
  dataType: "table" | "text" | "any";
};

export type BlockContext = {
  userId: string;
  runId: string;
  optInAi: boolean;
  /** Present when LLM is enabled; uses the user's BYOK key. */
  callLlm?: (
    prompt: string,
    options?: { json?: boolean },
  ) => Promise<string>;
  /** Legacy wallet debit (optional — AI no longer requires it). */
  debitWallet?: (amount: number, reason: string) => Promise<void>;
  aiCreditCost: number;
  /** True when the user has saved an LLM API key. */
  hasLlmKey?: boolean;
};

/** Client-safe block metadata (no `run` — safe for browser bundles). */
export type BlockMeta = {
  type: string;
  label: string;
  description: string;
  category: "ingest" | "transform" | "analyse" | "ai" | "output";
  inputs: BlockPort[];
  outputs: BlockPort[];
  defaultConfig: Record<string, unknown>;
  requiresAiOptIn?: boolean;
};

export type BlockDefinition = BlockMeta & {
  run: (
    config: Record<string, unknown>,
    inputs: Record<string, unknown>,
    ctx: BlockContext,
  ) => Promise<Record<string, unknown>>;
};

export type FlowNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
};

export type FlowEdge = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
};

export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};
