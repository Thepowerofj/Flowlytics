import {
  columnLooksLikeDate,
  pickForecastMeasure,
} from "@/modules/analyse/domain/stats";
import type { TabularData } from "@/modules/blocks/domain/types";
import { profileTable, type DataProfile } from "@/modules/flows/domain/autoPipeline";

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

type AskIntent =
  | "forecast"
  | "compare"
  | "breakdown"
  | "rank"
  | "diagnose"
  | "trend"
  | "general";

type GoalSlots = {
  measure: boolean;
  horizon: boolean;
  cut: boolean;
  decision: boolean;
  period: boolean;
};

const SKIP_RE =
  /^(go\s*ahead|build|just\s*run|run\s*it|skip|proceed|start|yes\.?|ok\.?|okay\.?|do\s*it)$/i;

const MAX_QUESTIONS = 4;

export function wantsSkipClarify(message: string): boolean {
  const t = message.trim();
  if (SKIP_RE.test(t)) return true;
  if (/^(go ahead|build|run|skip|proceed)\b/i.test(t) && t.length < 80) {
    return true;
  }
  return false;
}

function detectIntent(goal: string): AskIntent {
  const g = goal.toLowerCase();
  if (/forecast|predict|project|outlook|what\s+if|scenario/.test(g)) {
    return "forecast";
  }
  if (/compar|vs\.?|versus|benchmark|against|difference/.test(g)) {
    return "compare";
  }
  if (/rank|top\s*\d*|bottom\s*\d*|best|worst|leader/.test(g)) {
    return "rank";
  }
  if (/break\s*down|by\s+\w+|segment|split|group|category|region|channel/.test(g)) {
    return "breakdown";
  }
  if (/why|root\s*cause|drop|decline|spike|anomaly|problem|risk|issue/.test(g)) {
    return "diagnose";
  }
  if (/trend|over\s+time|history|seasonal|pattern/.test(g)) {
    return "trend";
  }
  return "general";
}

function detectSlots(
  goal: string,
  table: TabularData | null | undefined,
  profile?: DataProfile,
): GoalSlots {
  const g = goal.toLowerCase();
  const measureHint =
    /(sales|revenue|amount|quantity|qty|profit|total|cost|margin|volume)/.test(
      g,
    ) ||
    Boolean(
      profile?.measureCol && g.includes(profile.measureCol.toLowerCase()),
    ) ||
    Boolean(
      table?.columns?.some(
        (c) =>
          !/id$/i.test(c) &&
          g.includes(c.toLowerCase()) &&
          profile?.numericCols.includes(c),
      ),
    );
  const horizon =
    /\b\d+\s*(months?|periods?|weeks?|days?|quarters?|years?)\b/.test(g) ||
    /\b(next|upcoming|this)\s+(month|quarter|year|week)\b/.test(g) ||
    /\b(ytd|mtd|qtd|to\s+date|historical\s+only|trends?\s+to\s+date)\b/.test(g);
  const cut =
    /\bby\s+\w+/.test(g) ||
    /\b(overall|totals?\s+only|no\s+breakdown|aggregate)\b/.test(g) ||
    Boolean(
      profile?.categoryCol && g.includes(profile.categoryCol.toLowerCase()),
    ) ||
    Boolean(
      profile?.categoricalCols.some((c) => g.includes(c.toLowerCase())),
    );
  const decision =
    /\b(decide|decision|action|budget|hire|cut|invest|priorit|board|exec|owner|manager|stakeholder)\b/.test(
      g,
    ) ||
    /\b(so\s+i\s+can|need\s+to|help\s+me)\b/.test(g);
  const period =
    horizon ||
    Boolean(
      table?.columns?.some(
        (c) => columnLooksLikeDate(table, c) && g.includes(c.toLowerCase()),
      ),
    );

  return {
    measure: measureHint,
    horizon,
    cut,
    decision,
    period,
  };
}

/** True when the message already specifies enough to build without asking. */
export function goalLooksComplete(
  message: string,
  table?: TabularData | null,
): boolean {
  const g = message.toLowerCase();
  const intent = detectIntent(message);
  const profile = table?.columns?.length
    ? profileTable(table, message)
    : undefined;
  const slots = detectSlots(message, table, profile);

  if (!table?.columns?.length) {
    return (
      intent !== "general" &&
      slots.decision &&
      message.trim().length >= 40
    );
  }

  const hasIntent = intent !== "general" || /analys|insight|report|summar/.test(g);
  if (!hasIntent || message.trim().length < 28) return false;

  // Forecast / trend need measure + horizon (or clear period)
  if (intent === "forecast" || intent === "trend") {
    return slots.measure && (slots.horizon || slots.period);
  }
  // Compare / breakdown / rank need measure + cut
  if (intent === "compare" || intent === "breakdown" || intent === "rank") {
    return slots.measure && slots.cut;
  }
  // Diagnose needs measure + some framing
  if (intent === "diagnose") {
    return slots.measure && (slots.cut || slots.decision || slots.horizon);
  }
  // General: need measure and either cut, horizon, or decision
  return slots.measure && (slots.cut || slots.horizon || slots.decision);
}

function intentLeadIn(intent: AskIntent, goal: string): string {
  const short = goal.trim().slice(0, 80);
  switch (intent) {
    case "forecast":
      return short
        ? `To forecast well from “${short}${goal.trim().length > 80 ? "…" : ""}”`
        : "To build a solid forecast";
    case "compare":
      return "To make the comparison useful";
    case "breakdown":
      return "To slice the data the way you care about";
    case "rank":
      return "To rank the right things";
    case "diagnose":
      return "To find what’s driving the change";
    case "trend":
      return "To read the trend correctly";
    default:
      return "To build a useful analysis pack";
  }
}

function buildQuestions(
  table: TabularData,
  goal: string,
  profile: DataProfile,
): ClarifyQuestion[] {
  const intent = detectIntent(goal);
  const slots = detectSlots(goal, table, profile);
  const measure =
    pickForecastMeasure(table, goal) || profile.measureCol || "";
  const category = profile.categoryCol;
  const cats = profile.categoricalCols
    .filter((c) => !/id$/i.test(c))
    .slice(0, 4);
  const numericOpts = [
    measure,
    ...profile.numericCols.filter((c) => c !== measure),
  ]
    .filter(Boolean)
    .slice(0, 4) as string[];

  const lead = intentLeadIn(intent, goal);
  const out: ClarifyQuestion[] = [];

  const push = (q: ClarifyQuestion) => {
    if (out.some((x) => x.id === q.id)) return;
    if (out.length >= MAX_QUESTIONS) return;
    out.push(q);
  };

  // 1) Measure — almost always if missing
  if (!slots.measure && numericOpts.length) {
    push({
      id: "measure",
      prompt:
        intent === "forecast" || intent === "trend"
          ? `${lead}, which number should we project?`
          : intent === "rank"
            ? `${lead}, what should we rank by?`
            : `${lead}, which value matters most?`,
      suggestions: numericOpts.length ? numericOpts : ["Sales", "Amount"],
    });
  }

  // 2) Horizon / time window — for forecast, trend, diagnose, or date-rich data
  const wantsHorizon =
    !slots.horizon &&
    (intent === "forecast" ||
      intent === "trend" ||
      intent === "diagnose" ||
      profile.dateCols.length > 0 ||
      /forecast|predict|trend|outlook|future/i.test(goal));
  if (wantsHorizon) {
    const periodHint = profile.periodCol
      ? ` (time field looks like **${profile.periodCol}**)`
      : "";
    push({
      id: "horizon",
      prompt:
        intent === "forecast"
          ? `${lead}, how far ahead should we look${periodHint}?`
          : intent === "diagnose"
            ? `What time window should we investigate${periodHint}?`
            : `What time window should the pack cover${periodHint}?`,
      suggestions:
        intent === "diagnose"
          ? [
              "Last 3 months vs prior 3",
              "Last 6 months",
              "Last 12 months",
              "Full history",
            ]
          : [
              "Next 3 months",
              "Next 6 months",
              "Next 12 months",
              "Trends to date only",
            ],
    });
  }

  // 3) Cut / comparison dimension
  if (!slots.cut) {
    if (intent === "compare") {
      const compareOpts =
        cats.length >= 2
          ? cats.slice(0, 3).map((c) => `Compare by ${c}`)
          : category
            ? [`Compare by ${category}`, "Overall only"]
            : ["By region / segment", "Overall totals only"];
      if (cats.length >= 2) {
        compareOpts.push(`Compare top ${cats[0]} vs others`);
      }
      push({
        id: "cut",
        prompt: `${lead}, what should we compare?`,
        suggestions: compareOpts.slice(0, 4),
      });
    } else if (intent === "rank" && category) {
      push({
        id: "cut",
        prompt: `${lead}, rank which entities?`,
        suggestions: [
          `Top ${category}`,
          `Bottom ${category}`,
          `Top 10 ${category}`,
          "Overall only",
        ],
      });
    } else if (category || cats.length) {
      const dim = category || cats[0]!;
      const more = cats.filter((c) => c !== dim).slice(0, 2);
      push({
        id: "cut",
        prompt:
          intent === "breakdown" || intent === "diagnose"
            ? `${lead}, which breakdown should we emphasise?`
            : `Any breakdown you care about (e.g. **${dim}**)?`,
        suggestions: [
          `By ${dim}`,
          ...more.map((c) => `By ${c}`),
          "Overall totals only",
          "Top performers only",
        ].slice(0, 4),
      });
    }
  }

  // 4) Decision / success outcome — fills vague goals and improves AI narrative
  if (!slots.decision && out.length < MAX_QUESTIONS) {
    const decisionSuggestions = (() => {
      switch (intent) {
        case "forecast":
          return [
            "Set next period targets",
            "Spot risk of missing plan",
            "Plan inventory / capacity",
            "Board-ready outlook",
          ];
        case "compare":
          return [
            "Pick a winner to double down on",
            "Find underperformers to fix",
            "Explain variance to stakeholders",
            "Reallocate budget",
          ];
        case "rank":
          return [
            "Focus effort on top performers",
            "Fix the bottom performers",
            "Shortlist for investment",
            "Share a leaderboard",
          ];
        case "diagnose":
          return [
            "Find root cause of the drop",
            "Confirm if the spike is real",
            "Prioritise what to fix first",
            "Brief the team with actions",
          ];
        case "breakdown":
          return [
            "See which segments drive results",
            "Find hidden pockets of growth",
            "Simplify the story for leadership",
            "Decide where to focus next",
          ];
        default:
          return [
            "Executive summary + next actions",
            "Risks & opportunities",
            "Forecast outlook",
            "What to do this month",
          ];
      }
    })();

    push({
      id: "decision",
      prompt:
        intent === "general"
          ? `${lead}, what decision should this help you make?`
          : `${lead}, what will you do with the answer?`,
      suggestions: decisionSuggestions,
    });
  }

  // 5) Quality / focus for diagnose when we still have room
  if (
    intent === "diagnose" &&
    !/\b(drop|decline|spike|increase|decrease|fall|rise)\b/i.test(goal) &&
    out.length < MAX_QUESTIONS
  ) {
    push({
      id: "signal",
      prompt: "What change are you most worried about?",
      suggestions: [
        "Unexpected drop",
        "Unexpected spike",
        "Missed target",
        "Uneven performance across segments",
      ],
    });
  }

  // If somehow empty (odd table), ask something useful
  if (!out.length) {
    push({
      id: "outcome",
      prompt: `${lead}, what should the pack emphasise?`,
      suggestions: [
        "Key insights + actions",
        "Forecast outlook",
        "Breakdown by segment",
        "Risks & opportunities",
      ],
    });
  }

  return out.slice(0, MAX_QUESTIONS);
}

export function buildClarifyPayload(
  table: TabularData,
  goal: string,
  fileName?: string,
  /** When `table` is a planning sample, pass the true file row count for the brief. */
  totalRowCount?: number,
): ClarifyPayload {
  const profile = profileTable(table, goal);
  const measure = pickForecastMeasure(table, goal) || profile.measureCol;
  const period = profile.periodCol;
  const category = profile.categoryCol;
  const intent = detectIntent(goal);
  const rowLabel = (totalRowCount ?? profile.rowCount).toLocaleString();

  const briefParts = [
    `**${fileName || "Dataset"}** · ${rowLabel} rows × ${profile.columnCount} columns`,
    profile.dateCols.length
      ? `Time fields: ${profile.dateCols.slice(0, 3).join(", ")}`
      : "No clear date column detected",
    measure
      ? `Likely measure: **${measure}**`
      : "No clear numeric measure yet (IDs are ignored)",
    category ? `Likely category: ${category}` : null,
    intent !== "general" ? `Detected intent: ${intent}` : null,
  ].filter(Boolean);

  const questions = buildQuestions(table, goal, profile);

  const suggestedGoal = [
    goal.trim() || "Analyse my data",
    measure ? `focus on ${measure}` : null,
    period ? `using ${period}` : null,
    category && detectIntent(goal) !== "general"
      ? `break down by ${category}`
      : null,
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 240);

  return {
    datasetBrief: briefParts.join("\n"),
    questions,
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
