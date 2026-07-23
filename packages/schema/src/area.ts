import { z } from "zod";
import { ArtRequest, DialogueLine, EndingTone, Slug } from "./scene.js";
import {
  AreaEffect,
  Check,
  CharacterSheet,
  MetaFx,
  QuestDef,
  QuestEntry,
  RngState,
  STARTING_SHEET,
} from "./mechanics.js";

/**
 * Area DSL v1 — the contract for the top-down RPG (ADR-0009/0010).
 *
 * An AreaSpec describes one walkable map: a tile grid, placed entities with
 * interactions, and portals to other (usually not-yet-generated) areas. The
 * legacy v0 SceneSpec (scene.ts) remains valid for the text-era apps until
 * they are retired; new work targets AreaSpec. Evolution rules are unchanged:
 * additive-only within a version (scene-dsl skill, ADR-0001).
 */
export const AREA_DSL_VERSION = 1;

/** Hex color used as the placeholder render until the asset DB binds real art (Phase 5). */
export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/, "must be #rrggbb lowercase hex");

export const GridPos = z.object({
  x: z.number().int().min(0).max(63),
  y: z.number().int().min(0).max(63),
});
export type GridPos = z.infer<typeof GridPos>;

export const TileDef = z.object({
  id: Slug,
  name: z.string().min(1).max(60),
  walkable: z.boolean(),
  color: HexColor,
  /** Asset-catalog tag this tile binds to when real art exists (Phase 5). */
  artTag: z.string().min(1).max(60).optional(),
});
export type TileDef = z.infer<typeof TileDef>;

/**
 * Where leaving an area (or a conversation) leads. Most portals point at
 * unexplored space ("generate", with an authoring hint for the World Writer);
 * "area" returns to something already generated; "ending" closes the
 * playthrough at the path's threshold — the Architect gates when it is legal.
 */
export const AreaTransition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), hint: z.string().min(1).max(500) }),
  z.object({ type: z.literal("area"), areaId: Slug }),
  z.object({
    type: z.literal("ending"),
    tone: EndingTone,
    hint: z.string().min(1).max(500),
  }),
]);
export type AreaTransition = z.infer<typeof AreaTransition>;

/** A choice offered inside a conversation. Staying put is the default; a transition is optional. */
export const ConvoChoice = z.object({
  id: Slug,
  label: z.string().min(1).max(200),
  /** The speaker's response when this choice is picked. */
  reply: z.string().min(1).max(500).optional(),
  effects: z.array(AreaEffect).max(10).default([]),
  /**
   * Makes this choice a gamble (Phase 6). The engine resolves it, spends the
   * cost, and applies the winning branch's effects; `reply` still shows first,
   * so the fiction reads "you try" then "here is what happened".
   */
  check: Check.optional(),
  transition: AreaTransition.optional(),
});
export type ConvoChoice = z.infer<typeof ConvoChoice>;

/**
 * What happens when the player interacts with an entity. One interaction per
 * entity in v1 (the verb labels the prompt: "Talk", "Examine", ...); richer
 * per-verb tables can be added additively later if play demands them.
 */
export const Interaction = z.object({
  verb: z.enum(["talk", "examine", "use", "take"]),
  lines: z.array(DialogueLine).max(30).default([]),
  choices: z.array(ConvoChoice).max(4).default([]),
  /** Applied by the engine when the interaction first runs. */
  effects: z.array(AreaEffect).max(10).default([]),
  /** If true, lines/choices/effects fire once; afterwards `afterText` shows. */
  once: z.boolean().default(false),
  afterText: z.string().min(1).max(300).optional(),
});
export type Interaction = z.infer<typeof Interaction>;

export const PlacedEntity = z.object({
  id: Slug,
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  role: z.enum(["character", "prop", "item"]),
  pos: GridPos,
  color: HexColor.optional(),
  art: ArtRequest.optional(),
  interaction: Interaction.optional(),
  /**
   * For newly introduced characters: the kanji + trait link behind the name
   * (ADR-0014), extracted into canon at first appearance.
   */
  nameMeaning: z.string().min(1).max(300).optional(),
});
export type PlacedEntity = z.infer<typeof PlacedEntity>;

export const Portal = z.object({
  id: Slug,
  pos: GridPos,
  /** Shown when the player stands on the portal: "the road to school". */
  label: z.string().min(1).max(120),
  transition: AreaTransition,
});
export type Portal = z.infer<typeof Portal>;

export const StoryPath = z.enum(["shared", "her", "his"]);
export type StoryPath = z.infer<typeof StoryPath>;

export const AreaSpec = z.object({
  dslVersion: z.literal(AREA_DSL_VERSION),
  id: Slug,
  name: z.string().min(1).max(120),
  /** Establishing prose, shown/streamed on first entry. */
  description: z.string().min(1).max(2000),
  /** Which side of the story this area belongs to (STORY.md). */
  path: StoryPath,
  width: z.number().int().min(4).max(64),
  height: z.number().int().min(4).max(64),
  tiles: z.array(TileDef).min(1).max(32),
  /** Row-major: ground[y][x] is an index into `tiles`. Dimensions must match width/height. */
  ground: z.array(z.array(z.number().int().min(0)).min(4).max(64)).min(4).max(64),
  playerSpawn: GridPos,
  entities: z.array(PlacedEntity).max(24).default([]),
  portals: z.array(Portal).min(1).max(8),
  onEnterEffects: z.array(AreaEffect).max(10).default([]),
  /**
   * Quests this area introduces. Declaring one does not start it — a
   * `questStart` effect does, which is what lets an area offer a job the
   * player can decline.
   */
  quests: z.array(QuestDef).max(4).default([]),
});
export type AreaSpec = z.infer<typeof AreaSpec>;

/** The engine-owned mechanical state for the RPG. Only Effects (via the engine) mutate it. */
export const AreaGameState = z.object({
  currentAreaId: Slug,
  pos: GridPos,
  facing: z.enum(["up", "down", "left", "right"]),
  flags: z.record(Slug, z.boolean()),
  inventory: z.array(z.object({ item: Slug, name: z.string() })),
  visitedAreaIds: z.array(Slug),
  /** `${areaId}/${entityId}` for interactions with once=true that have fired. */
  usedInteractions: z.array(z.string()),
  /**
   * Phase 6 mechanics. Defaulted rather than required so world-sessions saved
   * before mechanics existed still load and simply start from the base sheet.
   */
  sheet: CharacterSheet.default(STARTING_SHEET),
  rng: RngState.default({ seed: 1, counter: 0 }),
  quests: z.array(QuestEntry).max(32).default([]),
  /** Active interface distortions (Path B only, ADR-0015). */
  metaFx: z.array(MetaFx).max(16).default([]),
});
export type AreaGameState = z.infer<typeof AreaGameState>;

/** What the player did in an area — the engine's input and the Director's raw signal. */
export const AreaAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("interact"), entityId: Slug }),
  z.object({ type: z.literal("convoChoice"), entityId: Slug, choiceId: Slug }),
  z.object({ type: z.literal("portal"), portalId: Slug }),
  z.object({ type: z.literal("freeText"), text: z.string().min(1).max(500) }),
  /**
   * The player is walking toward this portal. Not a state change — a hint that
   * lets the Director start writing what is beyond it before they arrive
   * (Phase 6 latency). Safe to ignore, safe to send more than once.
   */
  z.object({ type: z.literal("approach"), portalId: Slug }),
]);
export type AreaAction = z.infer<typeof AreaAction>;
