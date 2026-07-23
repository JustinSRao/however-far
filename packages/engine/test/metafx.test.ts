import { describe, expect, it } from "vitest";
import { AreaSpec, type StoryPath } from "@howeverfar/schema";
import { applyAreaEffects, initialAreaState, validateAreaIntegrity } from "../src/index.js";

/**
 * ADR-0015 puts hard constraints on Path B's interface corruption. These tests
 * are the enforcement: the engine — not the prompt, not the client — decides
 * that only his path gets to lie.
 */
function area(path: StoryPath, overrides: Record<string, unknown> = {}): AreaSpec {
  return AreaSpec.parse({
    dslVersion: 1,
    id: "empty-room",
    name: "Her Room",
    description: "A room that is one person short and does not know it.",
    path,
    width: 4,
    height: 4,
    tiles: [{ id: "floor", name: "floor", walkable: true, color: "#bcbfc2" }],
    ground: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    playerSpawn: { x: 0, y: 0 },
    entities: [],
    portals: [
      { id: "out", pos: { x: 3, y: 3 }, label: "out", transition: { type: "generate", hint: "on" } },
    ],
    ...overrides,
  });
}

const forget = { op: "metaFx", fx: { kind: "forgetName", entityId: "suzune" } } as const;
const relabel = { op: "metaFx", fx: { kind: "relabelSave", label: "— (1 file)" } } as const;

describe("metaFx is Path B only", () => {
  it("records a distortion on his path", () => {
    const his = area("his");
    const state = applyAreaEffects(initialAreaState(his), [forget, relabel], his);
    expect(state.metaFx).toHaveLength(2);
    expect(state.metaFx[0]).toEqual({ kind: "forgetName", entityId: "suzune" });
  });

  it("silently drops it on her path and on shared", () => {
    for (const path of ["her", "shared"] as const) {
      const a = area(path);
      const state = applyAreaEffects(initialAreaState(a), [forget], a);
      expect(state.metaFx).toEqual([]);
    }
  });

  it("drops it when no area is in scope, rather than guessing", () => {
    const his = area("his");
    const state = applyAreaEffects(initialAreaState(his), [forget], undefined);
    expect(state.metaFx).toEqual([]);
  });

  it("does not stack the same distortion twice", () => {
    const his = area("his");
    let state = applyAreaEffects(initialAreaState(his), [forget], his);
    state = applyAreaEffects(state, [forget, forget], his);
    expect(state.metaFx).toHaveLength(1);
  });

  it("never removes anything the player needs to keep playing", () => {
    // ADR-0015: presentation over intact data. Whatever the interface claims,
    // the state underneath is untouched.
    const his = area("his");
    const before = initialAreaState(his);
    const after = applyAreaEffects(before, [forget, relabel], his);
    expect(after.sheet).toEqual(before.sheet);
    expect(after.inventory).toEqual(before.inventory);
    expect(after.quests).toEqual(before.quests);
    expect(after.currentAreaId).toBe(before.currentAreaId);
  });
});

describe("integrity validation", () => {
  it("rejects metaFx on a non-his area", () => {
    const a = area("her", { onEnterEffects: [forget] });
    expect(validateAreaIntegrity(a).join(" ")).toMatch(/Path B only/);
  });

  it("accepts metaFx on his path", () => {
    const a = area("his", { onEnterEffects: [forget] });
    expect(validateAreaIntegrity(a)).toEqual([]);
  });

  it("catches one hidden inside a check's failure branch", () => {
    const a = area("her", {
      entities: [
        {
          id: "mother",
          name: "Nemoto Kaoru",
          description: "She is setting two places at the table.",
          role: "character",
          pos: { x: 1, y: 0 },
          interaction: {
            verb: "talk",
            lines: [{ speakerId: "mother", text: "Itsuki, wash your hands." }],
            choices: [
              {
                id: "ask",
                label: "Ask about the third chair.",
                check: {
                  attribute: "heart",
                  difficulty: 6,
                  success: { text: "She pauses.", effects: [] },
                  failure: { text: "She does not.", effects: [forget] },
                },
              },
            ],
          },
        },
      ],
    });
    expect(validateAreaIntegrity(a).join(" ")).toMatch(/Path B only/);
  });
});
