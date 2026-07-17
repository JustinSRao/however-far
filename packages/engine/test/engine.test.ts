import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SceneSpec } from "@unwritten/schema";
import {
  applyAction,
  applyEffect,
  enterScene,
  initialState,
  validateSceneIntegrity,
  EngineError,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () =>
  SceneSpec.parse(
    JSON.parse(
      readFileSync(
        join(here, "../../schema/fixtures/waystation-example.json"),
        "utf8",
      ),
    ),
  );

describe("initialState / enterScene", () => {
  it("applies on-enter effects and records the visit", () => {
    const scene = fixture();
    const state = initialState(scene);
    expect(state.currentSceneId).toBe("waystation-arrival");
    expect(state.flags["reached-waystation"]).toBe(true);
    expect(state.visitedSceneIds).toEqual(["waystation-arrival"]);
  });

  it("does not duplicate visited ids on re-entry", () => {
    const scene = fixture();
    const state = enterScene(initialState(scene), scene);
    expect(state.visitedSceneIds).toEqual(["waystation-arrival"]);
  });
});

describe("applyEffect", () => {
  const base = initialState(fixture());

  it("sets flags immutably", () => {
    const next = applyEffect(base, { op: "setFlag", key: "torch-lit", value: true });
    expect(next.flags["torch-lit"]).toBe(true);
    expect(base.flags["torch-lit"]).toBeUndefined();
  });

  it("adds items idempotently and removes them", () => {
    const withItem = applyEffect(base, {
      op: "addItem",
      item: "sealed-letter",
      name: "Sealed Letter",
    });
    const twice = applyEffect(withItem, {
      op: "addItem",
      item: "sealed-letter",
      name: "Sealed Letter",
    });
    expect(twice.inventory).toHaveLength(1);
    const removed = applyEffect(twice, { op: "removeItem", item: "sealed-letter" });
    expect(removed.inventory).toHaveLength(0);
  });
});

describe("applyAction", () => {
  it("applies choice effects and returns the transition", () => {
    const scene = fixture();
    const state = initialState(scene);
    const outcome = applyAction(state, scene, {
      type: "choice",
      choiceId: "take-the-letter",
    });
    if (outcome.kind !== "transition") throw new Error("expected transition");
    expect(outcome.state.inventory[0]?.item).toBe("sealed-letter");
    expect(outcome.transition.type).toBe("generate");
  });

  it("passes free text through without state change", () => {
    const scene = fixture();
    const state = initialState(scene);
    const outcome = applyAction(state, scene, {
      type: "freeText",
      text: "read the letter by the fire",
    });
    if (outcome.kind !== "freeText") throw new Error("expected freeText");
    expect(outcome.state).toEqual(state);
  });

  it("rejects unknown choices and mismatched scenes", () => {
    const scene = fixture();
    const state = initialState(scene);
    expect(() =>
      applyAction(state, scene, { type: "choice", choiceId: "no-such-choice" }),
    ).toThrow(EngineError);
    expect(() =>
      applyAction({ ...state, currentSceneId: "elsewhere" }, scene, {
        type: "choice",
        choiceId: "take-the-letter",
      }),
    ).toThrow(EngineError);
  });
});

describe("validateSceneIntegrity", () => {
  it("accepts the fixture", () => {
    expect(validateSceneIntegrity(fixture())).toEqual([]);
  });

  it("flags dialogue from unknown speakers", () => {
    const scene = fixture();
    scene.dialogue.push({ speakerId: "ghost", text: "boo" });
    expect(validateSceneIntegrity(scene)).toHaveLength(1);
  });

  it("flags duplicate choice ids", () => {
    const scene = fixture();
    const c = scene.choices[0];
    if (!c) throw new Error("fixture has choices");
    scene.choices.push({ ...c });
    expect(validateSceneIntegrity(scene).some((p) => p.includes("duplicate"))).toBe(
      true,
    );
  });
});
