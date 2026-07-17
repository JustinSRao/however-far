import { describe, expect, it } from "vitest";
import { CanonLedger } from "../src/canonLedger.js";
import { advanceArc, isFinalAct } from "../src/stages.js";
import { writeScene } from "../src/writer.js";
import { Director } from "../src/director.js";
import {
  FakeModelClient,
  makeArc,
  makeProfile,
  makeWriterOutput,
} from "./helpers.js";
import type { WriterContext } from "../src/prompts.js";
import { SceneSpec } from "@unwritten/schema";

describe("CanonLedger", () => {
  it("appends with assigned ids and resolves supersession", () => {
    const ledger = new CanonLedger();
    const [a] = ledger.append(
      [{ statement: "The inn stands.", entities: ["inn"] }],
      "s-one",
    );
    ledger.append(
      [{ statement: "The inn burned down.", entities: ["inn"], supersedes: a!.id }],
      "s-two",
    );
    expect(ledger.all()).toHaveLength(2);
    const active = ledger.active();
    expect(active).toHaveLength(1);
    expect(active[0]!.statement).toContain("burned");
  });

  it("drops dangling supersedes references instead of failing", () => {
    const ledger = new CanonLedger();
    const [f] = ledger.append(
      [{ statement: "X.", entities: [], supersedes: "fact-9999" }],
      "s-one",
    );
    expect(f!.supersedes).toBeUndefined();
  });

  it("retrieves entity-matched facts first within the limit", () => {
    const ledger = new CanonLedger();
    ledger.append(
      [
        { statement: "About the inn.", entities: ["inn"] },
        { statement: "About the moon.", entities: ["moon"] },
        { statement: "About Marlow.", entities: ["marlow"] },
      ],
      "s-one",
    );
    const got = ledger.retrieve(["marlow"], 2);
    expect(got[0]!.statement).toContain("Marlow");
    expect(got).toHaveLength(2);
  });
});

describe("advanceArc / isFinalAct", () => {
  it("marks beats done and advances acts when an act completes", () => {
    let arc = makeArc();
    expect(isFinalAct(arc)).toBe(false);
    arc = advanceArc(arc, "beat-bell");
    expect(arc.currentActId).toBe("act-one");
    arc = advanceArc(arc, "beat-marlow-secret");
    expect(arc.currentActId).toBe("act-two");
    expect(isFinalAct(arc)).toBe(true);
  });
});

describe("writeScene retry loop", () => {
  const ctx: WriterContext = {
    profile: makeProfile(),
    arc: makeArc(),
    facts: [
      {
        id: "fact-0001",
        statement: "Marlow is alive.",
        entities: ["marlow"],
        sceneId: "anchor-fire",
      },
    ],
    state: {
      currentSceneId: "anchor-box",
      flags: {},
      inventory: [],
      visitedSceneIds: ["anchor-box"],
    },
    recentScenes: [],
    hint: "continue",
    existingSceneIds: ["anchor-box"],
  };

  it("regenerates on integrity failure with feedback", async () => {
    const fake = new FakeModelClient();
    const bad = makeWriterOutput("bad-scene") as { scene: { dialogue: unknown[] } };
    bad.scene.dialogue = [{ speakerId: "ghost", text: "boo" }];
    fake.push(bad, makeWriterOutput("good-scene"), { ok: true });

    const res = await writeScene(fake, ctx);
    expect(res.scene.id).toBe("good-scene");
    expect(res.continuityDegraded).toBe(false);
    // writer, writer(retry w/ feedback), checker
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls[1]!.feedback[0]).toContain("structural problems");
  });

  it("degrades (accepts + flags) when the checker never passes", async () => {
    const fake = new FakeModelClient();
    const bad = {
      ok: false,
      violations: [{ factId: "fact-0001", explanation: "Marlow is dead here." }],
    };
    fake.push(
      makeWriterOutput("try-one"), bad,
      makeWriterOutput("try-two"), bad,
      makeWriterOutput("try-three"), bad,
    );
    const res = await writeScene(fake, ctx);
    expect(res.continuityDegraded).toBe(true);
    expect(fake.calls).toHaveLength(6);
  });

  it("rejects reused scene ids", async () => {
    const fake = new FakeModelClient();
    fake.push(makeWriterOutput("anchor-box"), makeWriterOutput("fresh-id"), { ok: true });
    const res = await writeScene(fake, ctx);
    expect(res.scene.id).toBe("fresh-id");
  });
});

describe("Director — full session flow", () => {
  it("plays the anchor with zero model calls, then profiles/plans/generates on exit", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });

    let r = await d.handleAction({ type: "choice", choiceId: "join-fire" });
    expect(r.kind).toBe("scene");
    r = await d.handleAction({ type: "choice", choiceId: "share-bread" });
    expect(r.kind).toBe("scene");
    expect(fake.calls).toHaveLength(0);

    // Anchor exit: profiler, architect, writer, checker, extractor
    fake.push(
      makeProfile(),
      makeArc(),
      makeWriterOutput("first-generated", { advancesBeatId: "beat-bell" }),
      { ok: true },
      { facts: [{ statement: "The bell belongs to the Lantern Order.", entities: ["the-bell"] }] },
    );
    r = await d.handleAction({ type: "choice", choiceId: "take-knife" });
    if (r.kind !== "scene") throw new Error("expected scene");
    expect(r.scene.id).toBe("first-generated");
    expect(fake.calls).toHaveLength(5);

    const s = d.getSession();
    expect(s.phase).toBe("generated");
    expect(s.profile?.genre.primary).toBe("folk horror");
    // 6 anchor facts + 1 item fact + 1 extracted
    expect(s.canon).toHaveLength(8);
    expect(s.state.currentSceneId).toBe("first-generated");
    // beat-bell was marked done by advancesBeatId
    const actOne = s.arc?.acts.find((a) => a.id === "act-one");
    expect(actOne?.beats.find((b) => b.id === "beat-bell")?.status).toBe("done");
    // signals recorded for all three anchor choices
    expect(s.signals).toHaveLength(3);
  });

  it("acknowledges free text during the anchor without model calls", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });
    const r = await d.handleAction({ type: "freeText", text: "kick the box" });
    expect(r.kind).toBe("anchorAck");
    expect(fake.calls).toHaveLength(0);
    expect(d.getSession().signals[0]!.action).toBe("kick the box");
  });

  it("authors a response to free text in the generated phase", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });
    await d.handleAction({ type: "choice", choiceId: "join-fire" });
    await d.handleAction({ type: "choice", choiceId: "share-bread" });
    fake.push(makeProfile(), makeArc(), makeWriterOutput("first-generated"), { ok: true }, { facts: [] });
    await d.handleAction({ type: "choice", choiceId: "take-key" });

    fake.push(makeWriterOutput("free-response"), { ok: true }, { facts: [] });
    const r = await d.handleAction({ type: "freeText", text: "follow the bell sound" });
    if (r.kind !== "scene") throw new Error("expected scene");
    expect(r.scene.id).toBe("free-response");
    const writerCall = fake.calls[5]!;
    expect(writerCall.user).toContain("follow the bell sound");
  });

  it("gates endings outside the final act, allows them inside it, and terminates", async () => {
    const fake = new FakeModelClient();
    const d = new Director({ model: fake });
    await d.handleAction({ type: "choice", choiceId: "join-fire" });
    await d.handleAction({ type: "choice", choiceId: "share-bread" });
    fake.push(
      makeProfile(),
      makeArc(),
      makeWriterOutput("first-generated", { endingChoice: true }),
      { ok: true },
      { facts: [] },
    );
    await d.handleAction({ type: "choice", choiceId: "take-letter" });

    // Not final act: the ending attempt becomes a normal generation.
    fake.push(makeWriterOutput("the-detour", { endingChoice: true }), { ok: true }, { facts: [] });
    let r = await d.handleAction({ type: "choice", choiceId: "end-it" });
    if (r.kind !== "scene") throw new Error("expected scene");
    expect(r.scene.id).toBe("the-detour");
    const gateCall = fake.calls[5]!;
    expect(gateCall.user).toContain("not finished");

    // Jump to the final act, then end for real.
    const s = d.getSession();
    s.arc!.currentActId = "act-two";
    const d2 = new Director({ model: fake }, s);
    fake.push(makeWriterOutput("the-finale"), { ok: true }); // ending: no extraction
    r = await d2.handleAction({ type: "choice", choiceId: "end-it" });
    if (r.kind !== "scene") throw new Error("expected scene");
    expect(r.scene.id).toBe("the-finale");
    expect(r.scene.choices).toHaveLength(1);
    expect(r.scene.choices[0]!.id).toBe("the-end");
    expect(SceneSpec.parse(r.scene)).toBeTruthy();

    const done = await d2.handleAction({ type: "choice", choiceId: "the-end" });
    expect(done.kind).toBe("ended");
    expect(d2.getSession().phase).toBe("ended");
    expect(d2.getSession().endingSummary).toBeTruthy();
  });
});
