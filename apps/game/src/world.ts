import type {
  AreaAction,
  AreaGameState,
  AreaSpec,
  AreaTransition,
} from "@unwritten/schema";
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

/** Try to open a server session; fall back to local play. */
export async function connect(): Promise<{ session: Session; world: World }> {
  try {
    const res = await fetch("/api/world-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "new" }),
    });
    if (!res.ok) throw new Error(`server said ${res.status}`);
    const body = (await res.json()) as CreateResponse;
    return {
      session: { mode: "server", id: body.sessionId },
      world: { area: body.area, state: body.state },
    };
  } catch {
    return { session: { mode: "local" }, world: newLocalWorld() };
  }
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
