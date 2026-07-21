import {
  buildStructurePrompt,
  buildStructureRawInput,
  inferSchemaFromTable,
  normalizeOutputColumns,
  normalizeStructuredTable,
  parseLlmJson,
  previewTableFromSchema,
  type OutputColumnSpec,
} from "@/modules/ai/domain/structuredOutput";
import type { BlockDefinition, TabularData } from "../domain/types";

export const aiStructureBlock: BlockDefinition = {
  type: "ai.structure",
  label: "AI Structure Data",
  description:
    "Turn messy upstream data or notes into a named table (opt-in, your API key)",
  category: "ai",
  requiresAiOptIn: true,
  inputs: [
    { id: "table", label: "Table", dataType: "table" },
    { id: "text", label: "Text", dataType: "text" },
  ],
  outputs: [{ id: "table", label: "Table", dataType: "table" }],
  defaultConfig: {
    aiOptIn: false,
    rawText: "",
    /** When true, AI must use the builder columns; when false, AI may invent then fill the builder. */
    lockSchema: false,
    outputColumns: [] as OutputColumnSpec[],
    instructions: "",
    datasetName: "",
  },
  async run(config, inputs, ctx) {
    if (!config.aiOptIn) throw new Error("Enable AI opt-in on this block to run.");
    if (!ctx.callLlm) {
      throw new Error("AI runtime is not configured.");
    }
    if (ctx.hasLlmKey === false) {
      throw new Error("Add your LLM API key in Settings to use AI.");
    }

    const builderSchema = normalizeOutputColumns(config.outputColumns);
    const lockSchema = Boolean(config.lockSchema) || builderSchema.length > 0;
    // Locked / builder-defined schema is sent to the model; otherwise AI invents columns
    const schemaForCall = lockSchema ? builderSchema : [];

    if (Boolean(config.lockSchema) && !builderSchema.length) {
      throw new Error(
        "Schema is locked — add output columns in the builder, or turn off “Use my schema”.",
      );
    }

    const existing = inputs.table as TabularData | undefined;
    const raw = buildStructureRawInput({
      table: existing,
      rawText: (config.rawText as string) || "",
      textInput: (inputs.text as string) || "",
    });

    if (!raw.trim()) {
      throw new Error(
        "Wire a table into AI Structure, or paste messy text, so AI has something to structure.",
      );
    }

    const prompt = buildStructurePrompt({
      raw,
      schema: schemaForCall,
      instructions: (config.instructions as string) || "",
    });

    const reply = await ctx.callLlm(prompt, { json: true });
    try {
      const parsed = parseLlmJson(reply);
      const table = normalizeStructuredTable(parsed, schemaForCall);
      if (!table.rows.length && !schemaForCall.length) {
        throw new Error("AI returned an empty table");
      }

      const suggestedOutputColumns = inferSchemaFromTable(table);
      // Keep the user’s builder columns when locked; otherwise adopt the suggestion
      const outputColumns = lockSchema ? builderSchema : suggestedOutputColumns;

      return {
        table,
        explanation: lockSchema
          ? `Structured ${table.rows.length} rows into your builder columns: ${table.columns.join(", ")}.`
          : `Structured ${table.rows.length} rows. Suggested schema was added to the column builder for the next run.`,
        outputColumns,
        suggestedOutputColumns,
        schemaAutoFilled: !lockSchema,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse AI table";
      const shaped = previewTableFromSchema(schemaForCall);
      if (shaped) {
        throw new Error(
          `${message}. Your builder columns stay available — fix the prompt or try again.`,
        );
      }
      throw new Error(message);
    }
  },
};
