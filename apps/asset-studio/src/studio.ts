import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { StyleBible } from "@howeverfar/schema";
import { decodePng, encodePng, processArt } from "@howeverfar/art";
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

const port = Number(process.env["STUDIO_PORT"] ?? 5175);
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => console.log(`Asset Studio: http://localhost:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
