import { describe, expect, it } from "vitest";
import {
  callsAnswer,
  CrossingCall,
  sameAddress,
  type PlaythroughExport,
} from "../src/reunion.js";

const playthrough = (path: "her" | "his"): PlaythroughExport => ({
  formatVersion: 1,
  sessionId: `world-${path}`,
  path,
  playerName: path === "her" ? "Rin" : "Kaito",
  completedAt: "2026-07-22T12:00:00.000Z",
  profile: {
    genre: { primary: "portal fantasy", confidence: 0.8 },
    tone: "earnest",
    pacing: "measured",
    appetites: { combat: 0.4, dialogue: 0.7, exploration: 0.8, puzzle: 0.4, romance: 0.9 },
    moralLean: "heroic",
    humor: 0.2,
    notes: [],
  },
  arc: {
    premise: "A bell that only she can hear.",
    theme: "what we owe the people who wait",
    acts: [
      {
        id: "act-one",
        title: "Summoned",
        summary: "She wakes somewhere else.",
        beats: [{ id: "beat-wake", summary: "She wakes.", status: "done" }],
      },
      {
        id: "act-two",
        title: "The Way Back",
        summary: "She finds the gate.",
        beats: [{ id: "beat-gate", summary: "The gate.", status: "done" }],
      },
    ],
    currentActId: "act-two",
    setups: [],
    plannedEnding: { tone: "bittersweet", summary: "She reaches the gate and cannot cross." },
  },
  canon: [],
  characters: [],
  sheet: {
    attributes: { might: 2, wits: 1, heart: 3 },
    resources: { vigor: { current: 4, max: 5 }, focus: { current: 3, max: 4 } },
    standings: {},
  },
  ending: {
    title: "The Gate at Low Tide",
    closingText: "x".repeat(250),
    threshold: "The gate needs a hand on the other side and there is no one there.",
    tone: "bittersweet",
    reunionSeeds: [{ id: "seed-vowthread", statement: "She binds bonds into force." }],
  },
  road: [],
});

function call(
  selfEmail: string,
  callingEmail: string,
  path: "her" | "his",
): CrossingCall {
  return CrossingCall.parse({
    id: `call-${selfEmail}`,
    createdAt: "2026-07-22T12:00:00.000Z",
    self: { name: "Someone", email: selfEmail },
    calling: { name: "Someone Else", email: callingEmail },
    path,
    playthrough: playthrough(path),
  });
}

describe("the Call", () => {
  it("answers only when both sides reached for each other", () => {
    const hers = call("rin@example.com", "kaito@example.com", "her");
    const his = call("kaito@example.com", "rin@example.com", "his");
    expect(callsAnswer(hers, his)).toBe(true);
    expect(callsAnswer(his, hers)).toBe(true);
  });

  it("refuses a one-sided call — nobody gets dragged across", () => {
    const hers = call("rin@example.com", "kaito@example.com", "her");
    const hisElsewhere = call("kaito@example.com", "someone@example.com", "his");
    expect(callsAnswer(hers, hisElsewhere)).toBe(false);
  });

  it("refuses two people who lived the same side", () => {
    const one = call("rin@example.com", "aki@example.com", "her");
    const two = call("aki@example.com", "rin@example.com", "her");
    expect(callsAnswer(one, two)).toBe(false);
  });

  it("refuses a call to yourself", () => {
    const self = call("rin@example.com", "rin@example.com", "her");
    expect(callsAnswer(self, self)).toBe(false);
  });

  it("matches addresses the way people actually type them", () => {
    expect(sameAddress("  Rin@Example.COM ", "rin@example.com")).toBe(true);
    const hers = call("Rin@Example.com", "KAITO@example.com", "her");
    const his = call("kaito@example.com", "rin@EXAMPLE.com", "his");
    expect(callsAnswer(hers, his)).toBe(true);
  });
});
