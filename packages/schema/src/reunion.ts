import { z } from "zod";
import { EndingTone, Slug } from "./scene.js";
import { AreaAction, AreaGameState, AreaSpec, GridPos, SoloPath } from "./area.js";
import { CharacterSheet, QuestEntry, RngState, STARTING_SHEET } from "./mechanics.js";
import { CanonFact, CharacterRecord } from "./canon.js";
import { PlayerProfile } from "./profile.js";
import { StoryArc, ThresholdEnding } from "./arc.js";

/**
 * The Reunion (Phase 7) — the only true ending.
 *
 * STORY.md: a solo path runs a complete arc but stops at a **threshold**.
 * Suzune reaches the way home and cannot cross alone; Itsuki learns the truth
 * and cannot reach her alone. The game is beaten by two players — one who
 * finished each side — playing the last act together, generated from **both**
 * playthroughs' canon.
 *
 * Everything here exists to make that merge possible from two machines that
 * have never met.
 */

export const REUNION_EXPORT_VERSION = 1;

/**
 * Everything one finished playthrough carries across, and nothing else.
 *
 * Deliberately not the save file: full AreaSpecs are megabytes of tile grids
 * that the finale has no use for. What the Reunion needs is who they met, what
 * is true, how it ended, and the shape of the road — small enough to hand to
 * another player over any channel they like.
 */
export const PlaythroughExport = z.object({
  formatVersion: z.literal(REUNION_EXPORT_VERSION),
  sessionId: z.string().min(1).max(80),
  path: SoloPath,
  /** The name this player answers to. Not an account — a name (ADR-0023). */
  playerName: z.string().min(1).max(60),
  completedAt: z.string().datetime(),
  profile: PlayerProfile,
  arc: StoryArc,
  canon: z.array(CanonFact).max(1000),
  characters: z.array(CharacterRecord).max(300),
  /**
   * What they ended their path as. They arrive at the Reunion having grown —
   * an attribute earned over thirty areas should not be handed back at the
   * door.
   */
  sheet: CharacterSheet,
  /** The path ending, including its `reunionSeeds` — the point of all this. */
  ending: ThresholdEnding,
  /** The road walked: names and prose, not maps. */
  road: z
    .array(
      z.object({
        id: Slug,
        name: z.string().min(1).max(120),
        description: z.string().min(1).max(2000),
      }),
    )
    .max(200),
});
export type PlaythroughExport = z.infer<typeof PlaythroughExport>;

/**
 * Who someone is, for the purpose of being called to. A name and an address —
 * the two things the fiction asks for (docs/REUNION.md), and the two things a
 * self-hosted server can match on without inventing accounts.
 */
export const CallerIdentity = z.object({
  name: z.string().min(1).max(60),
  email: z.string().email().max(200),
});
export type CallerIdentity = z.infer<typeof CallerIdentity>;

/** Addresses match case-insensitively and ignoring surrounding space. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * One side reaching across (docs/REUNION.md — "the Call"). In fiction: she
 * rings the bell toward a name, he writes a name back into a register. In
 * mechanism: a mutual invitation, which is why both sides must send one and
 * why neither can drag the other in.
 */
export const CrossingCall = z.object({
  id: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  /** The name and address this player answers to. */
  self: CallerIdentity,
  /** Who they are calling for. */
  calling: CallerIdentity,
  path: SoloPath,
  /**
   * Their Reunion key (ADR-0024). Optional in the schema because a build with
   * `HOWEVERFAR_REUNION_UNLOCKED=1` never asks for one; the server decides
   * whether its absence is allowed, and every player is checked separately —
   * one purchase does not buy two seats.
   */
  license: z.string().min(1).max(120).optional(),
  playthrough: PlaythroughExport,
});
export type CrossingCall = z.infer<typeof CrossingCall>;

/**
 * Do these two calls answer each other? Each must be calling for the other's
 * address, and they must be opposite sides of the story — two people who both
 * finished her path have nothing to cross toward.
 *
 * Names are shown, never matched on: people spell each other's names however
 * they like, and a reunion should not fail on a missing accent.
 */
export function callsAnswer(a: CrossingCall, b: CrossingCall): boolean {
  if (a.path === b.path) return false;
  if (sameAddress(a.self.email, b.self.email)) return false;
  return (
    sameAddress(a.calling.email, b.self.email) &&
    sameAddress(b.calling.email, a.self.email)
  );
}

export const ReunionRole = SoloPath;
export type ReunionRole = z.infer<typeof ReunionRole>;

/** One of the two players in a shared world. */
export const ReunionPlayer = z.object({
  role: ReunionRole,
  name: z.string().min(1).max(60),
  pos: GridPos,
  facing: z.enum(["up", "down", "left", "right"]),
  sheet: CharacterSheet.default(STARTING_SHEET),
  /** Whether their client is attached right now. Play continues either way. */
  connected: z.boolean().default(false),
});
export type ReunionPlayer = z.infer<typeof ReunionPlayer>;

/**
 * Two players, one world. Position, facing and sheet are per-player; the world
 * itself — flags, inventory, what has been used, the quest log, the dice — is
 * shared, because they are in it together and a door one of them opened is
 * open.
 */
export const ReunionGameState = z.object({
  currentAreaId: Slug,
  her: ReunionPlayer,
  his: ReunionPlayer,
  flags: z.record(Slug, z.boolean()),
  inventory: z.array(z.object({ item: Slug, name: z.string() })),
  visitedAreaIds: z.array(Slug),
  usedInteractions: z.array(z.string()),
  rng: RngState.default({ seed: 1, counter: 0 }),
  quests: z.array(QuestEntry).max(32).default([]),
});
export type ReunionGameState = z.infer<typeof ReunionGameState>;

/**
 * An action and which of the two took it. Clients send only the action; the
 * server stamps the role from the socket that carried it, so neither player
 * can act as the other.
 */
export const ReunionAction = z.object({
  role: ReunionRole,
  action: AreaAction,
});
export type ReunionAction = z.infer<typeof ReunionAction>;

/**
 * The finale. The inverse of `ThresholdEnding` in the one way that matters:
 * this one is **allowed to resolve**, and is the only thing in the game that
 * is. `paidOffSeedIds` is the structural proof that both playthroughs were
 * actually in the room — a finale that pays off only one side's seeds is not
 * a reunion, it is one player's ending with a witness.
 */
export const ReunionEnding = z.object({
  title: z.string().min(1).max(120),
  /** The whole of it: 300-900 words. The last thing either player reads. */
  closingText: z.string().min(300).max(6000),
  tone: EndingTone,
  /** Ids of reunion seeds — from BOTH exports — this finale pays off. */
  paidOffSeedIds: z.array(Slug).min(2).max(16),
});
export type ReunionEnding = z.infer<typeof ReunionEnding>;

/** A shared world in progress, saved on whichever machine is hosting it. */
export const ReunionSessionSave = z.object({
  id: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  phase: z.enum(["reunion", "ended"]),
  state: ReunionGameState,
  areas: z.record(Slug, AreaSpec),
  arc: StoryArc,
  canon: z.array(CanonFact).default([]),
  characters: z.record(Slug, CharacterRecord).default({}),
  /** The two playthroughs this world was made from. */
  her: PlaythroughExport,
  his: PlaythroughExport,
  /**
   * Who each side is, as they gave it in their Call. This is how the player
   * who called first finds out they were answered — a name is not an address
   * and two people can share one.
   */
  contacts: z.object({ her: CallerIdentity, his: CallerIdentity }),
  spentUsd: z.number().min(0).default(0),
  areasSinceBeatProgress: z.number().int().min(0).default(0),
  ending: ReunionEnding.optional(),
  endingSummary: z.string().max(4000).optional(),
});
export type ReunionSessionSave = z.infer<typeof ReunionSessionSave>;

/**
 * Project one player out of the shared state into the ordinary single-player
 * shape the Area engine already understands. The engine's whole ruleset then
 * applies unchanged — see `packages/engine/src/reunion.ts` for the merge back.
 */
export function projectPlayer(
  state: ReunionGameState,
  role: ReunionRole,
): AreaGameState {
  const player = role === "her" ? state.her : state.his;
  return {
    currentAreaId: state.currentAreaId,
    pos: { ...player.pos },
    facing: player.facing,
    flags: { ...state.flags },
    inventory: [...state.inventory],
    visitedAreaIds: [...state.visitedAreaIds],
    usedInteractions: [...state.usedInteractions],
    sheet: player.sheet,
    rng: state.rng,
    quests: [...state.quests],
    // The interface stopped lying the moment they were both in the room
    // (ADR-0015 is Path B only, and the Reunion is neither path).
    metaFx: [],
  };
}
