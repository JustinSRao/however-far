import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AreaAction } from "@unwritten/schema";
import { NO_KEY_MESSAGE } from "@unwritten/director";
import { listWorldSessions } from "@unwritten/library";
import { ModelUnavailableError, NotFoundError } from "../sessionManager.js";
import type { WorldSessionManager } from "../worldSessionManager.js";

const NO_KEY_RESPONSE = `${NO_KEY_MESSAGE} The prologue plays without one; choosing a path does not.`;

const CreateWorldSessionBody = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new") }),
  z.object({ mode: z.literal("resume"), id: z.string().min(1) }),
]);

function issuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/** HTTP surface for RPG sessions (Area DSL v1) — the area-era twin of sessions.ts. */
export function registerWorldRoutes(
  app: FastifyInstance,
  sessions: WorldSessionManager,
): void {
  app.get("/api/world-sessions", async () => listWorldSessions());

  app.post("/api/world-sessions", async (req, reply) => {
    if (!sessions.available) {
      return reply.code(503).send({ error: NO_KEY_RESPONSE });
    }
    const parsed = CreateWorldSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      const director =
        parsed.data.mode === "new" ? sessions.createNew() : sessions.get(parsed.data.id);
      const session = director.getSession();
      return {
        sessionId: session.id,
        phase: session.phase,
        path: session.path,
        area: director.currentArea(),
        state: session.state,
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "Could not start the session — try again." });
    }
  });

  app.post("/api/world-sessions/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsedAction = AreaAction.safeParse(req.body);
    if (!parsedAction.success) {
      return reply.code(400).send({ error: issuesMessage(parsedAction.error) });
    }

    let director;
    try {
      director = sessions.get(id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof ModelUnavailableError) {
        return reply.code(503).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(502).send({ error: "Could not load the session — try again." });
    }

    try {
      const result = await director.handleAction(parsedAction.data);
      sessions.persist(director);
      return result;
    } catch (err) {
      req.log.error(err);
      return reply
        .code(502)
        .send({ error: "The world resisted being written just now — try again." });
    }
  });
}
