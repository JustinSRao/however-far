import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AreaSessionSave, SessionSave, UniverseBundle } from "@unwritten/schema";

/**
 * File-based persistence (see ADR-0007): one JSON file per session/bundle
 * under UNWRITTEN_HOME (default ~/.unwritten). Deliberately boring — swap for
 * a database when the library goes multi-user.
 */
export function storeRoot(): string {
  return process.env["UNWRITTEN_HOME"] ?? join(homedir(), ".unwritten");
}

function dir(kind: "sessions" | "bundles" | "world-sessions"): string {
  const d = join(storeRoot(), kind);
  mkdirSync(d, { recursive: true });
  return d;
}

const safeName = (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, "_");

export function saveSession(session: SessionSave): string {
  const file = join(dir("sessions"), `${safeName(session.id)}.json`);
  writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
  return file;
}

export function loadSession(id: string): SessionSave {
  const file = join(dir("sessions"), `${safeName(id)}.json`);
  return SessionSave.parse(JSON.parse(readFileSync(file, "utf8")));
}

export interface SessionInfo {
  id: string;
  phase: SessionSave["phase"];
  updatedAt: string;
  scenesPlayed: number;
}

export function listSessions(): SessionInfo[] {
  const out: SessionInfo[] = [];
  for (const f of readdirSync(dir("sessions"))) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = SessionSave.parse(
        JSON.parse(readFileSync(join(dir("sessions"), f), "utf8")),
      );
      out.push({
        id: s.id,
        phase: s.phase,
        updatedAt: s.updatedAt,
        scenesPlayed: s.state.visitedSceneIds.length,
      });
    } catch {
      // Unreadable saves are skipped, never fatal.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveWorldSession(session: AreaSessionSave): string {
  const file = join(dir("world-sessions"), `${safeName(session.id)}.json`);
  writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
  return file;
}

export function loadWorldSession(id: string): AreaSessionSave {
  const file = join(dir("world-sessions"), `${safeName(id)}.json`);
  return AreaSessionSave.parse(JSON.parse(readFileSync(file, "utf8")));
}

export interface WorldSessionInfo {
  id: string;
  phase: AreaSessionSave["phase"];
  path: AreaSessionSave["path"];
  updatedAt: string;
  areasVisited: number;
}

export function listWorldSessions(): WorldSessionInfo[] {
  const out: WorldSessionInfo[] = [];
  for (const f of readdirSync(dir("world-sessions"))) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = AreaSessionSave.parse(
        JSON.parse(readFileSync(join(dir("world-sessions"), f), "utf8")),
      );
      out.push({
        id: s.id,
        phase: s.phase,
        path: s.path,
        updatedAt: s.updatedAt,
        areasVisited: s.state.visitedAreaIds.length,
      });
    } catch {
      // Unreadable saves are skipped, never fatal.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function writeBundle(bundle: UniverseBundle): string {
  const slug = bundle.manifest.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  const file = join(dir("bundles"), `${slug || "universe"}.json`);
  writeFileSync(file, JSON.stringify(bundle, null, 2), "utf8");
  return file;
}

export function readBundle(path: string): UniverseBundle {
  return UniverseBundle.parse(JSON.parse(readFileSync(path, "utf8")));
}

export interface BundleInfo {
  path: string;
  title: string;
  description: string;
  createdAt: string;
  creator?: string;
}

export function listBundles(): BundleInfo[] {
  const out: BundleInfo[] = [];
  for (const f of readdirSync(dir("bundles"))) {
    if (!f.endsWith(".json")) continue;
    const path = join(dir("bundles"), f);
    try {
      const b = readBundle(path);
      out.push({
        path,
        title: b.manifest.title,
        description: b.manifest.description,
        createdAt: b.manifest.createdAt,
        ...(b.manifest.creator ? { creator: b.manifest.creator } : {}),
      });
    } catch {
      // Invalid bundles are skipped.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
