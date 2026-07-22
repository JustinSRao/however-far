import { describe, expect, it } from "vitest";
import type { AreaGameState, CanonFact } from "@unwritten/schema";
import { toOpenAISchema } from "../src/openaiSchema.js";
import { WorldWriterOutput, writeArea, WorldWriterFailedError } from "../src/worldWriter.js";
import { WORLD_WRITER_SYSTEM, type WorldWriterContext } from "../src/worldPrompts.js";
import { FakeModelClient, makeArc, makeProfile } from "./helpers.js";

function makeAreaOutput(
  id: string,
  opts: { path?: "her" | "his"; badSpawn?: boolean; advancesBeatId?: string } = {},
): unknown {
  return {
    area: {
      dslVersion: 1,
      id,
      name: `Area ${id}`,
      description:
        "A narrow lane between sleeping houses. The night air tastes of rain that has not fallen yet, and somewhere beyond the rooftops a window is still lit.",
      path: opts.path ?? "her",
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
      playerSpawn: opts.badSpawn ? { x: 0, y: 0 } : { x: 1, y: 1 },
      entities: [],
      portals: [
        {
          id: "onward",
          pos: { x: 4, y: 3 },
          label: "the lane's far end",
          transition: { type: "generate", hint: "Where the lane leads." },
        },
      ],
      onEnterEffects: [],
    },
    ...(opts.advancesBeatId ? { advancesBeatId: opts.advancesBeatId } : {}),
  };
}

function makeCtx(overrides: Partial<WorldWriterContext> = {}): WorldWriterContext {
  const state: AreaGameState = {
    currentAreaId: "prologue-crossing",
    pos: { x: 1, y: 3 },
    facing: "left",
    flags: { "yuna-vanished": true },
    inventory: [],
    visitedAreaIds: ["prologue-street", "prologue-crossing"],
    usedInteractions: [],
  };
  return {
    path: "her",
    profile: makeProfile(),
    arc: makeArc(),
    facts: [],
    state,
    recentAreas: [],
    hint: "Begin Path A: Yuna wakes moments after the summoning.",
    existingAreaIds: ["prologue-street", "prologue-crossing"],
    ...overrides,
  };
}

const fact: CanonFact = {
  id: "fact-summoned",
  statement: "Yuna was summoned by the Villainess for her dormant power.",
  entities: ["yuna", "villainess"],
  sceneId: "prologue-crossing",
};

describe("writeArea", () => {
  it("accepts a valid area on the first try", async () => {
    const model = new FakeModelClient();
    model.push(makeAreaOutput("summoning-hall", { advancesBeatId: "beat-bell" }));
    const result = await writeArea(model, makeCtx());
    expect(result.area.id).toBe("summoning-hall");
    expect(result.advancesBeatId).toBe("beat-bell");
    expect(result.continuityDegraded).toBe(false);
    expect(model.calls[0]?.system).toBe(WORLD_WRITER_SYSTEM);
    expect(model.calls[0]?.user).toContain("Path register");
  });

  it("feeds integrity problems back and retries", async () => {
    const model = new FakeModelClient();
    model.push(makeAreaOutput("bad-area", { badSpawn: true }));
    model.push(makeAreaOutput("good-area"));
    const result = await writeArea(model, makeCtx());
    expect(result.area.id).toBe("good-area");
    expect(model.calls[1]?.feedback.join("\n")).toContain("playerSpawn");
  });

  it("rejects reused area ids and wrong paths via feedback", async () => {
    const model = new FakeModelClient();
    model.push(makeAreaOutput("prologue-street"));
    model.push(makeAreaOutput("fresh-area", { path: "his" }));
    model.push(makeAreaOutput("fresh-area"));
    const result = await writeArea(model, makeCtx());
    expect(result.area.id).toBe("fresh-area");
    expect(model.calls[1]?.feedback.join("\n")).toContain("already used");
    expect(model.calls[2]?.feedback.join("\n")).toContain('must be "her"');
  });

  it("runs the continuity checker when facts exist and degrades gracefully", async () => {
    const model = new FakeModelClient();
    // attempt 1: area, checker rejects; attempt 2: area, checker rejects;
    // attempt 3: area, checker rejects -> degraded accept of the last candidate.
    const violation = {
      ok: false,
      violations: [{ factId: "fact-summoned", explanation: "Contradicts the summoning." }],
    };
    model.push(makeAreaOutput("area-a"), violation);
    model.push(makeAreaOutput("area-b"), violation);
    model.push(makeAreaOutput("area-c"), violation);
    const logs: string[] = [];
    const result = await writeArea(model, makeCtx({ facts: [fact] }), {
      log: (m) => logs.push(m),
    });
    expect(result.continuityDegraded).toBe(true);
    expect(result.area.id).toBe("area-c");
    expect(logs[0]).toContain("degraded accept");
  });

  it("throws after exhausting retries on structural failures", async () => {
    const model = new FakeModelClient();
    model.push(
      makeAreaOutput("bad-1", { badSpawn: true }),
      makeAreaOutput("bad-2", { badSpawn: true }),
      makeAreaOutput("bad-3", { badSpawn: true }),
    );
    await expect(writeArea(model, makeCtx())).rejects.toThrow(WorldWriterFailedError);
  });

  it("WorldWriterOutput survives the OpenAI strict-schema translation", () => {
    const translated = toOpenAISchema(WorldWriterOutput);
    expect(translated).toBeTruthy();
    const json = JSON.stringify(translated);
    expect(json).toContain("ground");
    expect(json).toContain("portals");
  });
});
