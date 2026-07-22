import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import dotenv from "dotenv";
import { AnthropicModelClient, type ModelClient } from "./modelClient.js";
import { OpenAIModelClient } from "./openaiClient.js";
import { ValidatingModelClient } from "./validatingClient.js";

export type Provider = "openai" | "anthropic";

/**
 * Load the repo-root `.env` if there is one, so a key can live in a
 * gitignored file instead of being exported in every shell. Real environment
 * variables always win — dotenv never overwrites what is already set, so CI
 * and production config are unaffected.
 *
 * Called from `createModelClient`, which every entry point goes through.
 */
let envLoaded = false;
export function loadEnv(startDir = process.cwd()): void {
  if (envLoaded) return;
  envLoaded = true;

  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return; // reached the filesystem root
    dir = parent;
  }
}

/**
 * Which provider to use. `UNWRITTEN_PROVIDER` decides when set; otherwise
 * whichever key is present wins, preferring OpenAI when both are.
 *
 * `UNWRITTEN_PROVIDER=none` forces browse-only mode even when a key is
 * configured — which is also how tests stay hermetic on a machine that has a
 * real `.env` (loadEnv would otherwise put the key back).
 */
export function resolveProvider(): Provider | undefined {
  loadEnv();
  const explicit = process.env["UNWRITTEN_PROVIDER"]?.toLowerCase();
  if (explicit === "none") return undefined;
  if (explicit === "openai" || explicit === "anthropic") return explicit;
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  return undefined;
}

/**
 * Build the Director's model client from the environment, or return undefined
 * when no key is configured — callers degrade to "browsing works, play needs a
 * key" rather than crashing at startup.
 */
export function createModelClient(
  opts: { log?: (msg: string) => void } = {},
): ModelClient | undefined {
  const provider = resolveProvider();
  if (!provider) return undefined;

  let inner: ModelClient;
  if (provider === "openai") {
    if (!process.env["OPENAI_API_KEY"]) return undefined;
    inner = new OpenAIModelClient();
  } else {
    if (!process.env["ANTHROPIC_API_KEY"]) return undefined;
    inner = new AnthropicModelClient();
  }
  // Every call site gets bounded retry-with-feedback, not just the Writer.
  return new ValidatingModelClient(inner, opts);
}

/** Human-readable reason there is no model client, for error messages. */
export const NO_KEY_MESSAGE =
  "No model API key configured. Put OPENAI_API_KEY=… in a .env file at the repo " +
  "root (it is gitignored) or export it in your shell, then restart.";
