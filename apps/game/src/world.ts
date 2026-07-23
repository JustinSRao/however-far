import type {
  AreaAction,
  AreaGameState,
  AreaSpec,
  AreaTransition,
} from "@howeverfar/schema";
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
  | { kind: "threshold"; summary: string };

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
