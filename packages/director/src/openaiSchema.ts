import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

/**
 * Translation layer between our Zod schemas and OpenAI structured outputs.
 *
 * OpenAI's strict mode guarantees the model returns schema-conforming JSON,
 * but only accepts a restricted subset of JSON Schema. Three of our shapes
 * fall outside it, and all three are fixed here rather than by contorting the
 * schemas — `packages/schema` stays the single source of truth (CLAUDE.md),
 * and the Anthropic adapter keeps using it unchanged:
 *
 *  1. Optional properties. Strict mode requires every property to appear in
 *     `required`. The documented way to express "may be absent" is a union
 *     with null, so optional fields become nullable-and-required here and the
 *     nulls are stripped back out of the response (see `stripNulls`).
 *  2. Root-level unions. `CheckerVerdict` is a union, but a json_schema root
 *     must be an object — so non-object roots are wrapped in `{result: ...}`
 *     and unwrapped after parsing (see `ROOT_WRAPPER_KEY`).
 *  3. Validation keywords. Strict mode rejects much of the string/number/array
 *     constraint vocabulary (minLength, pattern, maximum, …). These are
 *     dropped from what the model sees; they are still enforced, because every
 *     response is re-validated against the original Zod schema and a failure
 *     feeds the writer's bounded retry loop.
 */

/** Property name used when a non-object root schema has to be wrapped. */
export const ROOT_WRAPPER_KEY = "result";

/**
 * JSON Schema keywords strict mode does not accept. Dropped from the schema
 * sent to the model; the Zod schema still enforces them on the way back.
 *
 * Dropping them silently would leave the model guessing — it once wrote 14
 * beats into an act capped at 8 — so anything expressible in words is folded
 * into the node's `description` by `constraintSentence` before removal.
 */
const UNSUPPORTED_KEYWORDS = [
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "default",
] as const;

/** Restate dropped constraints in prose the model will actually read. */
function constraintSentence(node: JsonObject): string {
  const parts: string[] = [];
  const num = (k: string): number | undefined =>
    typeof node[k] === "number" ? (node[k] as number) : undefined;

  const [minItems, maxItems] = [num("minItems"), num("maxItems")];
  if (minItems !== undefined && maxItems !== undefined) {
    parts.push(`${minItems} to ${maxItems} items`);
  } else if (minItems !== undefined) {
    parts.push(`at least ${minItems} items`);
  } else if (maxItems !== undefined) {
    parts.push(`at most ${maxItems} items`);
  }

  const [minLength, maxLength] = [num("minLength"), num("maxLength")];
  if (maxLength !== undefined) {
    parts.push(`at most ${maxLength} characters`);
  }
  if (minLength !== undefined && minLength > 0 && maxLength === undefined) {
    parts.push(`at least ${minLength} characters`);
  }

  const [minimum, maximum] = [num("minimum"), num("maximum")];
  if (minimum !== undefined && maximum !== undefined) {
    parts.push(`between ${minimum} and ${maximum}`);
  } else if (minimum !== undefined) {
    parts.push(`at least ${minimum}`);
  } else if (maximum !== undefined) {
    parts.push(`at most ${maximum}`);
  }

  if (typeof node["pattern"] === "string") {
    parts.push(`matching ${node["pattern"] as string}`);
  }
  return parts.join(", ");
}

type JsonObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Wrap a schema so that null is also acceptable (strict mode's "optional"). */
function nullable(schema: JsonObject): JsonObject {
  return { anyOf: [schema, { type: "null" }] };
}

function toStrict(node: unknown): unknown {
  if (!isPlainObject(node)) return node;

  const out: JsonObject = { ...node };

  // Preserve the constraints as guidance before dropping the keywords.
  const constraints = constraintSentence(out);
  for (const keyword of UNSUPPORTED_KEYWORDS) delete out[keyword];
  if (constraints) {
    const existing = typeof out["description"] === "string" ? out["description"] : "";
    out["description"] = existing ? `${existing} (${constraints})` : constraints;
  }

  // Strict mode accepts anyOf but not oneOf/allOf.
  if (Array.isArray(out["oneOf"])) {
    out["anyOf"] = out["oneOf"];
    delete out["oneOf"];
  }
  if (Array.isArray(out["anyOf"])) {
    out["anyOf"] = (out["anyOf"] as unknown[]).map(toStrict);
  }
  if (out["items"] !== undefined) {
    out["items"] = toStrict(out["items"]);
  }

  if (out["type"] === "object" && isPlainObject(out["properties"])) {
    const properties = out["properties"];
    // A Zod record produces a schema-valued additionalProperties; strict mode
    // has no equivalent, so leave such nodes alone rather than corrupting them.
    if (isPlainObject(out["additionalProperties"])) return out;

    const required = new Set(
      Array.isArray(out["required"]) ? (out["required"] as string[]) : [],
    );
    const rewritten: JsonObject = {};
    for (const [key, value] of Object.entries(properties)) {
      const child = toStrict(value) as JsonObject;
      // Not required in the original schema (`.optional()` or `.default()`):
      // strict mode has no way to omit it, so allow null instead.
      rewritten[key] = required.has(key) ? child : nullable(child);
    }
    out["properties"] = rewritten;
    out["required"] = Object.keys(rewritten);
    out["additionalProperties"] = false;
  }

  return out;
}

export interface OpenAISchema {
  /** The strict-mode JSON Schema to hand to the API. */
  schema: JsonObject;
  /** True when the root had to be wrapped in `{result: ...}`. */
  wrapped: boolean;
}

/** Convert a Zod schema into a strict-mode JSON Schema OpenAI will accept. */
export function toOpenAISchema(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>): OpenAISchema {
  const raw = zodToJsonSchema(schema as never, {
    target: "jsonSchema7",
    // Inline everything: strict mode's $ref support is narrow, and our
    // schemas are small enough that duplication costs nothing meaningful.
    $refStrategy: "none",
  }) as JsonObject;
  delete raw["$schema"];

  const strict = toStrict(raw) as JsonObject;
  if (strict["type"] === "object") return { schema: strict, wrapped: false };

  return {
    wrapped: true,
    schema: {
      type: "object",
      properties: { [ROOT_WRAPPER_KEY]: strict },
      required: [ROOT_WRAPPER_KEY],
      additionalProperties: false,
    },
  };
}

/**
 * Remove nulls the nullable-rewrite invited back in, recursively, so that
 * `.optional()` fields read as absent rather than as an explicit null (which
 * Zod would reject) and `.default()` fields get their default applied.
 * Nulls inside arrays are preserved positionally — dropping them would
 * silently change list lengths.
 */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (!isPlainObject(value)) return value;

  const out: JsonObject = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === null) continue;
    out[key] = stripNulls(v);
  }
  return out;
}

/** Undo the root wrapping applied by `toOpenAISchema`. */
export function unwrapRoot(parsed: unknown, wrapped: boolean): unknown {
  if (!wrapped) return parsed;
  if (!isPlainObject(parsed)) return parsed;
  return parsed[ROOT_WRAPPER_KEY];
}
