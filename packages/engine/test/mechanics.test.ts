import { describe, expect, it } from "vitest";
import { AreaSpec, STARTING_SHEET, type Check, type CharacterSheet } from "@howeverfar/schema";
import {
  applyConvoChoice,
  applySheetEffects,
  canAttemptCheck,
  CHECK_DIE,
  choiceAffordable,
  initialAreaState,
  resolveCheck,
  resolveCheckOn,
  rollFor,
} from "../src/index.js";

const sheet = (over: Partial<CharacterSheet> = {}): CharacterSheet => ({
  ...STARTING_SHEET,
  ...over,
});

describe("rollFor", () => {
  it("stays inside the die and is deterministic", () => {
    for (let i = 0; i < 500; i++) {
      const roll = rollFor(1234, i);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(CHECK_DIE);
      expect(rollFor(1234, i)).toBe(roll);
    }
  });

  it("gives different sequences for different seeds", () => {
    const a = Array.from({ length: 40 }, (_, i) => rollFor(1, i));
    const b = Array.from({ length: 40 }, (_, i) => rollFor(2, i));
    expect(a).not.toEqual(b);
  });

  it("is independent per counter, so replay survives a changed offer history", () => {
    // Resolving check #7 must not depend on whether 1-6 were ever rolled.
    expect(rollFor(99, 7)).toBe(rollFor(99, 7));
  });

  it("covers every face over a run", () => {
    const seen = new Set(Array.from({ length: 300 }, (_, i) => rollFor(7, i)));
    expect(seen.size).toBe(CHECK_DIE);
  });
});

describe("sheet effects", () => {
  it("clamps a resource to its pool", () => {
    const drained = applySheetEffects(sheet(), [
      { op: "adjustResource", resource: "vigor", delta: -100 },
    ]);
    expect(drained.resources.vigor.current).toBe(0);
    const healed = applySheetEffects(drained, [
      { op: "adjustResource", resource: "vigor", delta: 100 },
    ]);
    expect(healed.resources.vigor.current).toBe(healed.resources.vigor.max);
  });

  it("raising max does not fill the pool; lowering it pulls current down", () => {
    const raised = applySheetEffects(sheet(), [
      { op: "adjustResourceMax", resource: "focus", delta: 4 },
    ]);
    expect(raised.resources.focus).toEqual({ current: 4, max: 8 });
    const lowered = applySheetEffects(raised, [
      { op: "adjustResourceMax", resource: "focus", delta: -6 },
    ]);
    expect(lowered.resources.focus).toEqual({ current: 2, max: 2 });
  });

  it("clamps attributes to 0..10", () => {
    const grown = applySheetEffects(sheet(), [
      { op: "adjustAttribute", attribute: "heart", delta: 3 },
    ]);
    expect(grown.attributes.heart).toBe(5);
    const capped = applySheetEffects(grown, Array.from({ length: 5 }, () => ({
      op: "adjustAttribute" as const, attribute: "heart" as const, delta: 3,
    })));
    expect(capped.attributes.heart).toBe(10);
  });

  it("creates a standing on first mention and clamps to -3..3", () => {
    const met = applySheetEffects(sheet(), [
      { op: "adjustStanding", standing: "ashen-court", label: "The Ashen Court", delta: 2 },
    ]);
    expect(met.standings["ashen-court"]).toEqual({ label: "The Ashen Court", value: 2 });
    const loved = applySheetEffects(met, [
      { op: "adjustStanding", standing: "ashen-court", label: "ignored", delta: 6 },
    ]);
    // Label is set once so a renamed faction cannot fork into two standings.
    expect(loved.standings["ashen-court"]).toEqual({ label: "The Ashen Court", value: 3 });
  });
});

describe("resolveCheck", () => {
  const check: Check = {
    attribute: "heart",
    difficulty: 5,
    success: { text: "The vow holds.", effects: [] },
    failure: { text: "It slips.", effects: [] },
  };

  it("succeeds when roll + attribute clears the difficulty", () => {
    const roll = rollFor(42, 0);
    const result = resolveCheck({ seed: 42, counter: 0 }, sheet(), check);
    expect(result.roll).toBe(roll);
    expect(result.attributeValue).toBe(2);
    expect(result.total).toBe(roll + 2);
    expect(result.success).toBe(roll + 2 >= 5);
    expect(result.text).toBe(result.success ? "The vow holds." : "It slips.");
  });

  it("a higher attribute never turns a success into a failure", () => {
    for (let counter = 0; counter < 50; counter++) {
      const weak = resolveCheck({ seed: 3, counter }, sheet(), check);
      const strong = resolveCheck(
        { seed: 3, counter },
        sheet({ attributes: { might: 1, wits: 1, heart: 6 } }),
        check,
      );
      if (weak.success) expect(strong.success).toBe(true);
    }
  });
});

describe("resolveCheckOn", () => {
  const costly: Check = {
    attribute: "wits",
    difficulty: 4,
    cost: { resource: "focus", amount: 2 },
    success: { text: "You see it.", effects: [{ op: "setFlag", key: "saw-it", value: true }] },
    failure: { text: "Nothing.", effects: [{ op: "adjustResource", resource: "vigor", delta: -1 }] },
  };

  it("spends the cost whether or not the check lands, and advances the counter", () => {
    const state = initialAreaState(area(), 5);
    const { state: after, result } = resolveCheckOn(state, costly);
    expect(after.sheet.resources.focus.current).toBe(2); // 4 - 2, win or lose
    expect(after.rng.counter).toBe(1);
    expect(typeof result.success).toBe("boolean");
  });

  it("applies the winning branch's sheet effects but leaves flags to the caller", () => {
    // Seed chosen so the check fails: failure branch drains vigor.
    let seed = 0;
    while (seed < 200 && resolveCheck({ seed, counter: 0 }, STARTING_SHEET, costly).success) {
      seed++;
    }
    const failing = resolveCheckOn(initialAreaState(area(), seed), costly);
    expect(failing.result.success).toBe(false);
    expect(failing.state.sheet.resources.vigor.current).toBe(5);
  });

  it("refuses nothing on its own — affordability is the caller's gate", () => {
    const broke = sheet({
      resources: { vigor: { current: 6, max: 6 }, focus: { current: 0, max: 4 } },
    });
    expect(canAttemptCheck(broke, costly)).toBe(false);
    expect(canAttemptCheck(STARTING_SHEET, costly)).toBe(true);
  });
});

// --- an area with a gamble in it -------------------------------------------

function area(): AreaSpec {
  return AreaSpec.parse({
    dslVersion: 1,
    id: "shrine",
    name: "Ruined Shrine",
    description: "Moss over old stone.",
    path: "her",
    width: 4,
    height: 4,
    tiles: [{ id: "floor", name: "floor", walkable: true, color: "#3d7d43" }],
    ground: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    playerSpawn: { x: 0, y: 0 },
    entities: [
      {
        id: "warden",
        name: "Warden",
        description: "Stone-faced.",
        role: "character",
        pos: { x: 1, y: 0 },
        interaction: {
          verb: "talk",
          lines: [{ speakerId: "warden", text: "You do not belong here." }],
          choices: [
            {
              id: "insist",
              label: "Insist, and mean it.",
              reply: "You hold your ground.",
              check: {
                attribute: "heart",
                difficulty: 5,
                cost: { resource: "focus", amount: 1 },
                success: {
                  text: "The warden steps aside.",
                  effects: [{ op: "setFlag", key: "passed-warden", value: true }],
                },
                failure: {
                  text: "The warden does not move.",
                  effects: [{ op: "adjustResource", resource: "vigor", delta: -1 }],
                },
              },
            },
            { id: "leave", label: "Step back." },
          ],
        },
      },
    ],
    portals: [{ id: "out", pos: { x: 3, y: 3 }, label: "away", transition: { type: "generate", hint: "onward" } }],
  });
}

describe("applyConvoChoice with a check", () => {
  it("resolves the gamble and reports it alongside the reply", () => {
    const spec = area();
    const state = { ...initialAreaState(spec, 11), pos: { x: 0, y: 0 } };
    const outcome = applyConvoChoice(state, spec, "warden", "insist");
    expect(outcome.reply).toBe("You hold your ground.");
    expect(outcome.check).toBeDefined();
    expect(outcome.state.sheet.resources.focus.current).toBe(3); // paid 1
    if (outcome.check?.success) {
      expect(outcome.state.flags["passed-warden"]).toBe(true);
    } else {
      expect(outcome.state.sheet.resources.vigor.current).toBe(5);
    }
  });

  it("leaves a checkless choice exactly as before", () => {
    const spec = area();
    const state = initialAreaState(spec, 11);
    const outcome = applyConvoChoice(state, spec, "warden", "leave");
    expect(outcome.check).toBeUndefined();
    expect(outcome.state.sheet).toEqual(state.sheet);
    expect(outcome.state.rng.counter).toBe(0);
  });

  it("refuses a gamble the player cannot pay for", () => {
    const spec = area();
    const base = initialAreaState(spec, 11);
    const broke = {
      ...base,
      sheet: {
        ...base.sheet,
        resources: { vigor: { current: 6, max: 6 }, focus: { current: 0, max: 4 } },
      },
    };
    expect(choiceAffordable(broke, spec.entities[0]!.interaction!.choices[0]!)).toBe(false);
    expect(() => applyConvoChoice(broke, spec, "warden", "insist")).toThrow(/cannot pay/);
  });

  it("replays identically from the same seed", () => {
    const spec = area();
    const once = applyConvoChoice(initialAreaState(spec, 77), spec, "warden", "insist");
    const twice = applyConvoChoice(initialAreaState(spec, 77), spec, "warden", "insist");
    expect(once.check?.roll).toBe(twice.check?.roll);
    expect(once.state).toEqual(twice.state);
  });
});
