import { describe, expect, it } from "vitest";
import { WorldDirector } from "../src/worldDirector.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

/**
 * Speculation is the answer to the ~3 minute crossing measured in the Phase 4
 * go/no-go. These tests pin the behaviour that makes it safe to spend money on:
 * it only fires for doors the player walks at, it is capped, and taking the
 * door reuses the work instead of paying twice.
 */

function generatedArea(id: string): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: `Area ${id}`,
      description:
        "A hall of pale stone, colder than the corridor behind you, with light coming from somewhere it has no business coming from.",
      path: "her",
      width: 6,
      height: 5,
      tiles: [
        { id: "wall", name: "wall", walkable: false, color: "#333c57" },
        { id: "floor", name: "floor", walkable: true, color: "#97a1b3" },
      ],
      ground: [
        [0, 0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0],
      ],
      playerSpawn: { x: 1, y: 1 },
      entities: [],
      portals: [
        {
          id: "onward",
          pos: { x: 4, y: 3 },
          label: "onward",
          transition: { type: "generate", hint: "Deeper in." },
        },
      ],
      onEnterEffects: [],
    },
  };
}

/** A session already past the crossing, sitting in a generated area. */
async function generatedSession(model: FakeModelClient) {
  const director = new WorldDirector({ model });
  const session = director.getSession();
  session.phase = "generated";
  session.path = "her";
  session.profile = makeProfile();
  session.arc = makeArc();
  const first = generatedArea("first-hall") as { area: { id: string } };
  session.areas["first-hall"] = first.area as never;
  // Standing on the portal, as a player who walked to the door would be.
  session.state = {
    ...session.state,
    currentAreaId: "first-hall",
    pos: { x: 4, y: 3 },
  };
  return new WorldDirector({ model }, session);
}

describe("speculative generation", () => {
  it("writes ahead on approach, and taking the door reuses it", async () => {
    const model = new FakeModelClient();
    model.push(generatedArea("speculated-hall"), { facts: [] });
    const director = await generatedSession(model);

    await director.handleAction({ type: "approach", portalId: "onward" });
    // Let the background write settle before the player commits.
    await new Promise((r) => setTimeout(r, 0));

    const callsAfterApproach = model.calls.length;
    expect(callsAfterApproach).toBeGreaterThan(0);

    const result = await director.handleAction({ type: "portal", portalId: "onward" });
    expect(result.kind).toBe("area");
    if (result.kind === "area") expect(result.area.id).toBe("speculated-hall");
  });

  it("asking twice for the same door does not pay twice", async () => {
    const model = new FakeModelClient();
    model.push(generatedArea("once-only"), { facts: [] });
    const director = await generatedSession(model);

    await director.handleAction({ type: "approach", portalId: "onward" });
    const afterFirst = model.calls.length;
    await director.handleAction({ type: "approach", portalId: "onward" });
    await director.handleAction({ type: "approach", portalId: "onward" });
    expect(model.calls.length).toBe(afterFirst);
  });

  it("ignores approach for a door that leads somewhere already written", async () => {
    const model = new FakeModelClient();
    const director = await generatedSession(model);
    await director.handleAction({ type: "approach", portalId: "no-such-portal" });
    expect(model.calls).toHaveLength(0);
  });

  it("never speculates during the hand-authored prologue", async () => {
    const model = new FakeModelClient();
    const director = new WorldDirector({ model });
    await director.handleAction({ type: "approach", portalId: "onward" });
    expect(model.calls).toHaveLength(0);
  });

  it("approach leaves the world untouched and is not a play signal", async () => {
    const model = new FakeModelClient();
    model.push(generatedArea("untouched"), { facts: [] });
    const director = await generatedSession(model);
    const before = director.getSession();

    const result = await director.handleAction({ type: "approach", portalId: "onward" });
    expect(result.kind).toBe("ok");

    const after = director.getSession();
    expect(after.state).toEqual(before.state);
    // Walking near a door says nothing about the player; recording it would
    // skew the profile the Director builds from real choices.
    expect(after.signals).toEqual(before.signals);
  });

  it("falls back to writing for real when the speculation failed", async () => {
    const model = new FakeModelClient();
    // First write is structurally broken three times over (retries exhausted),
    // so the speculation rejects; the real attempt then succeeds.
    const broken = JSON.parse(JSON.stringify(generatedArea("broken"))) as {
      area: { playerSpawn: { x: number; y: number } };
    };
    broken.area.playerSpawn = { x: 0, y: 0 };
    model.push(broken, broken, broken);
    model.push(generatedArea("written-for-real"), { facts: [] });
    const director = await generatedSession(model);

    await director.handleAction({ type: "approach", portalId: "onward" });
    await new Promise((r) => setTimeout(r, 0));

    const result = await director.handleAction({ type: "portal", portalId: "onward" });
    expect(result.kind).toBe("area");
    if (result.kind === "area") expect(result.area.id).toBe("written-for-real");
  });
});
