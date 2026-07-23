import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrossingCall, ReunionSessionSave } from "@howeverfar/schema";
import { storeRoot } from "./store.js";

/**
 * Persistence for the Reunion (Phase 7): the calls waiting to be answered,
 * and the shared worlds that answered them. Same file-based store as
 * everything else (ADR-0007) — the host is somebody's laptop, not a service.
 */

function dir(kind: "crossing-calls" | "reunions"): string {
  const d = join(storeRoot(), kind);
  mkdirSync(d, { recursive: true });
  return d;
}

const safeName = (id: string) => id.replace(/[^a-zA-Z0-9-_@.]/g, "_");

export function saveCall(call: CrossingCall): string {
  const file = join(dir("crossing-calls"), `${safeName(call.id)}.json`);
  writeFileSync(file, JSON.stringify(call, null, 2), "utf8");
  return file;
}

export function listCalls(): CrossingCall[] {
  const out: CrossingCall[] = [];
  for (const f of readdirSync(dir("crossing-calls"))) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(CrossingCall.parse(JSON.parse(readFileSync(join(dir("crossing-calls"), f), "utf8"))));
    } catch {
      // An unreadable call is skipped, never fatal — the other one still waits.
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Take a call out of the waiting list once it has been answered. Keeping it
 * would let a stale call pair a third person into a world that already has
 * two people in it.
 */
export function removeCall(id: string): void {
  rmSync(join(dir("crossing-calls"), `${safeName(id)}.json`), { force: true });
}

export function saveReunion(session: ReunionSessionSave): string {
  const file = join(dir("reunions"), `${safeName(session.id)}.json`);
  writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
  return file;
}

export function loadReunion(id: string): ReunionSessionSave {
  const file = join(dir("reunions"), `${safeName(id)}.json`);
  return ReunionSessionSave.parse(JSON.parse(readFileSync(file, "utf8")));
}

export interface ReunionInfo {
  id: string;
  phase: ReunionSessionSave["phase"];
  updatedAt: string;
  her: string;
  his: string;
  areasVisited: number;
}

export function listReunions(): ReunionInfo[] {
  const out: ReunionInfo[] = [];
  for (const f of readdirSync(dir("reunions"))) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = ReunionSessionSave.parse(
        JSON.parse(readFileSync(join(dir("reunions"), f), "utf8")),
      );
      out.push({
        id: s.id,
        phase: s.phase,
        updatedAt: s.updatedAt,
        her: s.state.her.name,
        his: s.state.his.name,
        areasVisited: s.state.visitedAreaIds.length,
      });
    } catch {
      // Unreadable saves are skipped.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
