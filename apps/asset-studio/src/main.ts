import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SpriteData, StoryPath, StyleBible, type AssetRecord } from "@howeverfar/schema";
import {
  decodePng,
  encodePng,
  isBlank,
  parseColorMapping,
  processArt,
  recolor,
  renderSpriteData,
  sliceSheet,
  upscale,
  type RawImage,
} from "@howeverfar/art";
import {
  assetDbRoot,
  attributions,
  getAssetRecord,
  listAssets,
  putAsset,
  readBlob,
  renderCredits,
  type AssetQuery,
} from "@howeverfar/library";
import { ArtRequest } from "@howeverfar/schema";
import { costLedgerPath, IMAGE_MODEL } from "@howeverfar/director";
import { ASSET_KINDS, validateAsset, validateFrameSet, type AssetKind, type Finding } from "./checks.js";
import { parseSource, parseTags, slugifyName, stringFlag, type Flags } from "./cliHelpers.js";

/**
 * Asset Studio CLI — the gate every asset passes on its way into the game
 * (ADR-0011). Agent-operable: non-interactive, exit codes, --json output.
 *
 *   asset-studio validate  <png...>  --style <bible.json> --kind <kind> [--frames] [--json]
 *   asset-studio normalize <png...>  --style <bible.json> --out <dir>   [--json]
 *   asset-studio import    <png...>  --style <bible.json> --kind <kind> --path <her|his|shared>
 *                          --source <cc0|sprite-data|generated|hand> [attribution flags]
 *                          [--name <slug>] [--tags a,b] [--frames --frame-ms 140]
 *                          [--replace] [--db <dir>] [--json]
 *   asset-studio sprite    <spec.json...> --style <bible.json> --kind <kind> --path <p>
 *                          [--import [import flags]] [--out <dir>] [--json]
 *   asset-studio catalog   [--kind k] [--path p] [--tag t] [--name n] [--source type]
 *                          [--db <dir>] [--json]
 *   asset-studio preview   <name-or-id...> [--kind k] [--path p] [--tag t] [--all]
 *                          --out <dir> [--scale 8] [--db <dir>] [--json]
 *   asset-studio generate  --subject "..." --mood "..." --style <bible.json>
 *                          --kind <kind> --path <p> [--size small|medium|large]
 *                          [--import] [--out <dir>] [--yes] [--db <dir>] [--json]
 *
 * `normalize` runs the mandatory processArt pipeline (pixelize → quantize →
 * outline); `validate` checks gate-readiness; `import` runs normalize +
 * validate and lands passing assets in the content-addressed database with
 * catalog metadata (license bookkeeping is mandatory for CC0); `sprite`
 * renders model-emitted palette-indexed grids through the same gate;
 * `catalog` queries the database; `preview` writes human-viewable upscaled
 * PNGs. Exit 0 = pass, 1 = findings with errors, 2 = usage/IO problem.
 */

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "styles");

interface Cli {
  command: string;
  files: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Cli {
  const [command = "", ...rest] = argv;
  const files: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, true);
      }
    } else {
      files.push(a);
    }
  }
  return { command, files, flags };
}

async function loadStyle(flags: Flags): Promise<StyleBible> {
  const path = stringFlag(flags, "style");
  if (!path) usage("--style <bible.json> is required");
  return StyleBible.parse(JSON.parse(await readFile(path, "utf8")));
}

function parseKind(flags: Flags): AssetKind {
  const kind = stringFlag(flags, "kind");
  if (!kind || !ASSET_KINDS.includes(kind as AssetKind)) {
    usage(`--kind must be one of: ${ASSET_KINDS.join(", ")}`);
  }
  return kind as AssetKind;
}

function parsePath(flags: Flags): StoryPath {
  const parsed = StoryPath.safeParse(stringFlag(flags, "path"));
  if (!parsed.success) usage("--path must be one of: shared, her, his");
  return parsed.data;
}

function dbRoot(flags: Flags): string {
  return stringFlag(flags, "db") ?? assetDbRoot();
}

function usage(problem: string): never {
  console.error(`asset-studio: ${problem}

usage:
  asset-studio validate  <png...>       --style <bible.json> --kind <${ASSET_KINDS.join("|")}> [--frames] [--json]
  asset-studio normalize <png...>       --style <bible.json> --out <dir> [--json]
  asset-studio import    <png...>       --style <bible.json> --kind <kind> --path <shared|her|his>
                                        --source <cc0|sprite-data|generated|hand>
                                        (cc0: --pack --author --url [--license]; generated: --model)
                                        [--name <slug>] [--tags a,b] [--frames [--frame-ms <ms>]]
                                        [--replace] [--db <dir>] [--json]
  asset-studio sprite    <spec.json...> --style <bible.json> --kind <kind> --path <p>
                                        [--import] [--out <dir>] [--emitted-by <who>] [--json]
  asset-studio catalog   [--kind k] [--path p] [--tag t] [--name n] [--source type] [--db <dir>] [--json]
  asset-studio preview   [<name-or-id>...] [--kind k] [--path p] [--tag t] [--all]
                                        --out <dir> [--scale <n>] [--db <dir>] [--json]
  asset-studio generate  --subject "..." --mood "..." --style <bible.json> --kind <kind>
                                        --path <p> [--size small|medium|large] [--name <slug>]
                                        [--tags a,b] [--import] [--out <dir>] [--yes]
                                        [--db <dir>] [--json]     (COSTS MONEY — needs --yes)
  asset-studio variant   <name-or-id>   --name <new-slug> [--map "#from=#to,..."]
                                        [--style <bible.json>] [--path <p>] [--tags a,b]
                                        [--replace] [--db <dir>] [--json]
  asset-studio slice     <sheet.png...> --cell <n|WxH> --out <dir> [--spacing <n>]
                                        [--margin <n>] [--keep-blank] [--json]
  asset-studio credits   [--db <dir>] [--json]`);
  process.exit(2);
}

interface FileReport {
  file: string;
  findings: Finding[];
  outFile?: string;
  assetId?: string;
}

function report(reports: FileReport[], json: boolean, extra?: Record<string, unknown>): never {
  const failed = reports.some((r) => r.findings.some((f) => f.level === "error"));
  if (json) {
    console.log(JSON.stringify({ ok: !failed, reports, ...extra }, null, 2));
  } else {
    for (const r of reports) {
      const status = r.findings.some((f) => f.level === "error")
        ? "FAIL"
        : r.findings.length > 0
          ? "WARN"
          : "PASS";
      const suffix = r.outFile ? ` -> ${r.outFile}` : r.assetId ? ` => db:${r.assetId.slice(0, 12)}` : "";
      console.log(`${status}  ${r.file}${suffix}`);
      for (const f of r.findings) console.log(`      [${f.level}] ${f.check}: ${f.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

async function readImage(file: string): Promise<RawImage> {
  return decodePng(new Uint8Array(await readFile(file)));
}

async function cmdValidate(cli: Cli, json: boolean): Promise<never> {
  const style = await loadStyle(cli.flags);
  const kind = parseKind(cli.flags);
  if (cli.flags.get("frames") === true) {
    const frames = await Promise.all(cli.files.map(readImage));
    return report(
      [{ file: `${cli.files.length} frame(s): ${cli.files.join(", ")}`, findings: validateFrameSet(frames, style, kind) }],
      json,
    );
  }
  const reports: FileReport[] = [];
  for (const file of cli.files) {
    reports.push({ file, findings: validateAsset(await readImage(file), style, kind) });
  }
  return report(reports, json);
}

async function cmdNormalize(cli: Cli, json: boolean): Promise<never> {
  const style = await loadStyle(cli.flags);
  const out = stringFlag(cli.flags, "out");
  if (!out) usage("--out <dir> is required");
  await mkdir(out, { recursive: true });
  const reports: FileReport[] = [];
  for (const file of cli.files) {
    const processed = processArt(await readImage(file), style);
    const outFile = join(out, basename(file));
    await writeFile(outFile, encodePng(processed));
    reports.push({ file, findings: [], outFile });
  }
  return report(reports, json);
}

/**
 * The full gate in one step: normalize every input through processArt,
 * validate the result, and store what passes in the asset database with
 * catalog metadata. With --frames all inputs are ordered frames of ONE
 * animated asset; otherwise each file becomes its own asset.
 */
async function cmdImport(cli: Cli, json: boolean): Promise<never> {
  const style = await loadStyle(cli.flags);
  const kind = parseKind(cli.flags);
  const path = parsePath(cli.flags);
  const source = parseSource(cli.flags);
  if ("error" in source) usage(source.error);
  const tags = parseTags(cli.flags);
  const db = dbRoot(cli.flags);
  const replace = cli.flags.get("replace") === true;
  const asFrames = cli.flags.get("frames") === true;
  const nameFlag = stringFlag(cli.flags, "name");

  const processed: { file: string; img: RawImage }[] = [];
  for (const file of cli.files) {
    processed.push({ file, img: processArt(await readImage(file), style) });
  }

  const reports: FileReport[] = [];
  const stored: AssetRecord[] = [];

  if (asFrames) {
    const name = nameFlag ?? slugifyName(basename(cli.files[0] as string));
    const findings = validateFrameSet(processed.map((p) => p.img), style, kind);
    const label = `${name} (${cli.files.length} frames)`;
    if (findings.some((f) => f.level === "error")) {
      reports.push({ file: label, findings });
    } else {
      const frameMsRaw = stringFlag(cli.flags, "frame-ms");
      const frameMs = frameMsRaw ? Number(frameMsRaw) : undefined;
      const { record } = putAsset(
        {
          name,
          kind,
          path,
          styleName: style.paletteName,
          tags,
          frames: processed.map((p) => encodePng(p.img)),
          ...(frameMs !== undefined ? { frameMs } : {}),
          source,
          replace,
        },
        db,
      );
      stored.push(record);
      reports.push({ file: label, findings, assetId: record.id });
    }
  } else {
    if (nameFlag && cli.files.length > 1) {
      usage("--name only applies to a single asset (one file, or --frames)");
    }
    for (const { file, img } of processed) {
      const findings = validateAsset(img, style, kind);
      if (findings.some((f) => f.level === "error")) {
        reports.push({ file, findings });
        continue;
      }
      const { record } = putAsset(
        {
          name: nameFlag ?? slugifyName(basename(file)),
          kind,
          path,
          styleName: style.paletteName,
          tags,
          frames: [encodePng(img)],
          source,
          replace,
        },
        db,
      );
      stored.push(record);
      reports.push({ file, findings, assetId: record.id });
    }
  }
  return report(reports, json, { stored });
}

/** Render SpriteData specs and push them through the same gate. */
async function cmdSprite(cli: Cli, json: boolean): Promise<never> {
  const style = await loadStyle(cli.flags);
  const kind = parseKind(cli.flags);
  const doImport = cli.flags.get("import") === true;
  const out = stringFlag(cli.flags, "out");
  if (!doImport && !out) usage("sprite needs --import and/or --out <dir>");
  const path = doImport ? parsePath(cli.flags) : undefined;
  const db = dbRoot(cli.flags);
  const replace = cli.flags.get("replace") === true;
  const emittedBy = stringFlag(cli.flags, "emitted-by") ?? "hand";

  if (out) await mkdir(out, { recursive: true });
  const reports: FileReport[] = [];
  const stored: AssetRecord[] = [];
  for (const file of cli.files) {
    const sprite = SpriteData.parse(JSON.parse(await readFile(file, "utf8")));
    const gated = processArt(renderSpriteData(sprite), style);
    const findings = validateAsset(gated, style, kind);
    const entry: FileReport = { file: `${file} (${sprite.name})`, findings };
    if (out) {
      const outFile = join(out, `${sprite.name}.png`);
      await writeFile(outFile, encodePng(gated));
      entry.outFile = outFile;
    }
    if (!findings.some((f) => f.level === "error") && doImport && path) {
      const { record } = putAsset(
        {
          name: sprite.name,
          kind,
          path,
          styleName: style.paletteName,
          tags: parseTags(cli.flags),
          frames: [encodePng(gated)],
          source: { type: "sprite-data", emittedBy },
          replace,
        },
        db,
      );
      stored.push(record);
      entry.assetId = record.id;
    }
    reports.push(entry);
  }
  return report(reports, json, { stored });
}

function catalogQuery(flags: Flags): AssetQuery {
  const query: AssetQuery = {};
  const kind = stringFlag(flags, "kind");
  if (kind) {
    if (!ASSET_KINDS.includes(kind as AssetKind)) usage(`unknown --kind "${kind}"`);
    query.kind = kind as AssetKind;
  }
  const path = stringFlag(flags, "path");
  if (path) query.path = StoryPath.parse(path);
  const tag = stringFlag(flags, "tag");
  if (tag) query.tag = tag;
  const name = stringFlag(flags, "name");
  if (name) query.name = name;
  const source = stringFlag(flags, "source");
  if (source) query.sourceType = source as NonNullable<AssetQuery["sourceType"]>;
  return query;
}

function describeSource(record: AssetRecord): string {
  const s = record.source;
  switch (s.type) {
    case "cc0":
      return `cc0:${s.pack} (${s.author})`;
    case "sprite-data":
      return `sprite-data:${s.emittedBy}`;
    case "generated":
      return `generated:${s.model}`;
    case "hand":
      return s.author ? `hand:${s.author}` : "hand";
  }
}

function cmdCatalog(cli: Cli, json: boolean): never {
  const records = listAssets(catalogQuery(cli.flags), dbRoot(cli.flags));
  if (json) {
    console.log(JSON.stringify({ ok: true, count: records.length, assets: records }, null, 2));
  } else if (records.length === 0) {
    console.log("catalog is empty for this query");
  } else {
    for (const r of records) {
      const frames = r.frames.length > 1 ? ` ${r.frames.length}f@${r.frameMs ?? "?"}ms` : "";
      const tags = r.tags.length > 0 ? `  [${r.tags.join(", ")}]` : "";
      console.log(
        `${r.name.padEnd(24)} ${r.kind.padEnd(8)} ${r.path.padEnd(6)} ${`${r.width}x${r.height}`.padEnd(7)}${frames}  ${describeSource(r)}${tags}  ${r.id.slice(0, 12)}`,
      );
    }
  }
  process.exit(0);
}

/** Write upscaled PNGs for humans — never the gate output itself. */
async function cmdPreview(cli: Cli, json: boolean): Promise<never> {
  const out = stringFlag(cli.flags, "out");
  if (!out) usage("--out <dir> is required");
  const scaleRaw = stringFlag(cli.flags, "scale");
  const scale = scaleRaw ? Number(scaleRaw) : 8;
  const db = dbRoot(cli.flags);

  let records: AssetRecord[];
  if (cli.flags.get("all") === true || cli.files.length === 0) {
    records = listAssets(catalogQuery(cli.flags), db);
    if (records.length === 0) usage("nothing to preview — empty query and no names given");
  } else {
    records = cli.files.map((ref) => {
      const byName = listAssets({ name: ref }, db);
      if (byName.length === 1) return byName[0] as AssetRecord;
      if (byName.length > 1) {
        usage(`"${ref}" matches ${byName.length} assets (use catalog filters or the id)`);
      }
      return getAssetRecord(ref, db);
    });
  }

  await mkdir(out, { recursive: true });
  const reports: FileReport[] = [];
  for (const record of records) {
    for (let i = 0; i < record.frames.length; i++) {
      const img = decodePng(readBlob(record.frames[i] as string, db));
      const suffix = record.frames.length > 1 ? `.f${i}` : "";
      const outFile = join(out, `${record.name}.${record.path}${suffix}@${scale}x.png`);
      await writeFile(outFile, encodePng(upscale(img, scale)));
      reports.push({ file: `${record.name} (${record.kind}, ${record.path})`, findings: [], outFile });
    }
  }
  return report(reports, json);
}

/**
 * Cut a spritesheet into numbered cell PNGs. Most free packs ship one packed
 * sheet rather than loose files, so this is the front door for ingestion:
 * slice, look at the cells, then `import` the ones worth keeping with real
 * names. Blank cells are skipped unless --keep-blank.
 */
async function cmdSlice(cli: Cli, json: boolean): Promise<never> {
  const out = stringFlag(cli.flags, "out");
  if (!out) usage("--out <dir> is required");
  const cellRaw = stringFlag(cli.flags, "cell");
  if (!cellRaw) usage('--cell <n> or --cell <w>x<h> is required (the sheet\'s cell size)');
  const [wRaw, hRaw] = cellRaw.split("x");
  const cellWidth = Number(wRaw);
  const cellHeight = hRaw === undefined ? cellWidth : Number(hRaw);
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)) {
    usage(`--cell must be integers, got "${cellRaw}"`);
  }
  const spacing = Number(stringFlag(cli.flags, "spacing") ?? 0);
  const margin = Number(stringFlag(cli.flags, "margin") ?? 0);
  const keepBlank = cli.flags.get("keep-blank") === true;

  await mkdir(out, { recursive: true });
  const reports: FileReport[] = [];
  for (const file of cli.files) {
    const cells = sliceSheet(await readImage(file), {
      cellWidth,
      cellHeight,
      spacing,
      margin,
    });
    let written = 0;
    for (const cell of cells) {
      if (!keepBlank && isBlank(cell.image)) continue;
      const name = `${basename(file).replace(/\.png$/i, "")}_${String(cell.index).padStart(4, "0")}.png`;
      await writeFile(join(out, name), encodePng(cell.image));
      written++;
    }
    reports.push({
      file: `${file} -> ${written}/${cells.length} cell(s)`,
      findings: [],
      outFile: out,
    });
  }
  return report(reports, json);
}

/**
 * Recolor/restyle an asset already in the database into a new catalog entry
 * (ADR-0011: "recolor/recombine variants"). The original's `source` carries
 * over and `derivedFrom` records the parent, so one curated CC0 pack yields
 * many assets without losing anybody's attribution. The output re-enters
 * through the gate like anything else.
 */
async function cmdVariant(cli: Cli, json: boolean): Promise<never> {
  const db = dbRoot(cli.flags);
  const ref = cli.files[0];
  if (!ref || cli.files.length > 1) usage("variant takes exactly one asset name or id");
  const name = stringFlag(cli.flags, "name");
  if (!name) usage("--name <slug> is required for the new variant");

  const matches = listAssets({ name: ref }, db);
  if (matches.length > 1) usage(`"${ref}" matches ${matches.length} assets — use the id`);
  const parent = matches[0] ?? getAssetRecord(ref, db);

  // Restyling to another world re-gates against that bible; otherwise the
  // asset stays in its own world and only its colors move.
  const styleFlag = stringFlag(cli.flags, "style");
  const style = styleFlag
    ? StyleBible.parse(JSON.parse(await readFile(styleFlag, "utf8")))
    : undefined;
  const path = stringFlag(cli.flags, "path") ? parsePath(cli.flags) : parent.path;
  if (!style && path !== parent.path) {
    usage("--path to another world needs that world's --style bible");
  }
  const targetStyle = style ?? (await loadStyleFor(parent, cli.flags));
  const mapSpec = stringFlag(cli.flags, "map");
  const mapping = mapSpec ? parseColorMapping(mapSpec) : undefined;
  if (!mapping && !style) usage("variant needs --map <#from=#to,...> and/or --style <bible.json>");

  const frames: Uint8Array[] = [];
  const findings: Finding[] = [];
  for (const [i, hash] of parent.frames.entries()) {
    const source = decodePng(readBlob(hash, db));
    const recolored = mapping ? recolor(source, mapping) : source;
    const gated = processArt(recolored, targetStyle);
    for (const f of validateAsset(gated, targetStyle, parent.kind)) {
      findings.push(
        parent.frames.length > 1 ? { ...f, message: `frame ${i}: ${f.message}` } : f,
      );
    }
    frames.push(encodePng(gated));
  }

  const entry: FileReport = { file: `${parent.name} -> ${name} (${path})`, findings };
  const stored: AssetRecord[] = [];
  if (!findings.some((f) => f.level === "error")) {
    const { record } = putAsset(
      {
        name,
        kind: parent.kind,
        path,
        styleName: targetStyle.paletteName,
        tags: parseTags(cli.flags).length > 0 ? parseTags(cli.flags) : parent.tags,
        frames,
        ...(parent.frameMs !== undefined ? { frameMs: parent.frameMs } : {}),
        source: parent.source, // attribution chains, never gets overwritten
        derivedFrom: parent.id,
        replace: cli.flags.get("replace") === true,
      },
      db,
    );
    stored.push(record);
    entry.assetId = record.id;
  }
  return report([entry], json, { stored });
}

/** The style bible a variant keeps when it isn't being restyled. */
async function loadStyleFor(parent: AssetRecord, flags: Flags): Promise<StyleBible> {
  const explicit = stringFlag(flags, "style");
  if (explicit) return StyleBible.parse(JSON.parse(await readFile(explicit, "utf8")));
  const guess = join(STYLES_DIR, `${parent.path}-world.draft.json`);
  try {
    return StyleBible.parse(JSON.parse(await readFile(guess, "utf8")));
  } catch {
    usage(`could not infer the style bible for "${parent.name}" — pass --style <bible.json>`);
  }
}

/** The CREDITS the game ships: every licensed source in the catalog, deduped. */
function cmdCredits(cli: Cli, json: boolean): never {
  const entries = attributions(dbRoot(cli.flags));
  if (json) console.log(JSON.stringify({ ok: true, attributions: entries }, null, 2));
  else process.stdout.write(renderCredits(entries));
  process.exit(0);
}

/**
 * gpt-image-2 generation (ADR-0011 source #3). This is the one command that
 * spends the owner's OpenAI budget, so it refuses to run without --yes and
 * prints what it will cost the ledger. Everything downstream is the same
 * gate every other source passes.
 */
async function cmdGenerate(cli: Cli, json: boolean): Promise<never> {
  const style = await loadStyle(cli.flags);
  const kind = parseKind(cli.flags);
  const subject = stringFlag(cli.flags, "subject");
  const mood = stringFlag(cli.flags, "mood");
  if (!subject || !mood) usage("generate needs --subject and --mood");
  const doImport = cli.flags.get("import") === true;
  const out = stringFlag(cli.flags, "out");
  if (!doImport && !out) usage("generate needs --import and/or --out <dir>");
  const path = doImport ? parsePath(cli.flags) : undefined;
  if (cli.flags.get("yes") !== true) {
    usage(
      `generate calls ${IMAGE_MODEL} and spends real money from the owner's OpenAI budget — pass --yes to confirm`,
    );
  }

  const request = ArtRequest.parse({
    kind: kind === "tile" ? "background" : kind,
    subject,
    mood,
    sizeClass: stringFlag(cli.flags, "size") ?? "medium",
  });

  const { GptImageProvider } = await import("@howeverfar/director");
  const raw = await new GptImageProvider().generate(request, style);
  const gated = processArt(raw, style);
  const findings = validateAsset(gated, style, kind);
  const name = stringFlag(cli.flags, "name") ?? slugifyName(subject).slice(0, 40);
  const entry: FileReport = { file: `${IMAGE_MODEL}: ${subject} (${name})`, findings };

  if (out) {
    await mkdir(out, { recursive: true });
    const outFile = join(out, `${name}.png`);
    await writeFile(outFile, encodePng(gated));
    entry.outFile = outFile;
  }

  const stored: AssetRecord[] = [];
  if (!findings.some((f) => f.level === "error") && doImport && path) {
    const { record } = putAsset(
      {
        name,
        kind,
        path,
        styleName: style.paletteName,
        tags: parseTags(cli.flags),
        frames: [encodePng(gated)],
        source: { type: "generated", model: IMAGE_MODEL },
        replace: cli.flags.get("replace") === true,
      },
      dbRoot(cli.flags),
    );
    stored.push(record);
    entry.assetId = record.id;
  }
  return report([entry], json, { stored, costLedger: costLedgerPath() });
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const json = cli.flags.get("json") === true;
  const needsFiles = ["validate", "normalize", "import", "sprite", "variant", "slice"];
  if (needsFiles.includes(cli.command) && cli.files.length === 0) usage("no input files");

  switch (cli.command) {
    case "validate":
      return await cmdValidate(cli, json);
    case "normalize":
      return await cmdNormalize(cli, json);
    case "import":
      return await cmdImport(cli, json);
    case "sprite":
      return await cmdSprite(cli, json);
    case "catalog":
      return cmdCatalog(cli, json);
    case "preview":
      return await cmdPreview(cli, json);
    case "generate":
      return await cmdGenerate(cli, json);
    case "slice":
      return await cmdSlice(cli, json);
    case "variant":
      return await cmdVariant(cli, json);
    case "credits":
      return cmdCredits(cli, json);
    default:
      usage(`unknown command "${cli.command}"`);
  }
}

main().catch((err: unknown) => {
  console.error(`asset-studio: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
