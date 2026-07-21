/**
 * Local smoke test: decrypt the first user LLM key and run AI Structure once.
 * Usage: pnpm exec tsx scripts/verify-llm.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { callLlm } from "../src/modules/ai/infrastructure/llmAdapter";
import {
  buildStructurePrompt,
  normalizeStructuredTable,
  parseLlmJson,
} from "../src/modules/ai/domain/structuredOutput";
import { decryptSecret } from "../src/modules/identity/domain/secretBox";
import { getEnv } from "../src/shared/config/env";

async function main() {
  const env = getEnv();
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { llmApiKeyEnc: { not: null } },
      select: { email: true, llmApiKeyEnc: true },
      orderBy: { email: "asc" },
    });
    if (!user?.llmApiKeyEnc) {
      console.error("No user with an LLM key found. Save one in Settings first.");
      process.exit(1);
    }

    const apiKey = decryptSecret(user.llmApiKeyEnc, env.AUTH_SECRET);
    if (!apiKey) {
      console.error("Could not decrypt LLM key (check AUTH_SECRET).");
      process.exit(1);
    }
    console.log(`Using key for ${user.email} (model ${env.LLM_MODEL})`);

    const schema = [
      { name: "item", type: "string" as const },
      { name: "qty", type: "number" as const },
      { name: "amount", type: "number" as const },
    ];
    const prompt = buildStructurePrompt({
      raw: "Sold 2 teas for 40 yesterday\n1 coffee 18.50",
      schema,
      instructions: "Amounts are currency totals.",
    });

    const reply = await callLlm(prompt, { apiKey, json: true });
    const table = normalizeStructuredTable(parseLlmJson(reply), schema);
    console.log("OK — structured table:");
    console.log(JSON.stringify(table, null, 2));
    if (!table.columns.length) {
      process.exit(2);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
