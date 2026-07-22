import OpenAI from "openai";
import { OPENAI_MODELS } from "./config.js";
import { ModelOutputError, type ModelClient, type StructuredRequest } from "./modelClient.js";
import { stripNulls, toOpenAISchema, unwrapRoot } from "./openaiSchema.js";

/**
 * Real adapter over the OpenAI API. Requires OPENAI_API_KEY (server-side
 * only — CLAUDE.md invariant 6).
 *
 * Deliberately mirrors AnthropicModelClient: same interface, same contract
 * that the returned value has been validated by the caller's Zod schema. Two
 * provider differences are absorbed here rather than leaking upward:
 *
 * - Prompt caching is automatic and prefix-based, so there is no cache_control
 *   marker to set. The prompt discipline in CLAUDE.md (frozen system prompt
 *   first, volatile per-turn content last) is what earns the cache hits, and
 *   it applies unchanged.
 * - Thinking budget is `reasoning_effort` rather than adaptive thinking. Roles
 *   that asked for adaptive thinking without naming an effort get "medium".
 */
export class OpenAIModelClient implements ModelClient {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? new OpenAI();
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const { schema, wrapped } = toOpenAISchema(req.schema);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ];
    for (const f of req.feedback ?? []) {
      messages.push({ role: "user", content: f });
    }

    const response = await this.client.chat.completions.create({
      model: OPENAI_MODELS[req.role.tier],
      max_completion_tokens: req.role.maxTokens,
      ...(req.role.effort || req.role.adaptiveThinking
        ? { reasoning_effort: reasoningEffort(req.role.effort) }
        : {}),
      response_format: {
        type: "json_schema",
        json_schema: { name: "unwritten_output", strict: true, schema },
      },
      messages,
    });

    const choice = response.choices[0];
    const content = choice?.message.content;
    if (choice?.finish_reason === "length") {
      throw new ModelOutputError(
        `model output was cut off at max_completion_tokens (${req.role.maxTokens})`,
      );
    }
    if (!content) {
      throw new ModelOutputError(
        `model returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"})`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new ModelOutputError("model returned content that is not valid JSON");
    }

    // Strict mode made optional fields nullable-and-required; undo that, then
    // hold the result to the caller's schema exactly as the Anthropic adapter
    // does — the retry loop's guarantees depend on this, not on the provider.
    const parsed = stripNulls(unwrapRoot(raw, wrapped));
    return req.schema.parse(parsed);
  }
}

/**
 * Our effort scale is Anthropic-shaped; OpenAI accepts low/medium/high. The
 * two levels above "high" collapse onto it.
 */
function reasoningEffort(effort: string | undefined): "low" | "medium" | "high" {
  switch (effort) {
    case "low":
      return "low";
    case "high":
    case "xhigh":
    case "max":
      return "high";
    default:
      return "medium";
  }
}
