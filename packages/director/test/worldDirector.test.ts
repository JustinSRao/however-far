import { describe, expect, it } from "vitest";
import { WorldDirector } from "../src/worldDirector.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

function makeGeneratedArea(id: string): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: `Area ${id}`,
      description:
        "Stone the color of old moonlight. A circle of chalk still smokes on the floor, and the air itself is listening.",
      path: "her",
      width: 6,
      height: 5,
      tiles: [
        { id: "wall", name: "wall", walkable: false, color: "#333c57" },
        { id: "floor", name: "floor", walkable: true, color: "#94b0c2" },
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
          label: "a corridor of banners",
          transition: { type: "generate", hint: "Deeper into the hall." },
        },
      ],
      onEnterEffects: [],
    },
  };
}

describe("WorldDirector", () => {
  it("starts in the prologue on the street", () => {
    const director = new WorldDirector({ model: new FakeModelClient() });
    const session = director.getSession();
    expect(session.phase).toBe("prologue");
    expect(session.path).toBe("shared");
    expect(director.currentArea().id).toBe("prologue-street");
  });

  it("runs interactions authoritatively and records signals", async () => {
    const director = new WorldDirector({ model: new FakeModelClient() });
    // Position next to Maru the cat via a hydrated save (engine enforces reach).
    const save = director.getSession();
    save.state.pos = { x: 6, y: 3 };
    const near = new WorldDirector({ model: new FakeModelClient() }, save);

    const result = await near.handleAction({ type: "interact", entityId: "maru" });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.state.flags["greeted-maru"]).toBe(true);
    const signals = near.getSession().signals;
    expect(signals[0]).toMatchObject({ kind: "interact", sceneId: "prologue-street" });
  });

  it("navigates authored area transitions without any model call", async () => {
    const director = new WorldDirector({ model: new FakeModelClient() });
    const save = director.getSession();
    save.state.pos = { x: 15, y: 4 }; // the walk-to-school portal
    const ready = new WorldDirector({ model: new FakeModelClient() }, save);
    const result = await ready.handleAction({ type: "portal", portalId: "walk-to-school" });
    expect(result.kind).toBe("area");
    if (result.kind !== "area") throw new Error("unreachable");
    expect(result.area.id).toBe("prologue-walk-home");
    expect(result.state.pos).toEqual(result.area.playerSpawn);
  });

  it("the crossing commits the path: profile, seeds, arc, first generated area", async () => {
    const model = new FakeModelClient();
    const director = new WorldDirector({ model });
    const save = director.getSession();
    save.state.currentAreaId = "prologue-crossing";
    save.state.pos = { x: 1, y: 3 }; // choose-her-path portal
    save.state.visitedAreaIds = ["prologue-street", "prologue-crossing"];
    const atDoor = new WorldDirector({ model }, save);

    model.push(makeProfile()); // Profiler
    model.push(makeArc()); // World Architect
    model.push(makeGeneratedArea("summoning-hall")); // World Writer
    model.push({ ok: true }); // Continuity checker (seed canon exists)
    model.push({ facts: [] }); // Fact extraction

    const result = await atDoor.handleAction({
      type: "portal",
      portalId: "choose-her-path",
    });
    expect(result.kind).toBe("area");
    if (result.kind !== "area") throw new Error("unreachable");
    expect(result.area.id).toBe("summoning-hall");

    const session = atDoor.getSession();
    expect(session.phase).toBe("generated");
    expect(session.path).toBe("her");
    expect(session.state.currentAreaId).toBe("summoning-hall");
    const statements = session.canon.map((f) => f.statement).join(" ");
    expect(statements).toContain("summoned by the Villainess");
    expect(statements).toContain("still warm");
    // The Architect was called with the path register and the immutable rails.
    const architectCall = model.calls[1];
    expect(architectCall?.user).toContain("Path A");
    expect(architectCall?.user).toContain("immutable rails");
  });

  it("free text is acknowledged, recorded, and never generates during the prologue", async () => {
    const model = new FakeModelClient();
    const director = new WorldDirector({ model });
    const result = await director.handleAction({
      type: "freeText",
      text: "hug suzune before she can say anything",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.ack).toBeTruthy();
    expect(model.calls).toHaveLength(0);
    expect(director.getSession().signals[0]).toMatchObject({ kind: "freeText" });
  });
});
