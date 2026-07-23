import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DIRECTOR_CONFIG, type RoleConfig } from "./config.js";

/**
 * The cost ledger (ADR-0018): EVERY external model/image API call is recorded
 * here — owner directive, so the whole game's cost can be modeled. Adapters
 * append one JSONL line per call with raw token counts (ground truth) plus a
 * derived USD cost. Recording is best-effort and must never break play.
 *
 * Prices are $/1M tokens, verified 2026-07-22 (OpenAI pricing page via
 * search; Anthropic model catalog). Tokens are the source of truth — if a
 * price drifts, update PRICING and re-run `npm run costs`; historical
 * entries keep their at-the-time costUsd but the report also shows a
 * recomputed total. Unknown models record tokens with costUsd: null.
 */

export interface PriceEntry {
  inputPerM: number;
  /** Cached-input (prompt-cache read) price. ~0.1x input on both providers. */
  cachedInputPerM: number;
  outputPerM: number;
  /** Anthropic-only: cache-write premium (1.25x input for 5m TTL). */
  cacheWritePerM?: number;
}

export const PRICING: Readonly<Record<string, PriceEntry>> = {
  // OpenAI (the project default provider, ADR-0008)
  "gpt-5.5": { inputPerM: 5.0, cachedInputPerM: 0.5, outputPerM: 30.0 },
  "gpt-5.4-mini": { inputPerM: 0.75, cachedInputPerM: 0.075, outputPerM: 4.5 },
  // Anthropic (supported alternate provider)
  "claude-opus-4-8": { inputPerM: 5.0, cachedInputPerM: 0.5, outputPerM: 25.0, cacheWritePerM: 6.25 },
  "claude-haiku-4-5": { inputPerM: 1.0, cachedInputPerM: 0.1, outputPerM: 5.0, cacheWritePerM: 1.25 },
};

export interface TokenUsage {
  /** Uncached input tokens billed at the full input rate. */
  inputTokens: number;
  /** Prompt-cache-read tokens billed at the cached rate. */
  cachedInputTokens: number;
  /** Anthropic cache-write tokens (0 for OpenAI — writes aren't billed extra). */
  cacheWriteTokens: number;
  outputTokens: number;
}

/** Derived dollar cost, or null when the model has no PRICING entry. */
export function computeCostUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICING[model];
  if (!price) return null;
  const perToken =
    usage.inputTokens * price.inputPerM +
    usage.cachedInputTokens * price.cachedInputPerM +
    usage.cacheWriteTokens * (price.cacheWritePerM ?? price.inputPerM) +
    usage.outputTokens * price.outputPerM;
  return perToken / 1_000_000;
}

export interface UsageEvent extends TokenUsage {
  ts: string;
  provider: string;
  model: string;
  /** Director role that made the call ("writer", "checker", ...) if known. */
  role?: string;
  /** "text" today; "image" when the gpt-image provider lands (Phase 5). */
  kind: "text" | "image";
  /** Image calls: number of images generated. */
  images?: number;
  costUsd: number | null;
}

function ledgerDir(): string {
  return process.env["HOWEVERFAR_HOME"] ?? join(homedir(), ".however-far");
}

export function costLedgerPath(): string {
  return join(ledgerDir(), "costs.jsonl");
}

/** Append one call to the ledger. Best-effort: a failed write never breaks play. */
export function recordUsage(event: Omit<UsageEvent, "ts" | "costUsd">): void {
  try {
    const full: UsageEvent = {
      ...event,
      ts: new Date().toISOString(),
      costUsd: computeCostUsd(event.model, event),
    };
    mkdirSync(ledgerDir(), { recursive: true });
    appendFileSync(costLedgerPath(), `${JSON.stringify(full)}\n`, "utf8");
  } catch {
    // Never let bookkeeping break the game.
  }
}

/** Read all recorded calls. Unparseable lines are skipped, never fatal. */
export function readCostLedger(): UsageEvent[] {
  let raw: string;
  try {
    raw = readFileSync(costLedgerPath(), "utf8");
  } catch {
    return [];
  }
  const out: UsageEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as UsageEvent);
    } catch {
      // skip
    }
  }
  return out;
}

/**
 * Resolve the Director role name from the RoleConfig object identity —
 * call sites pass DIRECTOR_CONFIG.writer etc. directly, so reference
 * equality identifies the role without changing the ModelClient interface.
 */
export function roleNameOf(role: RoleConfig): string {
  for (const [name, value] of Object.entries(DIRECTOR_CONFIG)) {
    if (value === role) return name;
  }
  return role.tier;
}
