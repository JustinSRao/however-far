import type { PlayerProfile, StoryArc } from "@unwritten/schema";
import type { ModelClient, StructuredRequest } from "../src/modelClient.js";

/**
 * Deterministic stand-in for the Claude API. Values are validated through the
 * same Zod schema the real client would use, so tests also verify that our
 * canned payloads are schema-legal.
 */
export class FakeModelClient implements ModelClient {
  queue: unknown[] = [];
  calls: Array<{ system: string; user: string; feedback: readonly string[] }> = [];

  push(...values: unknown[]): void {
    this.queue.push(...values);
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    this.calls.push({
      system: req.system,
      user: req.user,
      feedback: req.feedback ?? [],
    });
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(
        `FakeModelClient queue empty (call #${this.calls.length})`,
      );
    }
    return req.schema.parse(next);
  }
}

export function makeProfile(): PlayerProfile {
  return {
    genre: { primary: "folk horror", confidence: 0.8 },
    tone: "grim wonder, earnest, low humor",
    pacing: "measured",
    appetites: {
      combat: 0.3,
      dialogue: 0.7,
      exploration: 0.8,
      puzzle: 0.5,
      romance: 0.1,
    },
    moralLean: "heroic",
    humor: 0.3,
    notes: ["shares resources", "types full sentences"],
  };
}

export function makeArc(opts: { finalAct?: boolean } = {}): StoryArc {
  return {
    premise:
      "The eastern fires are the Lantern Order erasing places that remember the old road; the player's box marks them as a Rememberer.",
    theme: "what we owe the things we forget",
    acts: [
      {
        id: "act-one",
        title: "The Bell",
        summary: "The bell-ringers arrive and the road's rules become clear.",
        beats: [
          { id: "beat-bell", summary: "The bell arrives and takes an interest in the player.", status: "pending" },
          { id: "beat-marlow-secret", summary: "Marlow reveals what they carry.", status: "pending" },
        ],
      },
      {
        id: "act-two",
        title: "The Smoke",
        summary: "The player reaches the eastern fires and what sets them.",
        beats: [
          { id: "beat-east", summary: "Reach the source of the eastern smoke.", status: "pending" },
        ],
      },
    ],
    currentActId: opts.finalAct ? "act-two" : "act-one",
    setups: [
      {
        id: "setup-letter",
        description: "The box's contents were addressed by the player's own past self.",
        status: "planted",
      },
    ],
    plannedEnding: {
      tone: "bittersweet",
      summary:
        "The player can end the fires only by letting the road forget them too.",
    },
  };
}

/** A schema-legal writer output for a generated scene. */
export function makeWriterOutput(
  id: string,
  opts: { endingChoice?: boolean; advancesBeatId?: string } = {},
): unknown {
  return {
    scene: {
      dslVersion: 0,
      id,
      title: `Scene ${id}`,
      location: {
        id: `loc-${id}`,
        name: "Somewhere on the road",
        description: "A place the road brought you.",
      },
      narration:
        "The road continues, and so do you. Something has changed, though you could not yet say what — only that the air holds its breath a little differently here.",
      entities: [],
      dialogue: [],
      onEnterEffects: [],
      choices: [
        {
          id: "go-on",
          label: "Go on.",
          effects: [],
          transition: { type: "generate", hint: "The player continues forward." },
        },
        ...(opts.endingChoice
          ? [
              {
                id: "end-it",
                label: "Let it end here.",
                effects: [],
                transition: {
                  type: "ending",
                  tone: "bittersweet",
                  hint: "The player chooses to conclude.",
                },
              },
            ]
          : []),
      ],
      freeText: { enabled: true },
    },
    ...(opts.advancesBeatId ? { advancesBeatId: opts.advancesBeatId } : {}),
  };
}
