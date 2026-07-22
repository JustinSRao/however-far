import OpenAI from "openai";
import { loadEnv } from "../src/createModelClient.js";
import { OPENAI_MODELS } from "../src/config.js";

/**
 * List the models this OPENAI_API_KEY can actually reach, so the ids in
 * config.ts can be confirmed against the account rather than assumed.
 * Prints nothing secret — model ids only. Run: npm run models
 */
async function main(): Promise<void> {
  loadEnv();
  if (!process.env["OPENAI_API_KEY"]) {
    console.error("OPENAI_API_KEY is not set — put it in a .env file at the repo root.");
    process.exitCode = 1;
    return;
  }

  const client = new OpenAI();
  const ids: string[] = [];
  for await (const model of client.models.list()) {
    ids.push(model.id);
  }
  ids.sort();

  const chat = ids.filter((id) => /^(gpt|o\d|chatgpt)/i.test(id));
  console.log(`${ids.length} models available; ${chat.length} look chat-capable:\n`);
  for (const id of chat) console.log(`  ${id}`);

  console.log("\nCurrently configured:");
  for (const [tier, id] of Object.entries(OPENAI_MODELS)) {
    const ok = ids.includes(id) ? "OK" : "NOT AVAILABLE to this key";
    console.log(`  ${tier.padEnd(7)} ${id}  — ${ok}`);
  }
  console.log(
    "\nOverride without editing code by setting UNWRITTEN_OPENAI_MODEL_STRONG " +
      "and UNWRITTEN_OPENAI_MODEL_CHEAP in .env",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
