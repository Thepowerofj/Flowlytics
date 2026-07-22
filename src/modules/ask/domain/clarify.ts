import {
  columnLooksLikeDate,
  pickForecastMeasure,
} from "@/modules/analyse/domain/stats";
import type { TabularData } from "@/modules/blocks/domain/types";
import { profileTable } from "@/modules/flows/domain/autoPipeline";

export type ClarifyQuestion = {
  id: string;
  prompt: string;
  /** Optional one-click answers shown as chips */
  suggestions: string[];
};

export type ClarifyPayload = {
  datasetBrief: string;
  questions: ClarifyQuestion[];
  suggestedGoal: string;
};

const SKIP_RE =
  /^(go\s*ahead|build|just\s*run|run\s*it|skip|proceed|start|yes\.?|ok\.?|okay\.?|do\s*it)$/i;

export function wantsSkipClarify(message: string): boolean {
  const t = message.trim();
  if (SKIP_RE.test(t)) return true;
  if (/^(go ahead|build|run|skip|proceed)\b/i.test(t) && t.length < 80) {
    return true;
  }
  return false;
}

/** True when the message already specifies enough to build without asking. */
export function goalLooksComplete(
  message: string,
  table?: TabularData | null,
): boolean {
  const g = message.toLowerCase();
  const hasHorizon = /\b\d+\s*(months?|periods?|weeks?|days?|quarters?)\b/.test(
    g,
  );
  const hasIntent =
    /forecast|predict|breakdown|compare|analys|trend|outlook|rank|top\b|by\s+\w+/.test(
      g,
    );
  if (!table?.columns?.length) {
    return hasIntent && message.trim().length >= 24;
  }
  const measure = pickForecastMeasure(table, message);
  const mentionsMeasure =
    Boolean(measure && g.includes(measure.toLowerCase())) ||
    /(sales|revenue|amount|quantity|qty|profit|total)/.test(g);
  const mentionsPeriod =
    hasHorizon ||
    table.columns.some(
      (c) => columnLooksLikeDate(table, c) && g.includes(c.toLowerCase()),
    );
  return hasIntent && (mentionsMeasure || mentionsPeriod) && message.trim().length >= 20;
}

export function buildClarifyPayload(
  table: TabularData,
  goal: string,
  fileName?: string,
): ClarifyPayload {
  const profile = profileTable(table, goal);
  const measure = pickForecastMeasure(table, goal) || profile.measureCol;
  const period = profile.periodCol;
  const category = profile.categoryCol;

  const briefParts = [
    `**${fileName || "Dataset"}** · ${profile.rowCount.toLocaleString()} rows × ${profile.columnCount} columns`,
    profile.dateCols.length
      ? `Time fields: ${profile.dateCols.slice(0, 3).join(", ")}`
      : "No clear date column detected",
    measure
      ? `Best value to analyse: **${measure}**`
      : "No clear numeric measure yet (IDs are ignored)",
    category ? `Category field: ${category}` : null,
  ].filter(Boolean);

  const questions: ClarifyQuestion[] = [];

  if (measure || profile.numericCols.length) {
    const opts = [
      measure,
      ...profile.numericCols.filter((c) => c !== measure),
    ]
      .filter(Boolean)
      .slice(0, 4) as string[];
    questions.push({
      id: "measure",
      prompt: "Which value should we focus on?",
      suggestions: opts.length ? opts : ["Sales", "Amount"],
    });
  }

  if (profile.dateCols.length || /forecast|predict|trend|outlook/i.test(goal)) {
    questions.push({
      id: "horizon",
      prompt: "How far ahead should we look?",
      suggestions: [
        "Next 3 months",
        "Next 6 months",
        "Next 12 months",
        "Just trends to date",
      ],
    });
  }

  if (category) {
    questions.push({
      id: "cut",
      prompt: "Any breakdown you care about?",
      suggestions: [`By ${category}`, "Overall totals only", "Top performers"],
    });
  } else {
    questions.push({
      id: "outcome",
      prompt: "What should the pack emphasise?",
      suggestions: [
        "Forecast outlook",
        "Key risks & opportunities",
        "Executive summary + actions",
      ],
    });
  }

  const suggestedGoal = [
    goal.trim() || "Analyse my data",
    measure ? `focus on ${measure}` : null,
    period ? `using ${period}` : null,
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 200);

  return {
    datasetBrief: briefParts.join("\n"),
    questions: questions.slice(0, 3),
    suggestedGoal,
  };
}

export function mergeGoalWithAnswers(
  originalGoal: string,
  answer: string,
  suggestedGoal?: string,
): string {
  const a = answer.trim();
  if (wantsSkipClarify(a)) {
    return (suggestedGoal || originalGoal).trim();
  }
  if (!originalGoal.trim()) return a;
  if (a.toLowerCase().includes(originalGoal.trim().toLowerCase())) return a;
  return `${originalGoal.trim()}. ${a}`.slice(0, 4000);
}
