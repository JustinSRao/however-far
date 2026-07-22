import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "unwritten-world-test-"));
  process.env["UNWRITTEN_HOME"] = home;
});

afterAll(() => {
  delete process.env["UNWRITTEN_HOME"];
  rmSync(home, { recursive: true, force: true });
});

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

describe("world session routes", () => {
  it("creates a session in the prologue and lists it", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const created = await app.inject({
      method: "POST",
      url: "/api/world-sessions",
      payload: { mode: "new" },
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as {
      sessionId: string;
      phase: string;
      area: { id: string };
    };
    expect(body.phase).toBe("prologue");
    expect(body.area.id).toBe("prologue-street");

    const listed = await app.inject({ method: "GET", url: "/api/world-sessions" });
    expect(listed.statusCode).toBe(200);
    expect(
      (listed.json() as Array<{ id: string }>).some((s) => s.id === body.sessionId),
    ).toBe(true);
    await app.close();
  });

  it("plays the prologue over HTTP and crosses into a generated area", async () => {
    const model = new FakeModelClient();
    const app = buildServer({ model });
    const created = await app.inject({
      method: "POST",
      url: "/api/world-sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };

    const act = (payload: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: `/api/world-sessions/${sessionId}/action`,
        payload,
      });

    // Illegal action: portal we are not standing on.
    const denied = await act({ type: "portal", portalId: "walk-to-school" });
    expect(denied.statusCode).toBe(502);

    // Resume-with-hydration path: reload the app to prove disk persistence.
    const resumed = await app.inject({
      method: "POST",
      url: "/api/world-sessions",
      payload: { mode: "resume", id: sessionId },
    });
    expect(resumed.statusCode).toBe(200);

    // Free text is acknowledged without any model call.
    const ft = await act({ type: "freeText", text: "wave at maru" });
    expect(ft.statusCode).toBe(200);
    expect((ft.json() as { kind: string }).kind).toBe("ok");
    expect(model.calls).toHaveLength(0);
    await app.close();
  });

  it("the crossing needs the model and returns the first generated area", async () => {
    const model = new FakeModelClient();
    const app = buildServer({ model });
    const created = await app.inject({
      method: "POST",
      url: "/api/world-sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };

    // Teleport the saved session to the crossing door by editing the snapshot
    // through the manager's own persistence (hydrate-edit-save), the way a
    // played-through session would arrive there.
    const { loadWorldSession, saveWorldSession } = await import("@unwritten/library");
    const save = loadWorldSession(sessionId);
    save.state.currentAreaId = "prologue-crossing";
    save.state.pos = { x: 1, y: 3 };
    save.state.visitedAreaIds = ["prologue-street", "prologue-crossing"];
    saveWorldSession(save);

    model.push(makeProfile());
    model.push(makeArc());
    model.push(makeGeneratedArea("summoning-hall"));
    model.push({ ok: true });
    model.push({ facts: [] });

    // Fresh server instance to force hydration from disk.
    const app2 = buildServer({ model });
    const crossed = await app2.inject({
      method: "POST",
      url: `/api/world-sessions/${sessionId}/action`,
      payload: { type: "portal", portalId: "choose-her-path" },
    });
    expect(crossed.statusCode).toBe(200);
    const body = crossed.json() as { kind: string; area: { id: string; path: string } };
    expect(body.kind).toBe("area");
    expect(body.area.id).toBe("summoning-hall");

    const after = loadWorldSession(sessionId);
    expect(after.phase).toBe("generated");
    expect(after.path).toBe("her");
    await app.close();
    await app2.close();
  });

  it("rejects malformed actions with 400", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const created = await app.inject({
      method: "POST",
      url: "/api/world-sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };
    const res = await app.inject({
      method: "POST",
      url: `/api/world-sessions/${sessionId}/action`,
      payload: { type: "teleport", x: 1, y: 1 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
