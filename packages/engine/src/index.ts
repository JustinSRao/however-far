import type {
  Effect,
  GameState,
  PlayerAction,
  SceneSpec,
  Transition,
} from "@howeverfar/schema";

/**
 * The engine is deterministic and dumb on purpose (ADR-0001, ADR-0002):
 * pure functions over validated data, zero AI/network dependencies.
 * All intelligence lives in the Director; all reliability lives here.
 */

export * from "./area.js";
export * from "./mechanics.js";
export * from "./quests.js";

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

/** Create the state for a brand-new playthrough entering its first scene. */
export function initialState(firstScene: SceneSpec): GameState {
  return enterScene(
    {
      currentSceneId: firstScene.id,
      flags: {},
      inventory: [],
      visitedSceneIds: [],
    },
    firstScene,
  );
}

export function applyEffect(state: GameState, effect: Effect): GameState {
  switch (effect.op) {
    case "setFlag":
      return { ...state, flags: { ...state.flags, [effect.key]: effect.value } };
    case "addItem": {
      if (state.inventory.some((i) => i.item === effect.item)) return state;
      return {
        ...state,
        inventory: [...state.inventory, { item: effect.item, name: effect.name }],
      };
    }
    case "removeItem":
      return {
        ...state,
        inventory: state.inventory.filter((i) => i.item !== effect.item),
      };
  }
}

export function applyEffects(state: GameState, effects: readonly Effect[]): GameState {
  return effects.reduce(applyEffect, state);
}

/** Enter a scene: record it, apply its on-enter effects. */
export function enterScene(state: GameState, scene: SceneSpec): GameState {
  const visited = state.visitedSceneIds.includes(scene.id)
    ? state.visitedSceneIds
    : [...state.visitedSceneIds, scene.id];
  return applyEffects(
    { ...state, currentSceneId: scene.id, visitedSceneIds: visited },
    scene.onEnterEffects,
  );
}

export type ActionOutcome =
  | { kind: "transition"; state: GameState; transition: Transition }
  | { kind: "freeText"; state: GameState; text: string };

/**
 * Apply a player action to the current scene.
 * - A choice applies its effects and yields its transition (the Director or
 *   the scene store resolves where it leads).
 * - Free text changes no state; the Director must author the response.
 */
export function applyAction(
  state: GameState,
  scene: SceneSpec,
  action: PlayerAction,
): ActionOutcome {
  if (scene.id !== state.currentSceneId) {
    throw new EngineError(
      `state is in scene "${state.currentSceneId}" but action targets scene "${scene.id}"`,
    );
  }
  switch (action.type) {
    case "choice": {
      const choice = scene.choices.find((c) => c.id === action.choiceId);
      if (!choice) {
        throw new EngineError(
          `scene "${scene.id}" has no choice "${action.choiceId}"`,
        );
      }
      return {
        kind: "transition",
        state: applyEffects(state, choice.effects),
        transition: choice.transition,
      };
    }
    case "freeText": {
      if (!scene.freeText.enabled) {
        throw new EngineError(`scene "${scene.id}" does not accept free text`);
      }
      return { kind: "freeText", state, text: action.text };
    }
  }
}

/**
 * Structural validity checks beyond the schema: every id referenced inside the
 * scene must resolve. Run on every Director-produced scene before acceptance.
 */
export function validateSceneIntegrity(scene: SceneSpec): string[] {
  const problems: string[] = [];
  const entityIds = new Set(scene.entities.map((e) => e.id));

  for (const line of scene.dialogue) {
    if (line.speakerId !== "narrator" && !entityIds.has(line.speakerId)) {
      problems.push(
        `dialogue speaker "${line.speakerId}" is not an entity in this scene`,
      );
    }
  }
  const choiceIds = new Set<string>();
  for (const choice of scene.choices) {
    if (choiceIds.has(choice.id)) {
      problems.push(`duplicate choice id "${choice.id}"`);
    }
    choiceIds.add(choice.id);
  }
  const dupEntity = scene.entities.length !== entityIds.size;
  if (dupEntity) problems.push("duplicate entity ids");
  return problems;
}
