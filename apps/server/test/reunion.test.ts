import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrossingCall, PlaythroughExport } from "@howeverfar/schema";
import { mintLicense } from "@howeverfar/entitlement";
import { buildServer } from "../src/app.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

const SECRET = "test-secret";
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "howeverfar-reunion-test-"));
  process.env["HOWEVERFAR_HOME"] = home;
});

afterEach(() => {
  delete process.env["HOWEVERFAR_HOME"];
  rmSync(home, { recursive: true, force: true });
});

function playthrough(path: "her" | "his"): PlaythroughExport {
  return {
    formatVersion: 1,
    sessionId: `world-${path}`,
    path,
    playerName: path === "her" ? "Rin" : "Kaito",
    completedAt: "2026-07-22T12:00:00.000Z",
    profile: makeProfile(),
    arc: makeArc({ finalAct: true }),
    canon: [
      {
        id: "fact-1",
        statement:
          path === "her"
            ? "Suzune binds bonds into force; her allies call it vowthread."
            : "Itsuki kept the ribbon; it is the only object that disagrees with the world.",
        entities: [],
        sceneId: "somewhere",
      },
    ],
    characters: [],
    sheet: {
      attributes: { might: 2, wits: 2, heart: 3 },
      resources: { vigor: { current: 4, max: 5 }, focus: { current: 3, max: 4 } },
      standings: {},
    },
    ending: {
      title: path === "her" ? "The Gate at Low Tide" : "The Underpass, Again",
      closingText: "x".repeat(260),
      threshold:
        path === "her"
          ? "The gate needs a hand on the far side and there is nobody there to give it."
          : "He knows where she is and cannot reach her; knowing is not a door.",
      tone: "bittersweet",
      reunionSeeds: [
        {
          id: path === "her" ? "seed-vowthread" : "seed-ribbon",
          statement: path === "her" ? "She binds bonds into force." : "The ribbon remembers her.",
        },
      ],
    },
    road: [],
  };
}

function call(overrides: Partial<CrossingCall> = {}): CrossingCall {
  const path = overrides.path ?? "her";
  const self =
    path === "her"
      ? { name: "Rin", email: "rin@example.com" }
      : { name: "Kaito", email: "kaito@example.com" };
  const calling =
    path === "her"
      ? { name: "Kaito", email: "kaito@example.com" }
      : { name: "Rin", email: "rin@example.com" };
  return {
    id: `call-${path}`,
    createdAt: "2026-07-22T12:00:00.000Z",
    self,
    calling,
    path,
    license: mintLicense(SECRET, self.email),
    playthrough: playthrough(path),
    ...overrides,
  };
}

function makeReunionArea(id: string): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: "The Seam",
      description:
        "The underpass, and not the underpass. Tile and moss at once, and the two of you standing in it.",
      path: "reunion",
      width: 6,
      height: 5,
      tiles: [
        { id: "dark", name: "dark", walkable: false, color: "#0b0c12" },
        { id: "tile", name: "tile", walkable: true, color: "#94b0c2" },
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
          label: "further in",
          transition: { type: "generate", hint: "Together." },
        },
      ],
      onEnterEffects: [],
    },
  };
}

function serverWith(model: FakeModelClient, unlocked = false) {
  return buildServer({ model, entitlement: { secret: SECRET, unlocked } });
}

describe("the Call", () => {
  it("waits for the other side, then opens a world when they answer", async () => {
    const model = new FakeModelClient();
    const app = serverWith(model);

    const first = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "her" }),
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { kind: string }).kind).toBe("waiting");
    // Nothing has been written yet: a call that nobody answered costs nothing.
    expect(model.calls).toHaveLength(0);

    // The shared arc is planned the moment the two calls answer each other.
    model.push(makeArc({ finalAct: true }));

    const second = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "his" }),
    });
    expect(second.statusCode).toBe(200);
    const paired = second.json() as { kind: string; reunionId: string };
    expect(paired.kind).toBe("paired");
    expect(paired.reunionId).toMatch(/^reunion-/);

    // And the side that called first finds out by polling their address.
    const status = await app.inject({
      method: "GET",
      url: "/api/crossing/status?email=rin%40example.com",
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      paired: true,
      reunionId: paired.reunionId,
      role: "her",
    });

    const stranger = await app.inject({
      method: "GET",
      url: "/api/crossing/status?email=nobody%40example.com",
    });
    expect(stranger.json()).toEqual({ paired: false });
    await app.close();
  });

  it("refuses a one-sided call — nobody is dragged across", async () => {
    const model = new FakeModelClient();
    const app = serverWith(model);
    await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "her" }),
    });
    const stranger = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({
        path: "his",
        id: "call-stranger",
        calling: { name: "Someone", email: "someone-else@example.com" },
      }),
    });
    expect((stranger.json() as { kind: string }).kind).toBe("waiting");
    expect(model.calls).toHaveLength(0);
    await app.close();
  });

  it("refuses to cross toward yourself", async () => {
    const app = serverWith(new FakeModelClient());
    const res = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({
        path: "her",
        calling: { name: "Rin", email: "rin@example.com" },
      }),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("charges for the DLC: a call without a valid key does not carry", async () => {
    const app = serverWith(new FakeModelClient());
    const res = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "her", license: "HF1-XXXX-XXXX-XXXX-XXXX" }),
    });
    expect(res.statusCode).toBe(402);
    await app.close();
  });

  it("checks BOTH players' keys, not just the caller's", async () => {
    const model = new FakeModelClient();
    const app = serverWith(model);
    // Her key is good and her call waits.
    await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "her" }),
    });
    // His is minted under someone else's secret — the pairing must not open.
    const res = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "his", license: mintLicense("a-different-secret", "kaito@example.com") }),
    });
    expect(res.statusCode).toBe(402);
    expect(model.calls).toHaveLength(0);
    await app.close();
  });

  it("lets a development build through when it is told to explicitly", async () => {
    const model = new FakeModelClient();
    const app = serverWith(model, true);
    const res = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: { ...call({ path: "her" }), license: undefined },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("the shared world", () => {
  it("opens on the seam and puts both players in it", async () => {
    const model = new FakeModelClient();
    const app = serverWith(model);
    model.push(makeArc({ finalAct: true }));
    await app.inject({ method: "POST", url: "/api/crossing/call", payload: call({ path: "her" }) });
    const paired = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: call({ path: "his" }),
    });
    const { reunionId } = paired.json() as { reunionId: string };

    // The opening area and its fact extraction.
    model.push(makeReunionArea("the-seam"));
    model.push({ facts: [] });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;

    const { WebSocket } = await import("ws");
    const her = new WebSocket(`ws://127.0.0.1:${port}/api/reunions/${reunionId}/play?role=her`);
    const welcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
      her.on("error", reject);
      her.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg["type"] === "welcome") resolve(msg);
        if (msg["type"] === "error") reject(new Error(String(msg["message"])));
      });
    });

    expect(welcome["role"]).toBe("her");
    const area = welcome["area"] as { id: string; path: string };
    expect(area.id).toBe("the-seam");
    expect(area.path).toBe("reunion");
    const state = welcome["state"] as {
      her: { pos: unknown; connected: boolean };
      his: { pos: unknown };
    };
    expect(state.her.connected).toBe(true);
    // Both are placed, and not on top of each other.
    expect(state.her.pos).not.toEqual(state.his.pos);

    her.close();
    await app.close();
  });
});
