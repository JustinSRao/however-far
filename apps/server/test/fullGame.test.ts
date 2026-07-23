import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PlaythroughExport } from "@howeverfar/schema";
import { mintLicense } from "@howeverfar/entitlement";
import { buildServer } from "../src/app.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

/**
 * The whole game, end to end, on a fake model: prologue → the crossing → a
 * generated area → the threshold → the Call → the shared world → the ending
 * that resolves. Both paths, then both players.
 *
 * This is the test that says "playable from start to finish" and means it. It
 * spends nothing: every model call is a canned, schema-validated payload, so
 * what it proves is that the wiring holds — not that the prose is good.
 */

const SECRET = "end-to-end-secret";
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "howeverfar-e2e-"));
  process.env["HOWEVERFAR_HOME"] = home;
});

afterEach(() => {
  delete process.env["HOWEVERFAR_HOME"];
  rmSync(home, { recursive: true, force: true });
});

/** A generated area with a door onward and a door that ends the path. */
function area(id: string, path: "her" | "his" | "reunion"): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: `Area ${id}`,
      description:
        "Somewhere the story brought you, described at enough length to satisfy the schema's appetite for prose.",
      path,
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
          id: "the-end",
          pos: { x: 4, y: 3 },
          label: "the last door",
          transition: {
            type: "ending",
            tone: "bittersweet",
            hint: "The end of this side of it.",
          },
        },
      ],
      onEnterEffects: [],
    },
  };
}

function threshold(path: "her" | "his"): unknown {
  return {
    title: path === "her" ? "The Gate at Low Tide" : "The Underpass, Again",
    closingText: "x".repeat(300),
    threshold:
      path === "her"
        ? "The gate needs a hand on the far side, and there is nobody standing there."
        : "He knows where she is and cannot reach her; knowing is not a door.",
    tone: "bittersweet",
    reunionSeeds: [
      {
        id: path === "her" ? "seed-vowthread" : "seed-ribbon",
        statement:
          path === "her" ? "She binds bonds into force." : "The ribbon remembers her.",
      },
    ],
  };
}

interface Area {
  id: string;
  path: string;
  portals: {
    id: string;
    label: string;
    pos: { x: number; y: number };
    transition: { type: string };
  }[];
}

/** Play one path from the first street to its threshold, and export what it earned. */
async function playAPath(
  app: FastifyInstance,
  model: FakeModelClient,
  path: "her" | "his",
  playerName: string,
): Promise<PlaythroughExport> {
  const created = await app.inject({
    method: "POST",
    url: "/api/world-sessions",
    payload: { mode: "new" },
  });
  const { sessionId, area: firstArea } = created.json() as {
    sessionId: string;
    area: Area;
  };
  expect(firstArea.id).toBe("prologue-street");

  const act = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: `/api/world-sessions/${sessionId}/action`,
      payload,
    });

  // Free text in the prologue is a signal only — the evening is hand-authored.
  const said = await act({ type: "freeText", text: "hold onto her hand" });
  expect((said.json() as { ack: string }).ack).toContain("already written");

  // Walk the prologue as written: each area's onward door leads to the next,
  // until the crossing, where two doors ask which side you want to live.
  let here = firstArea;
  while (here.id !== "prologue-crossing") {
    const onward = here.portals.find((p) => p.transition.type === "area");
    expect(onward, `${here.id} has no way onward`).toBeDefined();
    if (!onward) return undefined as never;
    const walked = await act({ type: "moveTo", pos: onward.pos });
    expect(walked.statusCode, `walking to ${onward.label}`).toBe(200);
    const through = await act({ type: "portal", portalId: onward.id });
    expect(through.statusCode, `taking ${onward.label}`).toBe(200);
    here = (through.json() as { area: Area }).area;
  }

  // Stand at the door for this side.
  const door = path === "her" ? "choose-her-path" : "choose-his-path";
  const doorway = here.portals.find((p) => p.id === door);
  expect(doorway).toBeDefined();
  if (!doorway) return undefined as never;
  expect((await act({ type: "moveTo", pos: doorway.pos })).statusCode).toBe(200);

  // The crossing: profile, arc, first area, continuity, facts.
  model.push(makeProfile());
  model.push(makeArc({ finalAct: true }));
  model.push(area(`${path}-first`, path));
  model.push({ ok: true });
  model.push({ facts: [] });

  const crossed = await act({ type: "portal", portalId: door });
  expect(crossed.statusCode).toBe(200);
  const arrived = crossed.json() as { kind: string; area: { id: string; path: string } };
  expect(arrived.kind).toBe("area");
  expect(arrived.area.path).toBe(path);

  // Walk to the last door and take it.
  const moved = await act({ type: "moveTo", pos: { x: 4, y: 3 } });
  expect(moved.statusCode).toBe(200);

  model.push(threshold(path));
  const ended = await act({ type: "portal", portalId: "the-end" });
  expect(ended.statusCode).toBe(200);
  const finale = ended.json() as {
    kind: string;
    ending: { title: string; reunionSeeds: { id: string }[] };
  };
  expect(finale.kind).toBe("threshold");
  expect(finale.ending.reunionSeeds.length).toBeGreaterThan(0);

  const exported = await app.inject({
    method: "POST",
    url: `/api/world-sessions/${sessionId}/export`,
    payload: { playerName },
  });
  expect(exported.statusCode).toBe(200);
  return exported.json() as PlaythroughExport;
}

describe("the whole game", () => {
  it("plays both paths to their thresholds, then the Reunion to the end", async () => {
    const model = new FakeModelClient();
    const app = buildServer({ model, entitlement: { secret: SECRET, unlocked: false } });

    // --- Two solo playthroughs, one per side ---
    const herRun = await playAPath(app, model, "her", "Rin");
    const hisRun = await playAPath(app, model, "his", "Kaito");
    expect(herRun.path).toBe("her");
    expect(hisRun.path).toBe("his");

    // --- The Call, from both sides ---
    const callBody = (path: "her" | "his", playthrough: PlaythroughExport) => {
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
        createdAt: new Date().toISOString(),
        self,
        calling,
        path,
        license: mintLicense(SECRET, self.email),
        playthrough,
      };
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: callBody("her", herRun),
    });
    expect((first.json() as { kind: string }).kind).toBe("waiting");

    model.push(makeArc({ finalAct: true })); // the shared arc
    const second = await app.inject({
      method: "POST",
      url: "/api/crossing/call",
      payload: callBody("his", hisRun),
    });
    const { reunionId } = second.json() as { kind: string; reunionId: string };
    expect(reunionId).toBeTruthy();

    // --- The shared world ---
    model.push(area("the-seam", "reunion"));
    model.push({ facts: [] });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const { WebSocket } = await import("ws");

    const open = (role: "her" | "his") =>
      new Promise<{ socket: InstanceType<typeof WebSocket>; messages: Record<string, unknown>[] }>(
        (resolve, reject) => {
          const socket = new WebSocket(
            `ws://127.0.0.1:${port}/api/reunions/${reunionId}/play?role=${role}`,
          );
          const messages: Record<string, unknown>[] = [];
          socket.on("error", reject);
          socket.on("message", (raw: Buffer) => {
            const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
            messages.push(msg);
            if (msg["type"] === "welcome") resolve({ socket, messages });
            if (msg["type"] === "error") reject(new Error(String(msg["message"])));
          });
        },
      );

    const her = await open("her");
    const his = await open("his");

    const welcome = her.messages.find((m) => m["type"] === "welcome") as {
      area: { id: string; path: string };
      state: { her: { pos: { x: number; y: number } }; his: { pos: { x: number; y: number } } };
    };
    expect(welcome.area.id).toBe("the-seam");
    expect(welcome.area.path).toBe("reunion");
    // Both are in the room, and not on the same tile.
    expect(welcome.state.her.pos).not.toEqual(welcome.state.his.pos);

    const waitFor = (
      side: { messages: Record<string, unknown>[] },
      predicate: (m: Record<string, unknown>) => boolean,
    ) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const poll = (): void => {
          const found = side.messages.find(predicate);
          if (found) return resolve(found);
          if (Date.now() > deadline) return reject(new Error("timed out"));
          setTimeout(poll, 10);
        };
        poll();
      });

    // She walks; he sees it. This is the thing the whole phase is for.
    // Not onto his tile — he is standing beside her and he is solid.
    her.socket.send(JSON.stringify({ action: { type: "moveTo", pos: { x: 1, y: 3 } } }));
    const seen = (await waitFor(
      his,
      (m) => m["type"] === "turn" && m["by"] === "her",
    )) as { result: { state: { her: { pos: { x: number; y: number } } } } };
    expect(seen.result.state.her.pos).toEqual({ x: 1, y: 3 });

    // Together to the last door, and through it. Turns are serialized per
    // world, so the walk lands before the door is tried.
    her.socket.send(JSON.stringify({ action: { type: "moveTo", pos: { x: 4, y: 3 } } }));

    model.push({
      title: "However Far",
      closingText: "z".repeat(400),
      tone: "triumphant",
      paidOffSeedIds: ["her-seed-vowthread", "his-seed-ribbon"],
    });
    her.socket.send(JSON.stringify({ action: { type: "portal", portalId: "the-end" } }));

    const ending = (await waitFor(
      his,
      (m) =>
        m["type"] === "turn" &&
        (m["result"] as { kind?: string } | undefined)?.kind === "ending",
    )) as { result: { ending: { title: string; paidOffSeedIds: string[] } } };

    // The only ending in the game that resolves — and it pays off both sides.
    expect(ending.result.ending.title).toBe("However Far");
    expect(ending.result.ending.paidOffSeedIds).toContain("her-seed-vowthread");
    expect(ending.result.ending.paidOffSeedIds).toContain("his-seed-ribbon");

    her.socket.close();
    his.socket.close();
    await app.close();
  }, 30_000);
});
