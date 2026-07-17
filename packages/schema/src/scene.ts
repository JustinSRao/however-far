import { z } from "zod";

/**
 * Scene DSL v0 — the contract between the AI Director and the engine.
 *
 * Evolution rules (see .claude/skills/scene-dsl and ADR-0001):
 * additive changes only within a dslVersion; breaking changes bump the version
 * and ship a migration. Every capability here must be renderable by the engine.
 */
export const DSL_VERSION = 0;

/** Model-authored identifiers are lowercase slugs: "innkeeper-vess". */
export const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

/** A request for art — never an image, never a raw image-model prompt. */
export const ArtRequest = z.object({
  kind: z.enum(["background", "sprite", "portrait", "item"]),
  subject: z.string().min(1).max(300),
  mood: z.string().min(1).max(120),
  sizeClass: z.enum(["small", "medium", "large"]),
});
export type ArtRequest = z.infer<typeof ArtRequest>;

/** Declarative state changes. The engine applies these; the Director never mutates state directly. */
export const Effect = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setFlag"), key: Slug, value: z.boolean() }),
  z.object({ op: z.literal("addItem"), item: Slug, name: z.string().min(1).max(80) }),
  z.object({ op: z.literal("removeItem"), item: Slug }),
]);
export type Effect = z.infer<typeof Effect>;

export const Entity = z.object({
  id: Slug,
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  role: z.enum(["character", "prop"]),
  art: ArtRequest.optional(),
});
export type Entity = z.infer<typeof Entity>;

export const DialogueLine = z.object({
  /** Must reference an entity id in this scene, or "narrator". */
  speakerId: z.union([Slug, z.literal("narrator")]),
  text: z.string().min(1).max(1000),
});
export type DialogueLine = z.infer<typeof DialogueLine>;

/**
 * Where an action leads. In a generated game most transitions are "generate",
 * carrying an authoring hint for the next Scene Writer call. "ending" closes
 * the playthrough; the Architect gates when it becomes legal.
 */
export const Transition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), hint: z.string().min(1).max(500) }),
  z.object({ type: z.literal("scene"), sceneId: Slug }),
  z.object({
    type: z.literal("ending"),
    tone: z.enum(["triumphant", "bittersweet", "tragic", "mysterious"]),
    hint: z.string().min(1).max(500),
  }),
]);
export type Transition = z.infer<typeof Transition>;

export const Choice = z.object({
  id: Slug,
  label: z.string().min(1).max(200),
  effects: z.array(Effect).max(10).default([]),
  transition: Transition,
});
export type Choice = z.infer<typeof Choice>;

export const SceneSpec = z.object({
  dslVersion: z.literal(DSL_VERSION),
  id: Slug,
  title: z.string().min(1).max(120),
  location: z.object({
    id: Slug,
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    art: ArtRequest.optional(),
  }),
  /** Scene-setting prose, streamed to the player as it generates. */
  narration: z.string().min(1).max(4000),
  entities: z.array(Entity).max(12).default([]),
  dialogue: z.array(DialogueLine).max(30).default([]),
  /** Applied by the engine when the scene is entered. */
  onEnterEffects: z.array(Effect).max(10).default([]),
  choices: z.array(Choice).min(1).max(6),
  /** Whether the player may also type a free-form action in this scene. */
  freeText: z
    .object({
      enabled: z.boolean(),
      placeholder: z.string().min(1).max(120).optional(),
    })
    .default({ enabled: true }),
});
export type SceneSpec = z.infer<typeof SceneSpec>;
