/**
 * Keep Ask / LLM prompts inside a safe size so JSON.stringify and model calls
 * never blow the call stack on huge conversation or table blobs.
 */

import {
  columnLooksLikeDate,
  pickForecastMeasure,
} from "@/modules/analyse/domain/stats";
import type { TabularData } from "@/modules/blocks/domain/types";
import { profileTable } from "@/modules/flows/domain/autoPipeline";
import { isStackOverflowError } from "@/shared/lib/json";

const MAX_MSG_CHARS = 220;
const MAX_CONTEXT_CHARS = 1200;
const MAX_SUMMARY_CHARS = 700;
const MAX_META_CHARS = 700;

export type ChatTurn = {
  role: string;
  content: string;
  meta?: { kind?: string } | null;
};

/** Compact dataset card for LLM follow-ups — no row dumps / attachment history. */
export function buildDatasetMetaSummary(
  table: TabularData,
  opts?: { fileName?: string; totalRowCount?: number; goal?: string },
): string {
  const profile = profileTable(table, opts?.goal);
  const measure =
    pickForecastMeasure(table, opts?.goal) || profile.measureCol || "";
  const rows = opts?.totalRowCount ?? profile.rowCount;
  const dateHint = profile.dateCols[0]
    ? profile.dateCols[0]
    : table.columns.find((c) => columnLooksLikeDate(table, c)) || "";

  const lines = [
    `File: ${opts?.fileName || "Dataset"}`,
    `Shape: ${rows.toLocaleString()} rows × ${profile.columnCount} columns`,
    `Columns: ${table.columns.slice(0, 16).join(", ")}${
      table.columns.length > 16 ? "…" : ""
    }`,
    measure ? `Primary measure: ${measure}` : null,
    profile.numericCols.length
      ? `Numeric: ${profile.numericCols.slice(0, 8).join(", ")}`
      : null,
    dateHint ? `Time field: ${dateHint}` : null,
    profile.categoryCol ? `Category: ${profile.categoryCol}` : null,
    "Use this metadata for follow-up questions — do not replay the raw file.",
  ].filter(Boolean);

  return lines.join("\n").slice(0, MAX_META_CHARS);
}

function turnStub(t: ChatTurn): string | null {
  const kind = t.meta?.kind;
  // Never re-send clarify briefs / attachment dumps / recovery blobs into the LLM
  if (kind === "clarify") {
    return t.role === "assistant"
      ? "Assistant: Asked clarifying questions about the dataset."
      : null;
  }
  if (kind === "clarify_ack") return null;
  if (kind === "stack_recovery" || kind === "stack_recovery_failed") return null;
  if (kind === "dataset_meta") return null;
  if (kind === "auto_heal") {
    return "Assistant: Adjusted the pipeline after a step error and continued.";
  }
  if (kind === "run_progress") {
    return "Assistant: Built and queued the analysis pipeline.";
  }
  if (kind === "run_result") {
    const text = t.content.replace(/\s+/g, " ").trim().slice(0, 160);
    return text ? `Assistant (result): ${text}` : "Assistant: Shared analysis results.";
  }

  const text = t.content.replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Drop long dataset briefs that leaked into plain content
  if (
    /\d[\d\s]*rows\s*[×x]\s*\d+\s*columns/i.test(text) &&
    text.length > 280
  ) {
    return t.role === "user"
      ? `User: ${text.slice(0, 120)}…`
      : "Assistant: Summarised the attached dataset.";
  }
  const clipped = text.slice(0, MAX_MSG_CHARS);
  return t.role === "user" ? `User: ${clipped}` : `Assistant: ${clipped}`;
}

/** Compact newest-focus digest — skips file history / clarify dumps. */
export function summarizeConversation(turns: ChatTurn[]): string {
  if (!turns.length) return "";

  const newest = [...turns].slice(-10);
  const bullets: string[] = [];
  let goals = "";
  let nextSteps = "";

  for (const t of newest) {
    if (t.role === "user") {
      const text = t.content.replace(/\s+/g, " ").trim().slice(0, MAX_MSG_CHARS);
      if (text) goals = text;
    }
    if (t.role === "assistant" && /next\s*step|recommend|action/i.test(t.content)) {
      nextSteps = t.content.replace(/\s+/g, " ").trim().slice(0, 180);
    }
    const stub = turnStub(t);
    if (stub) bullets.push(stub);
  }

  const header = [
    goals ? `Latest goal: ${goals}` : null,
    nextSteps ? `Next steps: ${nextSteps}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = bullets.slice(-5).join("\n");
  const out = [header, body ? `Recent turns:\n${body}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_SUMMARY_CHARS);

  return out.slice(0, MAX_CONTEXT_CHARS);
}

/** Combine durable dataset metadata + short chat digest for LLM prompts. */
export function buildLlmContext(input: {
  turns: ChatTurn[];
  datasetMeta?: string | null;
  /** Follow-up turns: keep context tighter */
  followUp?: boolean;
}): string {
  const meta = (input.datasetMeta || "").trim().slice(0, MAX_META_CHARS);
  const chat = summarizeConversation(input.turns).slice(
    0,
    input.followUp ? 500 : MAX_SUMMARY_CHARS,
  );
  return [meta ? `DATASET METADATA:\n${meta}` : null, chat || null]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
}

/**
 * Tight recovery summary when stack overflow hits — newest goal, data, next steps only.
 */
export function summarizeForStackRecovery(
  turns: ChatTurn[],
  extras?: { goal?: string; fileName?: string; steps?: string[]; datasetMeta?: string },
): string {
  const base = summarizeConversation(turns).slice(0, 500);
  const lines = [
    extras?.datasetMeta
      ? `DATASET METADATA:\n${extras.datasetMeta.slice(0, 400)}`
      : null,
    extras?.goal ? `Newest goal: ${extras.goal.slice(0, 240)}` : null,
    extras?.fileName ? `Data file: ${extras.fileName}` : null,
    extras?.steps?.length
      ? `Pipeline steps: ${extras.steps.slice(0, 12).join(" → ")}`
      : null,
    base || null,
    "Prefer metadata over any older raw thread or full table dump.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
}

export { isStackOverflowError };
export { safeJsonSlice } from "@/shared/lib/json";
