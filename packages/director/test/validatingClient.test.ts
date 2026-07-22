import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoryArc } from "@unwritten/schema";
import { ValidatingModelClient } from "../src/validatingClient.js";
import { ModelOutputError, type ModelClient, type StructuredRequest } from "../src/modelClient.js";
import { makeArc } from "./helpers.js";

/** Replays canned values, recording the feedback each attempt was given. */
class ScriptedClient implements ModelClient {
  constructor(private readonly values: unknown[]) {}
  readonly feedbacks: string[][] = [];

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    this.feedbacks.push([...(req.feedback ?? [])]);
    const next = this.values.shift();
    if (next instanceof Error) throw next;
    return req.schema.parse(next);
  }
}

describe("ValidatingModelClient", () => {
  it("retries a schema violation and feeds the issues back", async () => {
    // An arc with too many beats — exactly what the live Architect produced.
    const tooManyBeats = makeArc();
    tooManyBeats.acts[0]!.beats = Array.from({ length: 14 }, (_, i) => ({
      id: `beat-${i}`,
      summary: `Beat number ${i}.`,
      status: "pending" as const,
    }));

    const scripted = new ScriptedClient([tooManyBeats, makeArc()]);
    const client = new ValidatingModelClient(scripted);

    const arc = await client.generateStructured({
      role: { model: "m", tier: "strong", maxTokens: 100, adaptiveThinking: false },
      system: "s",
      user: "u",
      schema: StoryArc,
    });

    expect(arc.acts[0]!.beats).toHaveLength(2);
    expect(scripted.feedbacks).toHaveLength(2);
    // First attempt: clean. Second: told what was wrong, in actionable terms.
    expect(scripted.feedbacks[0]).toEqual([]);
    expect(scripted.feedbacks[1]![0]).toContain("acts.0.beats");
    expect(scripted.feedbacks[1]![0]).toContain("at most 8");
  });

  it("preserves feedback the caller already supplied", async () => {
    const scripted = new ScriptedClient([{ n: "not a number" }, { n: 1 }]);
    const client = new ValidatingModelClient(scripted);
    await client.generateStructured({
      role: { model: "m", tier: "cheap", maxTokens: 100, adaptiveThinking: false },
      system: "s",
      user: "u",
      feedback: ["caller-supplied note"],
      schema: z.object({ n: z.number() }),
    });
    expect(scripted.feedbacks[0]).toEqual(["caller-supplied note"]);
    expect(scripted.feedbacks[1]![0]).toBe("caller-supplied note");
    expect(scripted.feedbacks[1]).toHaveLength(2);
  });

  it("gives up after maxRetries and rethrows the last schema error", async () => {
    const scripted = new ScriptedClient([{}, {}, {}, {}]);
    const client = new ValidatingModelClient(scripted, { maxRetries: 2 });
    await expect(
      client.generateStructured({
        role: { model: "m", tier: "cheap", maxTokens: 100, adaptiveThinking: false },
        system: "s",
        user: "u",
        schema: z.object({ n: z.number() }),
      }),
    ).rejects.toThrow();
    expect(scripted.feedbacks).toHaveLength(3); // initial + 2 retries
  });

  it("does not retry transport or auth failures — feedback cannot fix those", async () => {
    const scripted = new ScriptedClient([new ModelOutputError("503 upstream")]);
    const client = new ValidatingModelClient(scripted);
    await expect(
      client.generateStructured({
        role: { model: "m", tier: "cheap", maxTokens: 100, adaptiveThinking: false },
        system: "s",
        user: "u",
        schema: z.object({ n: z.number() }),
      }),
    ).rejects.toThrow("503 upstream");
    expect(scripted.feedbacks).toHaveLength(1);
  });
});
