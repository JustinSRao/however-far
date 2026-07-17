import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SceneSpec, PlayerAction, GameState } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("SceneSpec", () => {
  it("accepts the golden fixture", () => {
    const raw = JSON.parse(
      readFileSync(join(here, "../fixtures/waystation-example.json"), "utf8"),
    );
    const parsed = SceneSpec.parse(raw);
    expect(parsed.id).toBe("waystation-arrival");
    expect(parsed.choices).toHaveLength(3);
  });

  it("rejects a wrong dslVersion", () => {
    const raw = JSON.parse(
      readFileSync(join(here, "../fixtures/waystation-example.json"), "utf8"),
    );
    raw.dslVersion = 999;
    expect(() => SceneSpec.parse(raw)).toThrow();
  });

  it("rejects non-slug ids", () => {
    const raw = JSON.parse(
      readFileSync(join(here, "../fixtures/waystation-example.json"), "utf8"),
    );
    raw.id = "Not A Slug!";
    expect(() => SceneSpec.parse(raw)).toThrow();
  });

  it("requires at least one choice", () => {
    const raw = JSON.parse(
      readFileSync(join(here, "../fixtures/waystation-example.json"), "utf8"),
    );
    raw.choices = [];
    expect(() => SceneSpec.parse(raw)).toThrow();
  });
});

describe("PlayerAction", () => {
  it("caps free text length", () => {
    expect(() =>
      PlayerAction.parse({ type: "freeText", text: "x".repeat(501) }),
    ).toThrow();
    expect(
      PlayerAction.parse({ type: "freeText", text: "open the letter" }).type,
    ).toBe("freeText");
  });
});

describe("GameState", () => {
  it("parses a minimal state", () => {
    const state = GameState.parse({
      currentSceneId: "waystation-arrival",
      flags: { "reached-waystation": true },
      inventory: [],
      visitedSceneIds: ["waystation-arrival"],
    });
    expect(state.flags["reached-waystation"]).toBe(true);
  });
});
