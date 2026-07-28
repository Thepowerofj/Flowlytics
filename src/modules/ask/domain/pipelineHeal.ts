/**
 * Map Ask pipeline run failures → automatic heal hints for a corrected replan.
 */

export type PipelineHealHint = {
  disableForecast?: boolean;
  disableAi?: boolean;
  disablePresentation?: boolean;
  acknowledgePii?: boolean;
  /** Human-readable note for logs / quiet chat meta (not shown as an error) */
  reason: string;
};

const MAX_HEAL_ATTEMPTS = 2;

export function maxHealAttempts(): number {
  return MAX_HEAL_ATTEMPTS;
}

/**
 * Infer a corrective heal from the failed block + error text.
 * Returns null when we should not auto-retry (unknown / unsafe).
 */
export function healHintFromFailure(input: {
  errorMessage?: string | null;
  failedBlockType?: string | null;
  priorHealCount?: number;
}): PipelineHealHint | null {
  const prior = input.priorHealCount ?? 0;
  if (prior >= MAX_HEAL_ATTEMPTS) return null;

  const msg = (input.errorMessage || "").toLowerCase();
  const type = input.failedBlockType || "";

  if (/personal-data|pii|acknowledge/i.test(msg) || /pii/i.test(type)) {
    return {
      acknowledgePii: true,
      reason: "Acknowledged personal-data warning and retrying",
    };
  }

  if (
    type === "analyse.projection" ||
    /forecast|projection|history points|numeric measure|period labels/i.test(msg)
  ) {
    return {
      disableForecast: true,
      reason: "Forecast step failed — switched to chart + analysis path",
    };
  }

  if (
    type.startsWith("ai.") ||
    /llm|api key|openai|model|ai analyse|ai explain|ai runtime|opt-in/i.test(
      msg,
    )
  ) {
    return {
      disableAi: true,
      disablePresentation: prior > 0,
      reason: "AI step failed — continuing without AI blocks",
    };
  }

  if (
    type === "output.presentation" ||
    /presentation|pptx|pdf|slide/i.test(msg)
  ) {
    return {
      disablePresentation: true,
      reason: "Presentation step failed — exporting without deck block",
    };
  }

  if (
    type === "transform.aggregate" ||
    /aggregate|group by|groupby/i.test(msg)
  ) {
    return {
      disableForecast: true,
      reason: "Aggregate step failed — using a simpler explore path",
    };
  }

  if (type === "analyse.chart" || /chart|chartable/i.test(msg)) {
    return {
      disableForecast: true,
      disableAi: prior > 0,
      reason: "Chart step failed — simplifying the pipeline",
    };
  }

  if (type === "ingest.csv_excel" || /no ingested table|upload a csv/i.test(msg)) {
    // Can't heal missing data automatically
    return null;
  }

  // Second-chance generic heal: strip AI + forecast + deck
  if (prior === 0 && type) {
    return {
      disableForecast: true,
      disableAi: true,
      disablePresentation: true,
      reason: "Pipeline step failed — retrying with a safer simplified path",
    };
  }

  return null;
}

/** Apply heal flags onto a goal string so planners that key off text stay consistent. */
export function goalWithHealHints(
  goal: string,
  hint: PipelineHealHint,
): string {
  const bits = [goal.trim()];
  if (hint.disableForecast) bits.push("skip forecast use charts only");
  if (hint.disableAi) bits.push("no AI");
  if (hint.disablePresentation) bits.push("no presentation deck");
  return bits.filter(Boolean).join(". ").slice(0, 500);
}
