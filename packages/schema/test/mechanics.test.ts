import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AreaEffect,
  AreaGameState,
  AreaSpec,
  Check,
  CharacterSheet,
  STARTING_SHEET,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

function checksFixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(here, "../fixtures/area-checks-example.json"), "utf8"),
  ) as Record<string, unknown>;
}

describe("AreaEffect", () => {
  it("still accepts every v0 effect op", () => {
    expect(AreaEffect.parse({ op: "setFlag", key: "a", value: true }).op).toBe("setFlag");
    expect(AreaEffect.parse({ op: "addItem", item: "x", name: "X" }).op).toBe("addItem");
    expect(AreaEffect.parse({ op: "removeItem", item: "x" }).op).toBe("removeItem");
  });

  it("accepts the mechanical ops", () => {
    expect(AreaEffect.parse({ op: "adjustResource", resource: "focus", delta: -2 })).toBeTruthy();
    expect(AreaEffect.parse({ op: "adjustResourceMax", resource: "vigor", delta: 2 })).toBeTruthy();
    expect(AreaEffect.parse({ op: "adjustAttribute", attribute: "heart", delta: 1 })).toBeTruthy();
    expect(
      AreaEffect.parse({ op: "adjustStanding", standing: "a-court", label: "A Court", delta: 1 }),
    ).toBeTruthy();
  });

  it("rejects unknown resources, attributes, and oversized growth", () => {
    expect(() => AreaEffect.parse({ op: "adjustResource", resource: "mana", delta: 1 })).toThrow();
    expect(() => AreaEffect.parse({ op: "adjustAttribute", attribute: "luck", delta: 1 })).toThrow();
    expect(() =>
      AreaEffect.parse({ op: "adjustAttribute", attribute: "might", delta: 9 }),
    ).toThrow();
  });
});

describe("Check", () => {
  const base = {
    attribute: "wits",
    difficulty: 5,
    success: { text: "yes" },
    failure: { text: "no" },
  };

  it("defaults each branch's effects to empty", () => {
    const parsed = Check.parse(base);
    expect(parsed.success.effects).toEqual([]);
    expect(parsed.cost).toBeUndefined();
  });

  it("holds difficulty inside 1..10", () => {
    expect(() => Check.parse({ ...base, difficulty: 0 })).toThrow();
    expect(() => Check.parse({ ...base, difficulty: 11 })).toThrow();
  });

  it("requires both branches — a check must say what failure looks like", () => {
    expect(() => Check.parse({ attribute: "wits", difficulty: 5, success: { text: "yes" } })).toThrow();
  });
});

describe("CharacterSheet", () => {
  it("accepts the starting sheet", () => {
    expect(CharacterSheet.parse(STARTING_SHEET)).toEqual(STARTING_SHEET);
  });

  it("clamps standings to the readable -3..3 band", () => {
    expect(() =>
      CharacterSheet.parse({
        ...STARTING_SHEET,
        standings: { court: { label: "Court", value: 9 } },
      }),
    ).toThrow();
  });
});

describe("AreaGameState migration", () => {
  it("loads a pre-mechanics save and fills in the starting sheet", () => {
    const old = {
      currentAreaId: "aozora-lane",
      pos: { x: 3, y: 4 },
      facing: "down",
      flags: {},
      inventory: [],
      visitedAreaIds: ["aozora-lane"],
      usedInteractions: [],
    };
    const parsed = AreaGameState.parse(old);
    expect(parsed.sheet).toEqual(STARTING_SHEET);
    expect(parsed.rng).toEqual({ seed: 1, counter: 0 });
  });
});

describe("the checks fixture", () => {
  it("parses as an AreaSpec", () => {
    const area = AreaSpec.parse(checksFixture());
    expect(area.path).toBe("his");
    expect(area.entities).toHaveLength(3);
  });

  it("demonstrates a check on a choice, with both branches", () => {
    const area = AreaSpec.parse(checksFixture());
    const clerk = area.entities.find((e) => e.id === "clerk-arakawa-shiori");
    const press = clerk?.interaction?.choices.find((c) => c.id === "press-records");
    expect(press?.check?.attribute).toBe("wits");
    expect(press?.check?.cost).toEqual({ resource: "focus", amount: 1 });
    expect(press?.check?.success.effects.length).toBeGreaterThan(0);
    expect(press?.check?.failure.effects.length).toBeGreaterThan(0);
  });

  it("shows a checkless choice still works alongside gambles", () => {
    const area = AreaSpec.parse(checksFixture());
    const clerk = area.entities.find((e) => e.id === "clerk-arakawa-shiori");
    const withdraw = clerk?.interaction?.choices.find((c) => c.id === "withdraw");
    expect(withdraw?.check).toBeUndefined();
  });

  it("names its new character with a kanji meaning (ADR-0014)", () => {
    const area = AreaSpec.parse(checksFixture());
    const clerk = area.entities.find((e) => e.id === "clerk-arakawa-shiori");
    expect(clerk?.nameMeaning).toMatch(/荒川|栞/);
  });
});
