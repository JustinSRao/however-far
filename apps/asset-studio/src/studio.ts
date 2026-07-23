import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { Slug, StoryPath, StyleBible, type AssetSource } from "@howeverfar/schema";
import { decodePng, encodePng, processArt } from "@howeverfar/art";
import {
  attributions,
  DuplicateAssetError,
  listAssets,
  putAsset,
  readBlob,
} from "@howeverfar/library";
import { ASSET_KINDS, validateAsset, type AssetKind } from "./checks.js";
import { STUDIO_PAGE } from "./studioPage.js";

/**
 * The human-facing Asset Studio (ADR-0011): the same gate the CLI runs —
 * processArt normalization + validation — behind a drag-and-drop page, so the
 * owner can use the Studio directly without driving an agent.
 *
 *   npm run studio -w @howeverfar/asset-studio     -> http://localhost:5175
 */

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = join(here, "..", "styles");

interface StyleInfo {
  file: string;
  bible: StyleBible;
}

function loadStyles(): StyleInfo[] {
  const out: StyleInfo[] = [];
  for (const f of readdirSync(stylesDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push({
        file: f,
        bible: StyleBible.parse(JSON.parse(readFileSync(join(stylesDir, f), "utf8"))),
      });
    } catch {
      // Invalid style files are skipped, never fatal.
    }
  }
  return out;
}

const app = Fastify({ bodyLimit: 32 * 1024 * 1024 });

app.get("/", async (_req, reply) => {
  return reply.type("text/html").send(STUDIO_PAGE);
});

app.get("/api/styles", async () => {
  return loadStyles().map(({ file, bible }) => ({
    file,
    paletteName: bible.paletteName,
    colors: bible.colors,
    gridSize: bible.gridSize,
    outline: bible.outline,
  }));
});

interface ProcessBody {
  pngBase64: string;
  styleFile: string;
  kind: AssetKind;
  /** Skip processArt and only validate (for already-normalized assets). */
  validateOnly?: boolean;
}

app.post("/api/process", async (req, reply) => {
  const body = req.body as Partial<ProcessBody>;
  if (
    typeof body?.pngBase64 !== "string" ||
    typeof body?.styleFile !== "string" ||
    !ASSET_KINDS.includes(body?.kind as AssetKind)
  ) {
    return reply.code(400).send({ error: "pngBase64, styleFile, and kind are required" });
  }
  // Only styles from the listing — no path traversal.
  const style = loadStyles().find((s) => s.file === body.styleFile)?.bible;
  if (!style) {
    return reply.code(400).send({ error: `unknown style "${body.styleFile}"` });
  }

  let raw;
  try {
    raw = decodePng(new Uint8Array(Buffer.from(body.pngBase64, "base64")));
  } catch {
    return reply.code(400).send({ error: "could not decode PNG" });
  }

  const processed = body.validateOnly ? raw : processArt(raw, style);
  const findings = validateAsset(processed, style, body.kind as AssetKind);
  return {
    findings,
    before: { width: raw.width, height: raw.height },
    after: { width: processed.width, height: processed.height },
    processedBase64: Buffer.from(encodePng(processed)).toString("base64"),
  };
});

interface ImportBody {
  pngBase64: string;
  styleFile: string;
  kind: AssetKind;
  path: StoryPath;
  name: string;
  tags?: string;
  source?: Partial<{
    type: string;
    pack: string;
    author: string;
    url: string;
    license: string;
  }>;
  replace?: boolean;
}

/**
 * Land a gated asset in the database from the browser. Same gate, same
 * catalog rules as the CLI — the page must never become a second pipeline
 * (asset-studio skill), so the bytes are re-run through processArt and
 * validated here rather than trusting whatever the client posts.
 */
app.post("/api/import", async (req, reply) => {
  const body = req.body as Partial<ImportBody>;
  const style = loadStyles().find((s) => s.file === body?.styleFile)?.bible;
  if (!style) return reply.code(400).send({ error: `unknown style "${body?.styleFile}"` });
  if (!ASSET_KINDS.includes(body?.kind as AssetKind)) {
    return reply.code(400).send({ error: "unknown asset kind" });
  }
  const path = StoryPath.safeParse(body?.path);
  if (!path.success) return reply.code(400).send({ error: "path must be shared, her or his" });
  const name = Slug.safeParse(body?.name);
  if (!name.success) {
    return reply.code(400).send({ error: "name must be a lowercase slug (a-z, 0-9, dashes)" });
  }
  if (typeof body?.pngBase64 !== "string") {
    return reply.code(400).send({ error: "pngBase64 is required" });
  }

  const sourceInput = body.source ?? {};
  let source: AssetSource;
  if (sourceInput.type === "cc0") {
    if (!sourceInput.pack || !sourceInput.author || !sourceInput.url) {
      return reply
        .code(400)
        .send({ error: "CC0 imports need pack, author and url — attribution is mandatory" });
    }
    source = {
      type: "cc0",
      pack: sourceInput.pack,
      author: sourceInput.author,
      url: sourceInput.url,
      license: sourceInput.license || "CC0-1.0",
    };
  } else if (sourceInput.type === "sprite-data") {
    source = { type: "sprite-data", emittedBy: sourceInput.author || "hand" };
  } else if (sourceInput.type === "generated") {
    source = { type: "generated", model: sourceInput.pack || "gpt-image-2" };
  } else {
    source = { type: "hand", ...(sourceInput.author ? { author: sourceInput.author } : {}) };
  }

  let gated;
  try {
    gated = processArt(decodePng(new Uint8Array(Buffer.from(body.pngBase64, "base64"))), style);
  } catch {
    return reply.code(400).send({ error: "could not decode PNG" });
  }
  const findings = validateAsset(gated, style, body.kind as AssetKind);
  if (findings.some((f) => f.level === "error")) {
    return reply.code(400).send({ error: "asset does not pass the gate", findings });
  }

  try {
    const { record, replaced } = putAsset({
      name: name.data,
      kind: body.kind as AssetKind,
      path: path.data,
      styleName: style.paletteName,
      tags: (body.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      frames: [encodePng(gated)],
      source,
      replace: body.replace === true,
    });
    return { record, replaced, findings };
  } catch (err) {
    if (err instanceof DuplicateAssetError) {
      return reply.code(409).send({ error: err.message });
    }
    throw err;
  }
});

app.get("/api/catalog", async () => listAssets());

/** Blob bytes for the catalog thumbnails. */
app.get("/api/asset/:id/:frame.png", async (req, reply) => {
  const { id, frame } = req.params as { id: string; frame: string };
  const record = listAssets().find((r) => r.id === id);
  const hash = record?.frames[Number(frame)];
  if (!hash) return reply.code(404).send({ error: "no such asset frame" });
  return reply.type("image/png").send(Buffer.from(readBlob(hash)));
});

app.get("/api/credits", async () => ({ attributions: attributions() }));

const port = Number(process.env["STUDIO_PORT"] ?? 5175);
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => console.log(`Asset Studio: http://localhost:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
