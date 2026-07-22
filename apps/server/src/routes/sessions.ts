import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PlayerAction } from "@unwritten/schema";
import { NO_KEY_MESSAGE } from "@unwritten/director";
import { BundleError, exportBundle, listSessions, writeBundle } from "@unwritten/library";
import {
  ModelUnavailableError,
  NotFoundError,
  type SessionManager,
} from "../sessionManager.js";

const NO_KEY_RESPONSE = `${NO_KEY_MESSAGE} Browsing works without one; starting or continuing a game does not.`;

const CreateSessionBody = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new") }),
  z.object({ mode: z.literal("replay"), bundlePath: z.string().min(1) }),
  z.object({ mode: z.literal("resume"), id: z.string().min(1) }),
]);

const PublishBody = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  creator: z.string().min(1).max(80).optional(),
});

function issuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function registerSessionRoutes(app: FastifyInstance, sessions: SessionManager): void {
  app.get("/api/sessions", async () => listSessions());

  app.post("/api/sessions", async (req, reply) => {
    if (!sessions.available) {
      return reply.code(503).send({ error: NO_KEY_RESPONSE });
    }
    const parsed = CreateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      const director =
        parsed.data.mode === "new"
          ? sessions.createNew()
          : parsed.data.mode === "resume"
            ? sessions.get(parsed.data.id)
            : sessions.createReplay(parsed.data.bundlePath);
      const session = director.getSession();
      return { sessionId: session.id, scene: director.currentScene(), phase: session.phase };
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

  app.post("/api/sessions/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsedAction = PlayerAction.safeParse(req.body);
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

  app.post("/api/sessions/:id/publish", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PublishBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: issuesMessage(parsed.error) });
    }
    try {
      const session = sessions.snapshot(id);
      const { title, description, creator } = parsed.data;
      const bundle = exportBundle(session, {
        title,
        description,
        ...(creator === undefined ? {} : { creator }),
      });
      const path = writeBundle(bundle);
      return { path };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      if (err instanceof BundleError) {
        return reply.code(400).send({ error: err.message });
      }
      req.log.error(err);
      return reply.code(500).send({ error: "Could not publish this universe." });
    }
  });
}
