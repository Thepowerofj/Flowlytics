import { getEnv } from "@/shared/config/env";
import { AppError } from "@/shared/lib/errors";

export type LlmCallOptions = {
  /** User bring-your-own key (preferred). */
  apiKey?: string;
  /** Prefer JSON object responses when the provider supports it. */
  json?: boolean;
};

function stubReply(prompt: string): string {
  if (/chartType|best chart/i.test(prompt)) {
    return JSON.stringify({
      chartType: "bar",
      xColumn: "category",
      yColumn: "value",
      reason: "Stub suggestion: compare categories with a bar chart.",
    });
  }
  if (/Extract a JSON|columns.*rows|messy|spreadsheet table/i.test(prompt)) {
    // Honour schema names when present in the prompt
    const schemaMatch = prompt.match(/"name":"([^"]+)"/g);
    if (schemaMatch?.length) {
      const columns = schemaMatch.map((m) => m.replace(/"name":"|"/g, ""));
      const row: Record<string, string | number> = {};
      for (const c of columns) {
        row[c] =
          /amount|qty|value|total|price/i.test(c) ? 42 : `Sample ${c}`;
      }
      return JSON.stringify({
        columns,
        rows: [row, { ...row, ...(columns[0] ? { [columns[0]]: "Sample B" } : {}) }],
      });
    }
    return JSON.stringify({
      columns: ["item", "value"],
      rows: [
        { item: "Sample A", value: 120 },
        { item: "Sample B", value: 85 },
      ],
    });
  }
  if (/headline|findings|nextSteps|PRECOMPUTED FINDINGS|Explain these spreadsheet/i.test(prompt)) {
    return JSON.stringify({
      headline: "Stub read-out · connect your API key for live AI",
      summary:
        "This is a structured demo insight so you can preview the canvas layout without a live model.",
      confidence: "medium",
      findings: [
        {
          kind: "metric",
          title: "Sample metric",
          detail: "Your real numbers will appear here after Run with an API key.",
          metric: "—",
          priority: "medium",
        },
        {
          kind: "finding",
          title: "What stands out",
          detail: "AI Analyse turns stats into ranked findings you can act on.",
          priority: "high",
        },
        {
          kind: "opportunity",
          title: "Try next",
          detail: "Wire Chart or Forecast after this step — the insights table is structured for downstream use.",
          priority: "medium",
        },
      ],
      nextSteps: [
        "Add your API key in Settings for live model output",
        "Chart a numeric column or forecast a time series",
      ],
    });
  }
  return JSON.stringify({
    explanation:
      "• Stub AI insight (dev). Add your API key in Settings for live model output.\n• Next step: Chart or Forecast, then Run.",
  });
}

export async function callLlm(
  prompt: string,
  options: LlmCallOptions = {},
): Promise<string> {
  const env = getEnv();
  if (!env.LLM_ENABLED) {
    throw new AppError("LLM is disabled", "LLM_DISABLED", 503);
  }

  const apiKey = (options.apiKey || "").trim();
  if (!apiKey) {
    // Optional local stub for offline demos — not used when users supply a key
    if (process.env.LLM_DEV_STUB === "true" || process.env.LLM_DEV_STUB === "1") {
      return stubReply(prompt);
    }
    throw new AppError(
      "Add your OpenAI-compatible API key in Settings to use AI",
      "NEED_LLM_KEY",
      400,
    );
  }

  const body: Record<string, unknown> = {
    model: env.LLM_MODEL,
    messages: [
      {
        role: "system",
        content: options.json
          ? "You help small-business users analyse spreadsheet data. Reply with valid JSON only — no markdown fences."
          : "You help small-business users analyse spreadsheet data. Be concise.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  };
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: { message?: string } };
      detail = errBody.error?.message ? `: ${errBody.error.message}` : "";
    } catch {
      /* ignore */
    }
    throw new AppError(
      `LLM provider error: ${res.status}${detail}`,
      "LLM_ERROR",
      502,
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}
