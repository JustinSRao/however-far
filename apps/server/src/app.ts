import Fastify, { type FastifyInstance } from "fastify";
import { createModelClient, type ModelClient } from "@unwritten/director";
import { SessionManager } from "./sessionManager.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerArtRoutes } from "./routes/art.js";

export interface BuildServerOptions {
  /**
   * Inject a fake model client for tests. When omitted, a real client is
   * built from whichever provider key the environment supplies; with no key
   * the server still boots but session creation is disabled (503).
   */
  model?: ModelClient | undefined;
  logger?: boolean;
}

/** Thin HTTP API over @unwritten/director and @unwritten/library (a Fastify app factory, so tests can use fastify.inject without binding a port). */
export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  const model: ModelClient | undefined = opts.model ?? createModelClient();

  const sessions = new SessionManager({
    model,
    log: (msg) => app.log.info({ director: msg }),
  });

  registerSessionRoutes(app, sessions);
  registerLibraryRoutes(app);
  registerArtRoutes(app, sessions);

  return app;
}
