import { z } from "zod";
import { DSL_VERSION, SceneSpec, Slug } from "./scene.js";
import { GameState } from "./state.js";
import { PlayerProfile, PlaySignal } from "./profile.js";
import { StoryArc } from "./arc.js";
import { CanonFact } from "./canon.js";

/** The visual identity of one universe — authored once at genre reveal, then locked. */
export const StyleBible = z.object({
  paletteName: z.string().min(1).max(60),
  /** 4–32 hex colors; all art is quantized to exactly these. */
  colors: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/))
    .min(4)
    .max(32),
  gridSize: z.union([z.literal(16), z.literal(32), z.literal(48)]),
  outline: z.enum(["none", "dark", "selective"]),
  perspective: z.string().min(1).max(120),
  keywords: z.array(z.string().min(1).max(40)).max(12),
});
export type StyleBible = z.infer<typeof StyleBible>;

export const BUNDLE_FORMAT_VERSION = 0;

/**
 * A finished playthrough, exported. This is what the public library stores.
 * On replay, `arc` and `canon` load as fixed constraints; scenes regenerate
 * fresh per player (ADR-0006). Bundles must remain loadable forever.
 */
export const UniverseBundle = z.object({
  manifest: z.object({
    formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
    dslVersion: z.literal(DSL_VERSION),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(1000),
    createdAt: z.string().datetime(),
    creator: z.string().min(1).max(80).optional(),
  }),
  /** The profile as it stood when the Anchor ended — the branch point. */
  profileAtAnchorExit: PlayerProfile,
  arc: StoryArc,
  canon: z.array(CanonFact),
  styleBible: StyleBible.optional(),
  /** The creator's played scenes, for attribution/inspection — not replayed. */
  playedScenes: z.array(SceneSpec),
});
export type UniverseBundle = z.infer<typeof UniverseBundle>;

/** A resumable play session on disk. */
export const SessionSave = z.object({
  id: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  phase: z.enum(["anchor", "generated", "ended"]),
  state: GameState,
  scenes: z.record(Slug, SceneSpec),
  /** Order in which scenes were played (state.visitedSceneIds mirrors this). */
  signals: z.array(PlaySignal),
  profile: PlayerProfile.optional(),
  arc: StoryArc.optional(),
  canon: z.array(CanonFact).default([]),
  /** Set when this session is a replay of a published universe. */
  replayOfBundle: z.string().min(1).max(120).optional(),
  /** Set once the final scene has been generated; picking its choice ends play. */
  endingSceneId: Slug.optional(),
  endingSummary: z.string().max(2000).optional(),
});
export type SessionSave = z.infer<typeof SessionSave>;
