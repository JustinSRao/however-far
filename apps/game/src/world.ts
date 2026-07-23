import type {
  AreaAction,
  AreaGameState,
  AreaSpec,
  AreaTransition,
  ThresholdEnding,
  TurnStage,
} from "@howeverfar/schema";
import { TurnEvent } from "@howeverfar/schema";
import {
  enterArea,
  initialAreaState,
  getPrologueArea,
  getPrologueAreas,
  PROLOGUE_ENTRY_ID,
} from "./deps.js";

/**
 * The client-side world store. Two modes:
 *
 * - "server": the game server owns the session (WorldDirector). Interactions
 *   are applied optimistically with the same pure engine the server runs and
 *   mirrored to the server for signals/persistence; transitions are awaited —
 *   generate-portals come back with a freshly written area.
 * - "local": no server reachable. The hand-authored prologue plays fully;
 *   generate-portals show the "unwritten" veil (the honest edge).
 */
export interface World {
  area: AreaSpec;
  state: AreaGameState;
}

export type Mode = "server" | "local";

export interface Session {
  mode: Mode;
  id?: string;
}

export function newLocalWorld(): World {
  const area = getPrologueArea(PROLOGUE_ENTRY_ID);
  if (!area) throw new Error("prologue entry area missing");
  return { area, state: initialAreaState(area) };
}

interface CreateResponse {
  sessionId: string;
  phase: string;
  area: AreaSpec;
  state: AreaGameState;
}

/** A saved server session, as listed by GET /api/world-sessions. */
export interface SaveInfo {
  id: string;
  phase: string;
  path: "shared" | "her" | "his";
  updatedAt: string;
  areasVisited: number;
  /** Present when the save has rewritten its own label (ADR-0015). */
  label?: string;
}

/** A shared world in progress on this server (Phase 7). */
export interface ReunionInfo {
  id: string;
  phase: "reunion" | "ended";
  updatedAt: string;
  her: string;
  his: string;
  areasVisited: number;
}

export async function listReunions(): Promise<ReunionInfo[]> {
  try {
    const res = await fetch("/api/reunions");
    if (!res.ok) return [];
    return (await res.json()) as ReunionInfo[];
  } catch {
    return [];
  }
}

/** Saved sessions on the server (newest first); empty when unreachable. */
export async function listSaves(): Promise<SaveInfo[]> {
  try {
    const res = await fetch("/api/world-sessions");
    if (!res.ok) return [];
    return (await res.json()) as SaveInfo[];
  } catch {
    return [];
  }
}

async function tryOpen(
  body: { mode: "new" } | { mode: "resume"; id: string },
): Promise<{ session: Session; world: World } | undefined> {
  try {
    const res = await fetch("/api/world-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return undefined;
    const parsed = (await res.json()) as CreateResponse;
    return {
      session: { mode: "server", id: parsed.sessionId },
      world: { area: parsed.area, state: parsed.state },
    };
  } catch {
    return undefined;
  }
}

/**
 * Open a server session — resuming a save when asked — and fall back to a
 * fresh server session, then to local play, if that fails.
 */
export async function connect(
  resumeId?: string,
): Promise<{ session: Session; world: World }> {
  if (resumeId) {
    const resumed = await tryOpen({ mode: "resume", id: resumeId });
    if (resumed) return resumed;
  }
  const fresh = await tryOpen({ mode: "new" });
  return fresh ?? { session: { mode: "local" }, world: newLocalWorld() };
}

export type ServerTurn =
  | { kind: "area"; area: AreaSpec; state: AreaGameState }
  | { kind: "ok"; state: AreaGameState; ack?: string }
  | { kind: "threshold"; summary: string; ending?: ThresholdEnding };

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

/** Send an action to the authoritative server session. */
export async function sendAction(
  session: Session,
  action: AreaAction,
): Promise<ServerTurn> {
  if (session.mode !== "server" || !session.id) {
    throw new Error("sendAction requires a server session");
  }
  const res = await fetch(`/api/world-sessions/${session.id}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  if (!res.ok) {
    let message = `server said ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new ServerError(message, res.status);
  }
  return (await res.json()) as ServerTurn;
}

export interface TurnHandlers {
  /** What the Director is doing now, so the wait can be dressed as fiction. */
  onStage?: (stage: TurnStage) => void;
  /** Prose arriving as it is written. */
  onChunk?: (text: string) => void;
}

/**
 * Send an action and follow the turn as it happens (Phase 6 latency).
 *
 * Falls back to the plain route whenever streaming is not available — an old
 * server, a browser without a body reader, a proxy that ate the stream. The
 * fallback is silent and lossless: the same turn, the same result, just
 * without the commentary. A player must never lose a move to a transport.
 */
export async function streamAction(
  session: Session,
  action: AreaAction,
  handlers: TurnHandlers = {},
): Promise<ServerTurn> {
  if (session.mode !== "server" || !session.id) {
    throw new Error("streamAction requires a server session");
  }
  let res: Response;
  try {
    res = await fetch(`/api/world-sessions/${session.id}/action/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
  } catch {
    return sendAction(session, action);
  }
  if (!res.ok || !res.body) {
    if (res.status === 404 || res.status === 405) return sendAction(session, action);
    let message = `server said ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new ServerError(message, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: ServerTurn | undefined;
  let failure: string | undefined;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; a partial frame stays in the
    // buffer until the rest of it arrives.
    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (payload) {
        const event = parseTurnEvent(payload);
        if (event?.type === "stage") handlers.onStage?.(event.stage);
        else if (event?.type === "chunk") handlers.onChunk?.(event.text);
        else if (event?.type === "result") outcome = event.result as ServerTurn;
        else if (event?.type === "error") failure = event.message;
      }
      split = buffer.indexOf("\n\n");
    }
    if (done) break;
  }

  if (failure) throw new ServerError(failure, 502);
  if (!outcome) {
    // The stream ended without saying how the turn went — the server may have
    // died mid-write. Ask the plain route rather than guessing.
    throw new ServerError("The connection dropped before the world arrived.", 502);
  }
  return outcome;
}

function parseTurnEvent(payload: string): TurnEvent | undefined {
  try {
    const parsed = TurnEvent.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export type TransitionResult =
  | { kind: "moved"; world: World }
  | { kind: "unwritten"; portalLabel: string; hint: string }
  | { kind: "ending"; hint: string };

/** Local-mode transition resolution (prologue areas only). */
export function followTransition(
  world: World,
  transition: AreaTransition,
  portalLabel: string,
): TransitionResult {
  switch (transition.type) {
    case "area": {
      const next = getPrologueArea(transition.areaId);
      if (!next) throw new Error(`unknown area "${transition.areaId}"`);
      return {
        kind: "moved",
        world: { area: next, state: enterArea(world.state, next) },
      };
    }
    case "generate":
      return { kind: "unwritten", portalLabel, hint: transition.hint };
    case "ending":
      return { kind: "ending", hint: transition.hint };
  }
}

export function allAreas(): readonly AreaSpec[] {
  return getPrologueAreas();
}
