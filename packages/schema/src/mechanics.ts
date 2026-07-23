import { z } from "zod";
import { Effect, Slug } from "./scene.js";

/**
 * Shared mechanics for the Area DSL (Phase 6).
 *
 * **One ruleset, emphasized per path** — the answer to ROADMAP's open question.
 * Her path leans exploration/magic/combat, his leans investigation/evidence/
 * relationships, but underneath they are the same contest: spend a resource,
 * test an attribute against a difficulty, change the world either way. Two
 * divergent rule modules would double the engine's surface and make the
 * Reunion (Phase 7) — which merges one playthrough of each path into a single
 * finale — a reconciliation problem instead of a merge.
 *
 * What differs per path is *vocabulary and emphasis*, chosen by the Director:
 * the same `might` check is a sword swing for Suzune and the nerve to knock on
 * a stranger's door for Itsuki; the same `focus` pool is her mana and his
 * clarity. The engine never knows which path it is running.
 */

/** The three axes every contest tests. Fixed at development time (closed-world, ADR-0001). */
export const ATTRIBUTE_IDS = ["might", "wits", "heart"] as const;
export const AttributeId = z.enum(ATTRIBUTE_IDS);
export type AttributeId = z.infer<typeof AttributeId>;

/**
 * Spendable pools.
 * - `vigor` — her body and stamina; his emotional stamina, how much more of
 *   this he can take today.
 * - `focus` — her mana; his clarity, spent to push a lead past the easy answer.
 */
export const RESOURCE_IDS = ["vigor", "focus"] as const;
export const ResourceId = z.enum(RESOURCE_IDS);
export type ResourceId = z.infer<typeof ResourceId>;

export const ResourcePool = z.object({
  current: z.number().int().min(0).max(999),
  max: z.number().int().min(1).max(999),
});
export type ResourcePool = z.infer<typeof ResourcePool>;

/**
 * Standing with a faction (her path) or a person (his path) — the same
 * bookkeeping either way. Ids are model-authored; the label is what a human
 * reads ("The Ashen Court", "Mother").
 */
export const Standing = z.object({
  label: z.string().min(1).max(80),
  value: z.number().int().min(-3).max(3),
});
export type Standing = z.infer<typeof Standing>;

export const CharacterSheet = z.object({
  attributes: z.object({
    might: z.number().int().min(0).max(10),
    wits: z.number().int().min(0).max(10),
    heart: z.number().int().min(0).max(10),
  }),
  resources: z.object({ vigor: ResourcePool, focus: ResourcePool }),
  standings: z.record(Slug, Standing),
});
export type CharacterSheet = z.infer<typeof CharacterSheet>;

/**
 * Where both protagonists start: ordinary, with `heart` already their strongest
 * axis. That is not a balance choice — the story's spine is a bond (STORY.md),
 * her dormant power is bound up in it, and his whole path is refusing to let go
 * of a person. Growth comes from play.
 */
export const STARTING_SHEET: CharacterSheet = {
  attributes: { might: 1, wits: 1, heart: 2 },
  resources: { vigor: { current: 6, max: 6 }, focus: { current: 4, max: 4 } },
  standings: {},
};

/**
 * Mechanical effect ops, added to the v0 `Effect` set for the Area DSL only.
 * The legacy text-era engine keeps the smaller union it already exhaustively
 * handles; `AreaEffect` is a superset, so every existing AreaSpec still parses.
 */
export const AreaEffect = z.discriminatedUnion("op", [
  ...Effect.options,
  z.object({
    op: z.literal("adjustResource"),
    resource: ResourceId,
    /** Clamped to [0, max] by the engine; healing past max is not an error. */
    delta: z.number().int().min(-999).max(999),
  }),
  z.object({
    op: z.literal("adjustAttribute"),
    attribute: AttributeId,
    /** Growth is meant to be rare and earned — one point is a big deal. */
    delta: z.number().int().min(-3).max(3),
  }),
  z.object({
    op: z.literal("adjustStanding"),
    standing: Slug,
    /** Human-readable name, used when this standing is first created. */
    label: z.string().min(1).max(80),
    delta: z.number().int().min(-6).max(6),
  }),
  z.object({
    op: z.literal("adjustResourceMax"),
    resource: ResourceId,
    delta: z.number().int().min(-99).max(99),
  }),
]);
export type AreaEffect = z.infer<typeof AreaEffect>;

/** One side of a check's outcome. */
export const CheckOutcome = z.object({
  text: z.string().min(1).max(500),
  effects: z.array(AreaEffect).max(10).default([]),
});
export type CheckOutcome = z.infer<typeof CheckOutcome>;

/**
 * The contest primitive. A d6 plus the tested attribute against `difficulty`;
 * `cost` is spent whether or not it lands, so a failed attempt still hurts.
 *
 * Everything mechanical in the game is built from this: a sword swing, a spell,
 * talking a guard down, holding your nerve while a teacher tells you the girl
 * you remember never enrolled. There is deliberately no separate combat system
 * — a fight is a run of checks, which keeps the engine small and lets the
 * Director spend its intelligence on fiction instead of rules.
 */
export const Check = z.object({
  attribute: AttributeId,
  /** 1 trivial · 4 ordinary · 7 hard · 10 near-impossible. */
  difficulty: z.number().int().min(1).max(10),
  cost: z
    .object({ resource: ResourceId, amount: z.number().int().min(0).max(20) })
    .optional(),
  success: CheckOutcome,
  failure: CheckOutcome,
});
export type Check = z.infer<typeof Check>;

/**
 * Deterministic roll state (engine invariant 2: no `Math.random()` without an
 * injected seed). The seed is fixed per session, the counter advances on every
 * resolved check, so a playthrough replays identically from its action log.
 */
export const RngState = z.object({
  seed: z.number().int().min(0).max(4294967295),
  counter: z.number().int().min(0),
});
export type RngState = z.infer<typeof RngState>;
