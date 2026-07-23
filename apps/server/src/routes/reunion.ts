import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CrossingCall,
  ReunionRole,
  type AreaAction,
  type TurnStage,
} from "@howeverfar/schema";
import { AreaAction as AreaActionSchema } from "@howeverfar/schema";
import { exportPlaythrough, NO_KEY_MESSAGE } from "@howeverfar/director";
import { listReunions } from "@howeverfar/library";
import { ModelUnavailableError, NotFoundError } from "../sessionManager.js";
import {
  CallRejectedError,
  NotEntitledError,
  type ReunionManager,
} from "../reunionManager.js";
import type { WorldSessionManager } from "../worldSessionManager.js";

/**
 * The Reunion's HTTP and WebSocket surface (Phase 7).
 *
 * Two shapes, for two different things. Placing a call and exporting a
 * finished playthrough are ordinary requests. Playing the shared world is a
 * socket, because for the first time in this game there is someone else on the
 * other end and both of them need to see the other move.
 */

function issuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

const ExportBody = z.object({ playerName: z.string().min(1).max(60) });
const StatusQuery = z.object({ email: z.string().email() });

/** What a client is told when it attaches to a shared world. */
interface Welcome {
  type: "welcome";
  reunionId: string;
  role: z.infer<typeof ReunionRole>;
  area: unknown;
  state: unknown;
  ending?: unknown;
}

export function registerReunionRoutes(
  app: FastifyInstance,
  reunions: ReunionManager,
  worldSessions: WorldSessionManager,
): void {
  /**
   * Hand a finished playthrough its portable form. This is what the player
   * whose machine is NOT hosting sends across — the Call carries it.
   */
  app.post("/api/world-sessions/:id/export", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ExportBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      const save = worldSessions.snapshot(id);
      return exportPlaythrough(save, parsed.data.playerName);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get("/api/reunions", async () => listReunions());

  /** Ring the bell. */
  app.post("/api/crossing/call", async (req, reply) => {
    if (!reunions.available) {
      return reply.code(503).send({
        error: `${NO_KEY_MESSAGE} The Reunion is written live, so it needs one.`,
      });
    }
    const parsed = CrossingCall.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      return await reunions.call(parsed.data);
    } catch (err) {
      if (err instanceof NotEntitledError) {
        return reply.code(402).send({ error: err.message });
      }
      if (err instanceof CallRejectedError) {
        return reply.code(400).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "The call did not carry. Try again." });
    }
  });

  /** Has anyone answered? Polled by the side that called first. */
  app.get("/api/crossing/status", async (req, reply) => {
    const parsed = StatusQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    return reunions.status(parsed.data.email);
  });

  /**
   * The shared world. One socket per player; the server stamps the role from
   * the URL it was opened with and never trusts a role sent in a message, so
   * neither player can act as the other.
   */
  app.get("/api/reunions/:id/play", { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const role = ReunionRole.safeParse((req.query as { role?: string }).role);
    if (!role.success) {
      socket.send(JSON.stringify({ type: "error", message: "which side are you?" }));
      socket.close();
      return;
    }

    let director;
    try {
      director = reunions.get(id);
    } catch (err) {
      socket.send(
        JSON.stringify({
          type: "error",
          message: err instanceof NotFoundError ? err.message : "that world is not open",
        }),
      );
      socket.close();
      return;
    }

    const send = (payload: unknown): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
    };
    const both = (payload: unknown): void => {
      for (const peer of peersOf(id)) {
        if (peer.readyState === peer.OPEN) peer.send(JSON.stringify(payload));
      }
    };

    attach(id, socket);
    director.setConnected(role.data, true);

    // The opening area is written on first arrival, not at pairing — a
    // reunion agreed at 3am costs nothing until the two of them sit down.
    void reunions
      .serialize(id, async () => {
        if (director.needsOpening) {
          both({ type: "stage", stage: "writing" satisfies TurnStage });
          await director.openingArea({
            stage: (stage) => both({ type: "stage", stage }),
          });
          reunions.persist(director);
        }
      })
      .then(() => {
        const session = director.getSession();
        const welcome: Welcome = {
          type: "welcome",
          reunionId: id,
          role: role.data,
          area: director.currentArea(),
          state: session.state,
          ...(session.ending ? { ending: session.ending } : {}),
        };
        send(welcome);
        // Everyone sees who just walked in.
        both({ type: "presence", state: director.getSession().state });
      })
      .catch((err: unknown) => {
        req.log.error(err);
        send({
          type: "error",
          message: "The world would not open. Both of you are still here; try again.",
        });
      });

    socket.on("message", (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const action = AreaActionSchema.safeParse((parsed as { action?: unknown }).action);
      if (!action.success) return;

      void reunions
        .serialize(id, () =>
          runTurn(director, role.data, action.data, both, () =>
            reunions.persist(director),
          ),
        )
        .catch((err: unknown) => {
          req.log.error(err);
          send({
            type: "error",
            message: "That did not take. Try it again.",
          });
        });
    });

    socket.on("close", () => {
      detach(id, socket);
      const state = director.setConnected(role.data, false);
      reunions.persist(director);
      both({ type: "presence", state });
    });
  });
}

async function runTurn(
  director: ReturnType<ReunionManager["get"]>,
  role: z.infer<typeof ReunionRole>,
  action: AreaAction,
  both: (payload: unknown) => void,
  persist: () => void,
): Promise<void> {
  const result = await director.handleAction(role, action, {
    stage: (stage) => both({ type: "stage", stage }),
    chunk: (text) => both({ type: "chunk", text }),
  });
  persist();
  // Everything goes to both of them: a shared world where one player's screen
  // is stale is not a shared world.
  both({ type: "turn", by: role, result });
}

/**
 * Live sockets per world. Module-level rather than on the manager because it
 * is transport state, not game state — a reconnect must not be able to
 * resurrect a stale socket into somebody's save.
 */
const rooms = new Map<string, Set<{ readyState: number; OPEN: number; send: (data: string) => void }>>();

type Peer = { readyState: number; OPEN: number; send: (data: string) => void };

function attach(id: string, socket: Peer): void {
  const room = rooms.get(id) ?? new Set<Peer>();
  room.add(socket);
  rooms.set(id, room);
}

function detach(id: string, socket: Peer): void {
  const room = rooms.get(id);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) rooms.delete(id);
}

function peersOf(id: string): Peer[] {
  return [...(rooms.get(id) ?? [])];
}
