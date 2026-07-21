import type { BlockDefinition } from "./domain/types";
import { ingestCsvExcelBlock } from "./definitions/ingestCsvExcel";
import { cleanMapBlock } from "./definitions/cleanMap";
import { aggregateBlock } from "./definitions/aggregate";
import { statsBlock } from "./definitions/stats";
import { chartBlock } from "./definitions/chart";
import { structureOutputBlock } from "./definitions/structureOutput";
import { aiStructureBlock } from "./definitions/aiStructure";
import { aiExplainBlock } from "./definitions/aiExplain";
import { aiAnalyseBlock } from "./definitions/aiAnalyse";
import { aiChartBlock } from "./definitions/aiChart";
import { projectionBlock } from "./definitions/projection";

const blocks: BlockDefinition[] = [
  ingestCsvExcelBlock,
  cleanMapBlock,
  aggregateBlock,
  statsBlock,
  chartBlock,
  structureOutputBlock,
  aiStructureBlock,
  aiExplainBlock,
  aiAnalyseBlock,
  aiChartBlock,
  projectionBlock,
];

const byType = new Map(blocks.map((b) => [b.type, b]));

export function listBlocks(): BlockDefinition[] {
  return blocks;
}

export function getBlock(type: string): BlockDefinition {
  const block = byType.get(type);
  if (!block) throw new Error(`Unknown block type: ${type}`);
  return block;
}

export function listBlockSummaries() {
  return blocks.map(({ type, label, description, category, requiresAiOptIn }) => ({
    type,
    label,
    description,
    category,
    requiresAiOptIn: Boolean(requiresAiOptIn),
  }));
}
