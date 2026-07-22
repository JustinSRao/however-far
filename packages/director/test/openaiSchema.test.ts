import { describe, expect, it } from "vitest";
import { CheckerVerdict, FactExtraction, PlayerProfile } from "@unwritten/schema";
import { WriterOutput } from "../src/writer.js";
import {
  ROOT_WRAPPER_KEY,
  stripNulls,
  toOpenAISchema,
  unwrapRoot,
} from "../src/openaiSchema.js";
import { makeProfile, makeWriterOutput } from "./helpers.js";

type JsonObject = Record<string, unknown>;

/** Every object node OpenAI strict mode will see, flattened for assertions. */
function objectNodes(node: unknown, found: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(node)) {
    for (const n of node) objectNodes(n, found);
    return found;
  }
  if (typeof node !== "object" || node === null) return found;
  const obj = node as JsonObject;
  if (obj["type"] === "object" && obj["properties"]) found.push(obj);
  for (const value of Object.values(obj)) objectNodes(value, found);
  return found;
}

function collectKeywords(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const n of node) collectKeywords(n, found);
    return found;
  }
  if (typeof node !== "object" || node === null) return found;
  for (const [key, value] of Object.entries(node as JsonObject)) {
    found.add(key);
    collectKeywords(value, found);
  }
  return found;
}

describe("toOpenAISchema — strict-mode conformance", () => {
  const schemas = {
    WriterOutput,
    PlayerProfile,
    FactExtraction,
    CheckerVerdict,
  };

  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name}: every object requires all properties and forbids extras`, () => {
      const { schema: json } = toOpenAISchema(schema);
      const nodes = objectNodes(json);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        const properties = Object.keys(node["properties"] as JsonObject);
        expect(node["additionalProperties"]).toBe(false);
        // Strict mode rejects any property missing from `required`.
        expect(new Set(node["required"] as string[])).toEqual(new Set(properties));
      }
    });

    it(`${name}: drops validation keywords strict mode rejects`, () => {
      const { schema: json } = toOpenAISchema(schema);
      const keywords = collectKeywords(json);
      for (const banned of [
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "oneOf",
        "default",
      ]) {
        expect(keywords.has(banned)).toBe(false);
      }
    });
  }

  it("expresses an optional field as a union with null rather than omitting it", () => {
    const { schema: json } = toOpenAISchema(WriterOutput);
    const properties = json["properties"] as JsonObject;
    // advancesBeatId is `.optional()` on WriterOutput.
    expect(json["required"]).toContain("advancesBeatId");
    const advances = properties["advancesBeatId"] as JsonObject;
    expect(advances["anyOf"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "null" })]),
    );
  });

  it("wraps a root-level union, since a json_schema root must be an object", () => {
    // CheckerVerdict is a union of {ok:true} | {ok:false, violations:[…]}.
    const { schema: json, wrapped } = toOpenAISchema(CheckerVerdict);
    expect(wrapped).toBe(true);
    expect(json["type"]).toBe("object");
    expect(json["required"]).toEqual([ROOT_WRAPPER_KEY]);
    expect(unwrapRoot({ [ROOT_WRAPPER_KEY]: { ok: true } }, true)).toEqual({ ok: true });
  });

  it("leaves an object root unwrapped", () => {
    const { wrapped } = toOpenAISchema(WriterOutput);
    expect(wrapped).toBe(false);
  });
});

describe("stripNulls — model output survives the round trip", () => {
  it("lets a null optional field parse as absent", () => {
    // What a strict-mode model returns when it has no beat to report.
    const raw = { ...(makeWriterOutput("gen-one") as object), advancesBeatId: null };
    const parsed = WriterOutput.parse(stripNulls(raw));
    expect(parsed.advancesBeatId).toBeUndefined();
    expect(parsed.scene.id).toBe("gen-one");
  });

  it("lets a null defaulted field fall back to its default", () => {
    const raw = { facts: [{ statement: "The bell tolled.", entities: null, supersedes: null }] };
    const parsed = FactExtraction.parse(stripNulls(raw));
    expect(parsed.facts[0]!.entities).toEqual([]);
    expect(parsed.facts[0]!.supersedes).toBeUndefined();
  });

  it("strips nested nulls without disturbing real values", () => {
    const profile = { ...makeProfile(), genre: { primary: "folk horror", secondary: null, confidence: 0.8 } };
    const parsed = PlayerProfile.parse(stripNulls(profile));
    expect(parsed.genre.secondary).toBeUndefined();
    expect(parsed.genre.primary).toBe("folk horror");
    expect(parsed.appetites.exploration).toBe(0.8);
  });

  it("preserves array positions rather than collapsing nulls out of lists", () => {
    expect(stripNulls({ xs: [1, null, 2] })).toEqual({ xs: [1, null, 2] });
  });
});
