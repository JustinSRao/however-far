import {
  CanonFact,
  CheckerVerdict,
  FactExtraction,
  PlayerProfile,
  PlaySignal,
  SceneSpec,
  StoryArc,
} from "@unwritten/schema";
import type { z } from "zod";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import {
  ARCHITECT_SYSTEM,
  CHECKER_SYSTEM,
  EXTRACTOR_SYSTEM,
  PROFILER_SYSTEM,
  REVISER_SYSTEM,
  buildArchitectUser,
  buildCheckerUser,
  buildExtractorUser,
  buildProfilerUser,
  buildReviserUser,
} from "./prompts.js";

export async function buildProfile(
  model: ModelClient,
  signals: readonly PlaySignal[],
): Promise<PlayerProfile> {
  return model.generateStructured({
    role: DIRECTOR_CONFIG.profiler,
    system: PROFILER_SYSTEM,
    user: buildProfilerUser(signals),
    schema: PlayerProfile,
  });
}

export async function createArc(
  model: ModelClient,
  profile: PlayerProfile,
  facts: readonly CanonFact[],
): Promise<StoryArc> {
  const arc = await model.generateStructured({
    role: DIRECTOR_CONFIG.architect,
    system: ARCHITECT_SYSTEM,
    user: buildArchitectUser(profile, facts),
    schema: StoryArc,
  });
  return normalizeArc(arc);
}

export async function reviseArc(
  model: ModelClient,
  arc: StoryArc,
  profile: PlayerProfile,
  facts: readonly CanonFact[],
  reason: string,
): Promise<StoryArc> {
  const revised = await model.generateStructured({
    role: DIRECTOR_CONFIG.architect,
    system: REVISER_SYSTEM,
    user: buildReviserUser(arc, profile, facts, reason),
    schema: StoryArc,
  });
  return normalizeArc(revised);
}

/** Server-side sanity: currentActId must exist; default to the first act. */
export function normalizeArc(arc: StoryArc): StoryArc {
  if (arc.acts.some((a) => a.id === arc.currentActId)) return arc;
  const first = arc.acts[0];
  if (!first) throw new Error("arc has no acts");
  return { ...arc, currentActId: first.id };
}

/** Mark a beat done and advance currentActId when an act completes. Pure. */
export function advanceArc(arc: StoryArc, completedBeatId?: string): StoryArc {
  let next: StoryArc = completedBeatId
    ? {
        ...arc,
        acts: arc.acts.map((a) => ({
          ...a,
          beats: a.beats.map((b) =>
            b.id === completedBeatId ? { ...b, status: "done" as const } : b,
          ),
        })),
      }
    : arc;
  const idx = next.acts.findIndex((a) => a.id === next.currentActId);
  const current = next.acts[idx];
  if (
    current &&
    idx < next.acts.length - 1 &&
    current.beats.every((b) => b.status !== "pending")
  ) {
    const upcoming = next.acts[idx + 1];
    if (upcoming) next = { ...next, currentActId: upcoming.id };
  }
  return next;
}

export function isFinalAct(arc: StoryArc): boolean {
  const last = arc.acts[arc.acts.length - 1];
  return !!last && last.id === arc.currentActId;
}

export async function checkContinuity(
  model: ModelClient,
  scene: SceneSpec,
  facts: readonly CanonFact[],
): Promise<z.infer<typeof CheckerVerdict>> {
  if (facts.length === 0) return { ok: true };
  return model.generateStructured({
    role: DIRECTOR_CONFIG.checker,
    system: CHECKER_SYSTEM,
    user: buildCheckerUser(scene, facts),
    schema: CheckerVerdict,
  });
}

/** Fact extraction is best-effort: failures log and return nothing, never break play. */
export async function extractFacts(
  model: ModelClient,
  scene: SceneSpec,
  existing: readonly CanonFact[],
  log?: (msg: string) => void,
): Promise<z.infer<typeof FactExtraction>["facts"]> {
  try {
    const out = await model.generateStructured({
      role: DIRECTOR_CONFIG.extractor,
      system: EXTRACTOR_SYSTEM,
      user: buildExtractorUser(scene, existing),
      schema: FactExtraction,
    });
    return out.facts;
  } catch (err) {
    log?.(`fact extraction failed for scene ${scene.id}: ${String(err)}`);
    return [];
  }
}
