import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AssetKind as AssetKindSchema, Slug, SpriteData, StoryPath, StyleBible } from "@howeverfar/schema";
import { decodePng, encodePng, processArt, renderSpriteData } from "@howeverfar/art";
import { putAsset, type PutAssetInput } from "@howeverfar/library";
import { validateAsset, type AssetKind } from "./checks.js";

/**
 * Rebuild the asset database from the art committed in this repo — the
 * checked-in files are the source of truth, the database is a derived
 * artifact anyone can regenerate:
 *
 *   npm run seed -w @howeverfar/asset-studio
 *
 * Two sources feed it:
 *
 * 1. **Our own sprite-as-data**, in `sprites/<path>-world/<kind>s/<name>.json`.
 *    The layout carries the metadata, so a spec needs no sidecar file
 *    (`sprites/his-world/tiles/sidewalk-his.json` -> path "his", kind "tile").
 *
 * 2. **Imported CC0 packs**, in `imports/<pack-dir>/` — a `manifest.json`
 *    holding the pack's attribution plus a `raw/` directory of the ORIGINAL
 *    pack files. Raw, deliberately: the gate is re-run on every seed, and
 *    storing pre-gated PNGs would re-outline already-outlined art on the
 *    next pass.
 *
 * Everything goes through the same gate as any other source (ADR-0011): no
 * shortcut for our own art, and no shortcut for anyone else's.
 */

/** An imported pack's attribution + what to file from it. */
const ImportManifest = z.object({
  pack: z.string().min(1),
  author: z.string().min(1),
  url: z.string().min(1),
  /** Only CC0 packs are ingested — owner directive, and it keeps ADR-0013 simple. */
  license: z.literal("CC0-1.0"),
  path: StoryPath,
  styleFile: z.string().min(1),
  assets: z
    .array(
      z.object({
        file: z.string().min(1),
        name: Slug,
        kind: AssetKindSchema,
        tags: z.array(z.string().min(1)).default([]),
        /** Where it came from in the pack, so a re-curation is traceable. */
        sourceIndex: z.number().int().min(0).optional(),
        sourceFile: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

const here = dirname(fileURLToPath(import.meta.url));
const spritesDir = join(here, "..", "sprites");
const stylesDir = join(here, "..", "styles");
const importsDir = join(here, "..", "imports");

const KIND_FOR_DIR: Record<string, AssetKind> = {
  tiles: "tile",
  sprites: "sprite",
  portraits: "portrait",
  items: "item",
};

function loadStyle(path: StoryPath): StyleBible {
  return StyleBible.parse(
    JSON.parse(readFileSync(join(stylesDir, `${path}-world.draft.json`), "utf8")),
  );
}

function directories(root: string): string[] {
  try {
    return readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());
  } catch {
    return [];
  }
}

let stored = 0;
let failed = 0;

/** Gate one image and file it, reporting the outcome. Shared by both sources. */
function gateAndStore(
  label: string,
  raw: ReturnType<typeof decodePng>,
  style: StyleBible,
  kind: AssetKind,
  entry: Omit<PutAssetInput, "frames" | "styleName" | "kind">,
): void {
  const gated = processArt(raw, style);
  const errors = validateAsset(gated, style, kind).filter((f) => f.level === "error");
  if (errors.length > 0) {
    failed++;
    console.error(`FAIL     ${label}`);
    for (const f of errors) console.error(`           ${f.check}: ${f.message}`);
    return;
  }
  const { record, replaced } = putAsset({
    ...entry,
    kind,
    styleName: style.paletteName,
    frames: [encodePng(gated)],
    replace: true,
  });
  stored++;
  console.log(`${replaced ? "UPDATED" : "STORED "}  ${record.name} (${kind}, ${record.path})`);
}

for (const worldDir of directories(spritesDir)) {
  const parsedPath = StoryPath.safeParse(worldDir.replace(/-world$/, ""));
  if (!parsedPath.success) {
    console.error(`skipping "${worldDir}" — expected <shared|her|his>-world`);
    continue;
  }
  const path = parsedPath.data;
  const style = loadStyle(path);

  for (const kindDir of directories(join(spritesDir, worldDir))) {
    const kind = KIND_FOR_DIR[kindDir];
    if (!kind) {
      console.error(`skipping "${worldDir}/${kindDir}" — expected one of ${Object.keys(KIND_FOR_DIR).join(", ")}`);
      continue;
    }
    const dir = join(spritesDir, worldDir, kindDir);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const spec = SpriteData.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      gateAndStore(`${worldDir}/${kindDir}/${file}`, renderSpriteData(spec), style, kind, {
        name: spec.name,
        path,
        tags: ["seed", kindDir],
        source: { type: "sprite-data", emittedBy: "hand" },
      });
    }
  }
}

// --- imported CC0 packs -----------------------------------------------------

for (const packDir of directories(importsDir)) {
  const manifestPath = join(importsDir, packDir, "manifest.json");
  let manifest;
  try {
    manifest = ImportManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  } catch (err) {
    failed++;
    console.error(
      `FAIL     ${packDir}/manifest.json — ${err instanceof Error ? err.message : String(err)}`,
    );
    continue;
  }
  const style = StyleBible.parse(
    JSON.parse(readFileSync(join(stylesDir, manifest.styleFile), "utf8")),
  );
  const source = {
    type: "cc0",
    pack: manifest.pack,
    author: manifest.author,
    url: manifest.url,
    license: manifest.license,
  } as const;

  for (const asset of manifest.assets) {
    const file = join(importsDir, packDir, "raw", asset.file);
    let raw;
    try {
      raw = decodePng(new Uint8Array(readFileSync(file)));
    } catch {
      failed++;
      console.error(`FAIL     ${packDir}/raw/${asset.file} — missing or unreadable`);
      continue;
    }
    gateAndStore(`${packDir}/raw/${asset.file}`, raw, style, asset.kind, {
      name: asset.name,
      path: manifest.path,
      tags: [...asset.tags, "cc0"],
      source,
    });
  }
}

console.log(`\n${stored} asset(s) in the database${failed > 0 ? `, ${failed} failed the gate` : ""}.`);
process.exit(failed > 0 ? 1 : 0);
