import { z } from "zod";
import { Slug } from "./scene.js";

/**
 * The mechanical game state owned by the engine. The Director receives a
 * summary of this; it never mutates it — only Effects do (via the engine).
 */
export const GameState = z.object({
  currentSceneId: Slug,
  flags: z.record(Slug, z.boolean()),
  inventory: z.array(z.object({ item: Slug, name: z.string() })),
  visitedSceneIds: z.array(Slug),
});
export type GameState = z.infer<typeof GameState>;

/** What the player did — the engine's input, and the Director's raw signal. */
export const PlayerAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), choiceId: Slug }),
  z.object({ type: z.literal("freeText"), text: z.string().min(1).max(500) }),
]);
export type PlayerAction = z.infer<typeof PlayerAction>;
