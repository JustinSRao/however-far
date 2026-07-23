import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { createModelClient, type ModelClient } from "@howeverfar/director";
import { entitlementFromEnv, type EntitlementConfig } from "@howeverfar/entitlement";
import { SessionManager } from "./sessionManager.js";
import { WorldSessionManager } from "./worldSessionManager.js";
import { ReunionManager } from "./reunionManager.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerArtRoutes } from "./routes/art.js";
import { registerWorldRoutes } from "./routes/world.js";
import { registerReunionRoutes } from "./routes/reunion.js";

export interface BuildServerOptions {
  /**
   * Inject a fake model client for tests. When omitted, a real client is
   * built from whichever provider key the environment supplies; with no key
   * the server still boots but session creation is disabled (503).
   */
  model?: ModelClient | undefined;
  logger?: boolean;
  /**
   * Reunion licensing (ADR-0024). Injected for tests; otherwise read from the
   * environment, where an unconfigured build fails closed.
   */
  entitlement?: EntitlementConfig;
}

/** Thin HTTP API over @howeverfar/director and @howeverfar/library (a Fastify app factory, so tests can use fastify.inject without binding a port). */
export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  const model: ModelClient | undefined = opts.model ?? createModelClient();

  const sessions = new SessionManager({
    model,
    log: (msg) => app.log.info({ director: msg }),
  });

  const worldSessions = new WorldSessionManager({
    model,
    log: (msg) => app.log.info({ director: msg }),
  });

  const reunions = new ReunionManager({
    model,
    entitlement: opts.entitlement ?? entitlementFromEnv(),
    log: (msg) => app.log.info({ reunion: msg }),
  });

  registerSessionRoutes(app, sessions);
  registerLibraryRoutes(app);
  registerArtRoutes(app, sessions);
  registerWorldRoutes(app, worldSessions);

  // The Reunion is the only part of the game with two people in it, so it is
  // the only part that needs a socket — registered inside a plugin scope so
  // the websocket upgrade handler applies to its routes and nothing else.
  void app.register(async (scoped) => {
    await scoped.register(websocket);
    registerReunionRoutes(scoped, reunions, worldSessions);
  });

  return app;
}
