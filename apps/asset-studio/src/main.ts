import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { StyleBible } from "@unwritten/schema";
import { decodePng, encodePng, processArt } from "@unwritten/art";
import { ASSET_KINDS, validateAsset, type AssetKind, type Finding } from "./checks.js";

/**
 * Asset Studio CLI — the gate every asset passes on its way into the game
 * (ADR-0011). Agent-operable: non-interactive, exit codes, --json output.
 *
 *   asset-studio validate  <png...> --style <bible.json> --kind <kind> [--json]
 *   asset-studio normalize <png...> --style <bible.json> --out <dir>   [--json]
 *
 * `normalize` runs the mandatory processArt pipeline (pixelize → quantize →
 * outline) and writes the result; `validate` checks conformance of an asset
 * that claims to be gate-ready. Exit 0 = pass, 1 = findings with errors,
 * 2 = usage/IO problem.
 */

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

async function loadStyle(flags: Cli["flags"]): Promise<StyleBible> {
  const path = flags.get("style");
  if (typeof path !== "string") usage("--style <bible.json> is required");
  return StyleBible.parse(JSON.parse(await readFile(path, "utf8")));
}

function parseKind(flags: Cli["flags"]): AssetKind {
  const kind = flags.get("kind");
  if (typeof kind !== "string" || !ASSET_KINDS.includes(kind as AssetKind)) {
    usage(`--kind must be one of: ${ASSET_KINDS.join(", ")}`);
  }
  return kind as AssetKind;
}

function usage(problem: string): never {
  console.error(`asset-studio: ${problem}

usage:
  asset-studio validate  <png...> --style <bible.json> --kind <tile|sprite|portrait|item> [--json]
  asset-studio normalize <png...> --style <bible.json> --out <dir> [--json]`);
  process.exit(2);
}

interface FileReport {
  file: string;
  findings: Finding[];
  outFile?: string;
}

function report(reports: FileReport[], json: boolean): void {
  const failed = reports.some((r) => r.findings.some((f) => f.level === "error"));
  if (json) {
    console.log(JSON.stringify({ ok: !failed, reports }, null, 2));
  } else {
    for (const r of reports) {
      const status = r.findings.some((f) => f.level === "error")
        ? "FAIL"
        : r.findings.length > 0
          ? "WARN"
          : "PASS";
      console.log(`${status}  ${r.file}${r.outFile ? ` -> ${r.outFile}` : ""}`);
      for (const f of r.findings) console.log(`      [${f.level}] ${f.check}: ${f.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const json = cli.flags.get("json") === true;
  if (cli.files.length === 0) usage("no input files");

  if (cli.command === "validate") {
    const style = await loadStyle(cli.flags);
    const kind = parseKind(cli.flags);
    const reports: FileReport[] = [];
    for (const file of cli.files) {
      const img = decodePng(new Uint8Array(await readFile(file)));
      reports.push({ file, findings: validateAsset(img, style, kind) });
    }
    report(reports, json);
  } else if (cli.command === "normalize") {
    const style = await loadStyle(cli.flags);
    const out = cli.flags.get("out");
    if (typeof out !== "string") usage("--out <dir> is required");
    await mkdir(out, { recursive: true });
    const reports: FileReport[] = [];
    for (const file of cli.files) {
      const img = decodePng(new Uint8Array(await readFile(file)));
      const processed = processArt(img, style);
      const outFile = join(out, basename(file));
      await writeFile(outFile, encodePng(processed));
      reports.push({ file, findings: [], outFile });
    }
    report(reports, json);
  } else {
    usage(`unknown command "${cli.command}"`);
  }
}

main().catch((err: unknown) => {
  console.error(`asset-studio: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
