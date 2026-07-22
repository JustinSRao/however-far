import Fastify, { type FastifyInstance } from "fastify";
import { AnthropicModelClient, type ModelClient } from "@unwritten/director";
import { SessionManager } from "./sessionManager.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerLibraryRoutes } from "./routes/library.js";
import { registerArtRoutes } from "./routes/art.js";

export interface BuildServerOptions {
  /**
   * Inject a fake model client for tests. When omitted, the real Claude
   * client is constructed if ANTHROPIC_API_KEY is set in the environment;
   * otherwise the server still boots but session creation is disabled (503).
   */
  model?: ModelClient;
  logger?: boolean;
}

/** Thin HTTP API over @unwritten/director and @unwritten/library (a Fastify app factory, so tests can use fastify.inject without binding a port). */
export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  const model: ModelClient | undefined =
    opts.model ?? (process.env["ANTHROPIC_API_KEY"] ? new AnthropicModelClient() : undefined);

  const sessions = new SessionManager({
    model,
    log: (msg) => app.log.info({ director: msg }),
  });

  registerSessionRoutes(app, sessions);
  registerLibraryRoutes(app);
  registerArtRoutes(app, sessions);

  return app;
}
