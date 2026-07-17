/**
 * All model IDs, effort levels, and token budgets live here and only here
 * (CLAUDE.md). Swapping a model is a one-line change.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RoleConfig {
  model: string;
  maxTokens: number;
  effort?: Effort;
  /** Adaptive thinking — only for models that support it (not Haiku 4.5). */
  adaptiveThinking: boolean;
}

export const DIRECTOR_CONFIG = {
  /** Authors SceneSpecs. Quality here is the product — don't downgrade. */
  writer: {
    model: "claude-opus-4-8",
    maxTokens: 16000,
    effort: "medium",
    adaptiveThinking: true,
  },
  /** Owns the whole-game Story Arc. */
  architect: {
    model: "claude-opus-4-8",
    maxTokens: 8000,
    effort: "high",
    adaptiveThinking: true,
  },
  /** Reads play signals into the Player Profile. */
  profiler: {
    model: "claude-opus-4-8",
    maxTokens: 4000,
    effort: "low",
    adaptiveThinking: true,
  },
  /** Continuity Checker — cheap, classification-shaped. */
  checker: {
    model: "claude-haiku-4-5",
    maxTokens: 2000,
    adaptiveThinking: false,
  },
  /** Canon fact extraction — cheap, recall over elegance. */
  extractor: {
    model: "claude-haiku-4-5",
    maxTokens: 2000,
    adaptiveThinking: false,
  },
  /** Regeneration attempts after the first failure (CLAUDE.md: max 2). */
  maxRetries: 2,
  /** Cap on canon facts retrieved into a writer prompt. */
  retrievalLimit: 30,
} as const satisfies Record<string, RoleConfig | number>;
