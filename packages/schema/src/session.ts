import { z } from "zod";
import { Slug } from "./scene.js";
import { AreaGameState, AreaSpec, StoryPath } from "./area.js";
import { PlayerProfile, PlaySignal } from "./profile.js";
import { StoryArc } from "./arc.js";
import { CanonFact } from "./canon.js";

/**
 * A resumable RPG play session (Area DSL v1, the pivot era). The text-era
 * SessionSave (bundle.ts) remains valid until those apps retire.
 */
export const AreaSessionSave = z.object({
  id: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  phase: z.enum(["prologue", "generated", "ended"]),
  /** "shared" until the player chooses a door at the crossing. */
  path: StoryPath,
  state: AreaGameState,
  areas: z.record(Slug, AreaSpec),
  signals: z.array(PlaySignal),
  profile: PlayerProfile.optional(),
  arc: StoryArc.optional(),
  canon: z.array(CanonFact).default([]),
  /** Consecutive accepted areas that advanced no arc beat (drift detector). */
  /**
   * What this playthrough has cost so far in USD (ADR-0018). Defaulted so
   * saves written before budgeting still load.
   */
  spentUsd: z.number().min(0).default(0),
  areasSinceBeatProgress: z.number().int().min(0).default(0),
  endingSummary: z.string().max(2000).optional(),
});
export type AreaSessionSave = z.infer<typeof AreaSessionSave>;
