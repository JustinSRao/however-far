import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ArtRequest } from "@unwritten/schema";
import {
  ProceduralPlaceholderProvider,
  createAssetCache,
  encodePng,
} from "@unwritten/art";
import { storeRoot } from "@unwritten/library";
import { NotFoundError, type SessionManager } from "../sessionManager.js";

/**
 * Art is served per session because the StyleBible that governs it lives on
 * the session: the same ArtRequest in two different universes is two
 * different images. The client passes the scene's ArtRequest as query params
 * and gets back a PNG.
 *
 * Assets are content-hash cached on disk (@unwritten/art), so a repeat request
 * is a file read and never re-runs the provider. The response is marked
 * immutable: the cache key already covers request + style + pipeline version,
 * so a given URL's bytes can never change within a universe.
 */
export function registerArtRoutes(app: FastifyInstance, sessions: SessionManager): void {
  const provider = new ProceduralPlaceholderProvider();
  const cache = createAssetCache(join(storeRoot(), "assets"));

  app.get("/api/sessions/:id/art", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ArtRequest.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues
          .map((i) => `${i.path.join(".") || "query"}: ${i.message}`)
          .join("; "),
      });
    }

    let styleBible;
    try {
      styleBible = sessions.snapshot(id).styleBible;
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
    // No style yet (still in the Anchor) or stylist degraded: there is no art
    // for this universe, and the client falls back to its placeholder slot.
    if (!styleBible) {
      return reply.code(404).send({ error: "this universe has no visual identity yet" });
    }

    try {
      const image = await cache.getOrGenerate(parsed.data, styleBible, provider);
      return reply
        .header("content-type", "image/png")
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(Buffer.from(encodePng(image)));
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "could not render this asset" });
    }
  });
}
