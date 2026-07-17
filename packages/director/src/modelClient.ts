import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { RoleConfig } from "./config.js";

/**
 * The seam between the Director and the Claude API. Everything above this
 * interface is testable with a fake; everything below it is a thin adapter.
 */
export interface StructuredRequest<T> {
  role: RoleConfig;
  /** Frozen system prompt — first for prefix stability (prompt caching). */
  system: string;
  /** The per-turn user content. Stable parts first, volatile parts last. */
  user: string;
  /** Validation-error feedback appended on regeneration attempts. */
  feedback?: readonly string[];
  /** Output-typed schema; input side is unconstrained (defaults, coercion). */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
}

export interface ModelClient {
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** Real adapter over the Claude API. Requires ANTHROPIC_API_KEY (server-side only). */
export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic();
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: req.user },
    ];
    for (const f of req.feedback ?? []) {
      messages.push({ role: "user", content: f });
    }
    // zodOutputFormat's typings target zod v4's interface; our schemas use the
    // classic v3 API of the same package. Cast at this one boundary and
    // re-validate the result with the caller's schema (which the retry loop
    // relies on anyway).
    const format = zodOutputFormat(req.schema as never);
    const response = await this.client.messages.parse({
      model: req.role.model,
      max_tokens: req.role.maxTokens,
      // cache_control on the frozen system prompt: tools+system cache together
      system: [
        {
          type: "text",
          text: req.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      ...(req.role.adaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: {
        format,
        ...(req.role.effort ? { effort: req.role.effort } : {}),
      },
      messages,
    });
    const parsed: unknown = (response as { parsed_output?: unknown }).parsed_output;
    if (parsed == null) {
      throw new ModelOutputError(
        `model returned no parseable output (stop_reason: ${response.stop_reason})`,
      );
    }
    return req.schema.parse(parsed);
  }
}
