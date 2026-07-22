import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SceneSpec } from "@unwritten/schema";
import { buildServer } from "../src/app.js";
import {
  FakeModelClient,
  makeArc,
  makeProfile,
  makeStyleBible,
  makeWriterOutput,
} from "./helpers.js";

// Isolate persisted sessions/bundles from the real ~/.unwritten store, and
// from other test files, for the lifetime of this suite.
let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "unwritten-server-test-"));
  process.env["UNWRITTEN_HOME"] = home;
});

afterAll(() => {
  delete process.env["UNWRITTEN_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("GET routes", () => {
  it("GET /api/sessions returns an array (empty store is fine)", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });

  it("GET /api/library returns an array (empty store is fine)", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({ method: "GET", url: "/api/library" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await app.close();
  });
});

describe("GET /api/sessions/:id/art", () => {
  const ART_QUERY = "kind=item&subject=a+brass+key&mood=quiet+dread&sizeClass=small";

  it("renders a PNG once the universe has a style, and caches it byte-identically", async () => {
    const fake = new FakeModelClient();
    const app = buildServer({ model: fake });

    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    const id = (created.json() as { sessionId: string }).sessionId;

    // Still in the Anchor: no StyleBible yet, so there is no art to serve and
    // the client falls back to its placeholder slot.
    const early = await app.inject({ method: "GET", url: `/api/sessions/${id}/art?${ART_QUERY}` });
    expect(early.statusCode).toBe(404);

    await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "join-fire" },
    });
    await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "share-bread" },
    });
    fake.push(
      makeProfile(),
      makeArc(),
      makeStyleBible(),
      makeWriterOutput("first-generated"),
      { ok: true },
      { facts: [] },
    );
    await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "take-knife" },
    });

    const res = await app.inject({ method: "GET", url: `/api/sessions/${id}/art?${ART_QUERY}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    // PNG magic number — this is a real image, not an error page.
    expect([...res.rawPayload.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // Same request again: served from the content-hash cache, same bytes.
    const again = await app.inject({ method: "GET", url: `/api/sessions/${id}/art?${ART_QUERY}` });
    expect(again.rawPayload.equals(res.rawPayload)).toBe(true);

    await app.close();
  });

  it("rejects a malformed art request with 400", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/whatever/art?kind=not-a-kind&subject=x&mood=y&sizeClass=small",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404s for an unknown session", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/no-such-session/art?${ART_QUERY}`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/sessions — no API key configured", () => {
  const savedKey = process.env["ANTHROPIC_API_KEY"];

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
  });
  afterAll(() => {
    if (savedKey !== undefined) process.env["ANTHROPIC_API_KEY"] = savedKey;
  });

  it("boots fine but returns 503 with a friendly message", async () => {
    // No `model` option passed, and ANTHROPIC_API_KEY unset — app.ts must
    // fall back to "no model" rather than throwing at construction time.
    const app = buildServer({});
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { error: string };
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
    await app.close();
  });
});

describe("POST /api/sessions — validation", () => {
  it("rejects a malformed body with 400", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "not-a-real-mode" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404s a resume of an unknown session id", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "resume", id: "does-not-exist" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("play loop", () => {
  it("creates a new session, plays the Anchor with zero model calls, then generates on exit", async () => {
    const fake = new FakeModelClient();
    const app = buildServer({ model: fake });

    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { sessionId: string; scene: unknown; phase: string };
    expect(createdBody.phase).toBe("anchor");
    expect(() => SceneSpec.parse(createdBody.scene)).not.toThrow();
    const id = createdBody.sessionId;

    // Anchor scenes are fixed content: two choice actions, no model calls.
    let res = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "join-fire" },
    });
    expect(res.statusCode).toBe(200);
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "share-bread" },
    });
    expect(res.statusCode).toBe(200);
    expect(fake.calls).toHaveLength(0);

    // Taking an item exits the Anchor: profiler, architect, stylist, writer,
    // checker, extractor.
    fake.push(
      makeProfile(),
      makeArc(),
      makeStyleBible(),
      makeWriterOutput("first-generated", { advancesBeatId: "beat-bell" }),
      { ok: true },
      { facts: [{ statement: "The bell belongs to the Lantern Order.", entities: ["the-bell"] }] },
    );
    res = await app.inject({
      method: "POST",
      url: `/api/sessions/${id}/action`,
      payload: { type: "choice", choiceId: "take-knife" },
    });
    expect(res.statusCode).toBe(200);
    const turnBody = res.json() as { kind: string; scene?: { id: string } };
    expect(turnBody.kind).toBe("scene");
    expect(turnBody.scene?.id).toBe("first-generated");
    expect(fake.calls).toHaveLength(6);

    // The turn was persisted — a fresh session-manager (fresh app) can resume it.
    const app2 = buildServer({ model: fake });
    const listRes = await app2.inject({ method: "GET", url: "/api/sessions" });
    const list = listRes.json() as Array<{ id: string; phase: string }>;
    const saved = list.find((s) => s.id === id);
    expect(saved?.phase).toBe("generated");
    await app2.close();

    await app.close();
  });

  it("rejects a malformed PlayerAction body with 400", async () => {
    const fake = new FakeModelClient();
    const app = buildServer({ model: fake });
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };

    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/action`,
      payload: { type: "choice" }, // missing choiceId
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404s an action against an unknown session id", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/nonexistent-session/action",
      payload: { type: "choice", choiceId: "whatever" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 502, not a crash, when the Director throws mid-turn", async () => {
    const fake = new FakeModelClient();
    const app = buildServer({ model: fake });
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };

    // The queue is empty, so exiting the Anchor (which calls the model) throws.
    await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/action`,
      payload: { type: "choice", choiceId: "join-fire" },
    });
    await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/action`,
      payload: { type: "choice", choiceId: "share-bread" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/action`,
      payload: { type: "choice", choiceId: "take-knife" },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json() as { error: string };
    expect(body.error).toBeTruthy();
    await app.close();
  });
});

describe("POST /api/sessions/:id/publish", () => {
  it("400s publishing a session that hasn't ended", async () => {
    const fake = new FakeModelClient();
    const app = buildServer({ model: fake });
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };

    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/publish`,
      payload: { title: "An Untitled Road", description: "A road that remembered someone." },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404s publishing an unknown session id", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/nonexistent-session/publish",
      payload: { title: "A Title", description: "A description." },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("400s a malformed publish body", async () => {
    const app = buildServer({ model: new FakeModelClient() });
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { mode: "new" },
    });
    const { sessionId } = created.json() as { sessionId: string };
    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/publish`,
      payload: { title: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
