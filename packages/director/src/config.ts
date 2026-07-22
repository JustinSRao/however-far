/**
 * All model IDs, effort levels, and token budgets live here and only here
 * (CLAUDE.md). Swapping a model — or a whole provider — is a change in this
 * file plus the matching adapter, never in Director logic.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * What a role needs from a model, independent of who provides it. "strong" is
 * for work where quality is the product (prose, whole-game planning);
 * "cheap" is for classification-shaped work that runs on every turn.
 */
export type Tier = "strong" | "cheap";

export interface RoleConfig {
  /** Anthropic model id. The OpenAI adapter resolves its own id from `tier`. */
  model: string;
  tier: Tier;
  maxTokens: number;
  effort?: Effort;
  /** Adaptive thinking — only for models that support it (not Haiku 4.5). */
  adaptiveThinking: boolean;
}

export const DIRECTOR_CONFIG = {
  /** Authors SceneSpecs. Quality here is the product — don't downgrade. */
  writer: {
    model: "claude-opus-4-8",
    tier: "strong",
    maxTokens: 16000,
    effort: "medium",
    adaptiveThinking: true,
  },
  /** Owns the whole-game Story Arc. */
  architect: {
    model: "claude-opus-4-8",
    tier: "strong",
    maxTokens: 8000,
    effort: "high",
    adaptiveThinking: true,
  },
  /** Reads play signals into the Player Profile. */
  profiler: {
    model: "claude-opus-4-8",
    tier: "strong",
    maxTokens: 4000,
    effort: "low",
    adaptiveThinking: true,
  },
  /** Authors the universe's visual identity once, at genre reveal. */
  stylist: {
    model: "claude-opus-4-8",
    tier: "strong",
    maxTokens: 3000,
    effort: "low",
    adaptiveThinking: true,
  },
  /** Continuity Checker — cheap, classification-shaped. */
  checker: {
    model: "claude-haiku-4-5",
    tier: "cheap",
    maxTokens: 2000,
    adaptiveThinking: false,
  },
  /** Canon fact extraction — cheap, recall over elegance. */
  extractor: {
    model: "claude-haiku-4-5",
    tier: "cheap",
    maxTokens: 2000,
    adaptiveThinking: false,
  },
  /** Regeneration attempts after the first failure (CLAUDE.md: max 2). */
  maxRetries: 2,
  /** Cap on canon facts retrieved into a writer prompt. */
  retrievalLimit: 30,
} as const satisfies Record<string, RoleConfig | number>;

/**
 * OpenAI model ids per tier. Overridable without a code change, because which
 * models an account can actually reach varies — run `npm run models -w
 * @unwritten/director` to list what a key has access to.
 */
export const OPENAI_MODELS: Record<Tier, string> = {
  strong: process.env["UNWRITTEN_OPENAI_MODEL_STRONG"] ?? "gpt-5",
  cheap: process.env["UNWRITTEN_OPENAI_MODEL_CHEAP"] ?? "gpt-5-mini",
};
