import type {
  AreaAction,
  AreaEffect,
  AreaGameState,
  AreaSpec,
  AreaTransition,
  ConvoChoice,
  DialogueLine,
  GridPos,
  PlacedEntity,
} from "@howeverfar/schema";
import { STARTING_SHEET } from "@howeverfar/schema";
import { EngineError } from "./index.js";
import {
  applySheetEffects,
  canAttemptCheck,
  isSheetEffect,
  resolveCheckOn,
  type CheckResult,
} from "./mechanics.js";

/**
 * Area engine (DSL v1) — pure rules for the top-down RPG (ADR-0009/0010).
 * The Phaser client renders and captures input; every decision about what a
 * player action *does* is made here, deterministically, with no AI or network.
 */

export type Direction = "up" | "down" | "left" | "right";

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function applyOneEffect(state: AreaGameState, effect: AreaEffect): AreaGameState {
  switch (effect.op) {
    case "setFlag":
      return { ...state, flags: { ...state.flags, [effect.key]: effect.value } };
    case "addItem":
      if (state.inventory.some((i) => i.item === effect.item)) return state;
      return {
        ...state,
        inventory: [...state.inventory, { item: effect.item, name: effect.name }],
      };
    case "removeItem":
      return {
        ...state,
        inventory: state.inventory.filter((i) => i.item !== effect.item),
      };
    default:
      // Mechanical ops (Phase 6) live on the character sheet.
      return { ...state, sheet: applySheetEffects(state.sheet, [effect]) };
  }
}

export function applyAreaEffects(
  state: AreaGameState,
  effects: readonly AreaEffect[],
): AreaGameState {
  return effects.reduce(applyOneEffect, state);
}

function inBounds(area: AreaSpec, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < area.width && y < area.height;
}

function tileAt(area: AreaSpec, x: number, y: number) {
  const index = area.ground[y]?.[x];
  if (index === undefined) return undefined;
  return area.tiles[index];
}

/** Characters and props block movement; items do not (you walk onto them). */
function blockingEntityAt(area: AreaSpec, x: number, y: number): PlacedEntity | undefined {
  return area.entities.find(
    (e) => e.pos.x === x && e.pos.y === y && e.role !== "item",
  );
}

export function isWalkable(area: AreaSpec, x: number, y: number): boolean {
  if (!inBounds(area, x, y)) return false;
  const tile = tileAt(area, x, y);
  if (!tile || !tile.walkable) return false;
  return blockingEntityAt(area, x, y) === undefined;
}

/** Enter an area: position at spawn, record the visit, apply on-enter effects. */
export function enterArea(state: AreaGameState, area: AreaSpec): AreaGameState {
  const visited = state.visitedAreaIds.includes(area.id)
    ? state.visitedAreaIds
    : [...state.visitedAreaIds, area.id];
  return applyAreaEffects(
    {
      ...state,
      currentAreaId: area.id,
      pos: { ...area.playerSpawn },
      visitedAreaIds: visited,
    },
    area.onEnterEffects,
  );
}

/**
 * State for a brand-new playthrough entering its first area. `seed` fixes every
 * check this playthrough will ever roll, so a session replays identically from
 * its action log; callers that want variety per session pass a fresh one.
 */
export function initialAreaState(firstArea: AreaSpec, seed = 1): AreaGameState {
  return enterArea(
    {
      currentAreaId: firstArea.id,
      pos: { ...firstArea.playerSpawn },
      facing: "down",
      flags: {},
      inventory: [],
      visitedAreaIds: [],
      usedInteractions: [],
      sheet: STARTING_SHEET,
      rng: { seed, counter: 0 },
    },
    firstArea,
  );
}

/**
 * Attempt a one-tile move. Facing always updates; position only if the target
 * tile is walkable and unblocked. Never throws — an illegal move is a no-op.
 */
export function tryMove(
  state: AreaGameState,
  area: AreaSpec,
  dir: Direction,
): AreaGameState {
  assertInArea(state, area);
  const { dx, dy } = DELTA[dir];
  const x = state.pos.x + dx;
  const y = state.pos.y + dy;
  const faced = state.facing === dir ? state : { ...state, facing: dir };
  if (!isWalkable(area, x, y)) return faced;
  return { ...faced, pos: { x, y } };
}

function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Entities the player can interact with right now (same tile or 4-adjacent). */
export function reachableEntities(
  state: AreaGameState,
  area: AreaSpec,
): PlacedEntity[] {
  return area.entities.filter(
    (e) => e.interaction !== undefined && manhattan(e.pos, state.pos) <= 1,
  );
}

/** The portal under the player's feet, if any. */
export function portalUnderPlayer(state: AreaGameState, area: AreaSpec) {
  return area.portals.find(
    (p) => p.pos.x === state.pos.x && p.pos.y === state.pos.y,
  );
}

export type InteractionOutcome =
  | {
      kind: "dialogue";
      state: AreaGameState;
      verb: "talk" | "examine" | "use" | "take";
      lines: DialogueLine[];
      choices: ConvoChoice[];
    }
  | { kind: "afterText"; state: AreaGameState; text: string };

function usageKey(area: AreaSpec, entityId: string): string {
  return `${area.id}/${entityId}`;
}

/** True if a once-only interaction has already fired (e.g. an item was taken). */
export function interactionUsed(
  state: AreaGameState,
  area: AreaSpec,
  entityId: string,
): boolean {
  return state.usedInteractions.includes(usageKey(area, entityId));
}

/**
 * Run an entity's interaction. Requires reachability. First run applies the
 * interaction's effects and (if `once`) marks it used; repeat runs of a
 * once-interaction return `afterText` instead.
 */
export function runInteraction(
  state: AreaGameState,
  area: AreaSpec,
  entityId: string,
): InteractionOutcome {
  assertInArea(state, area);
  const entity = area.entities.find((e) => e.id === entityId);
  if (!entity) throw new EngineError(`area "${area.id}" has no entity "${entityId}"`);
  const interaction = entity.interaction;
  if (!interaction) throw new EngineError(`entity "${entityId}" has no interaction`);
  if (manhattan(entity.pos, state.pos) > 1) {
    throw new EngineError(`entity "${entityId}" is out of reach`);
  }
  if (interaction.once && interactionUsed(state, area, entityId)) {
    return {
      kind: "afterText",
      state,
      text: interaction.afterText ?? entity.description,
    };
  }
  let next = applyAreaEffects(state, interaction.effects);
  if (interaction.once) {
    next = {
      ...next,
      usedInteractions: [...next.usedInteractions, usageKey(area, entityId)],
    };
  }
  return {
    kind: "dialogue",
    state: next,
    verb: interaction.verb,
    lines: interaction.lines,
    choices: interaction.choices,
  };
}

export interface ConvoChoiceOutcome {
  state: AreaGameState;
  reply?: string;
  transition?: AreaTransition;
  /** Present when the choice carried a check (Phase 6). */
  check?: CheckResult;
}

/** Choices the player cannot currently afford — the UI should show them locked. */
export function choiceAffordable(state: AreaGameState, choice: ConvoChoice): boolean {
  return choice.check === undefined || canAttemptCheck(state.sheet, choice.check);
}

/**
 * Apply a conversation choice: its own effects, then — if it is a gamble — the
 * check, whose cost is spent either way and whose winning branch supplies more
 * effects. Reply and transition surface for the caller to present.
 */
export function applyConvoChoice(
  state: AreaGameState,
  area: AreaSpec,
  entityId: string,
  choiceId: string,
): ConvoChoiceOutcome {
  assertInArea(state, area);
  const entity = area.entities.find((e) => e.id === entityId);
  if (!entity?.interaction) {
    throw new EngineError(`area "${area.id}" has no interactive entity "${entityId}"`);
  }
  const choice = entity.interaction.choices.find((c) => c.id === choiceId);
  if (!choice) {
    throw new EngineError(`entity "${entityId}" has no choice "${choiceId}"`);
  }
  let next = applyAreaEffects(state, choice.effects);

  let checkResult: CheckResult | undefined;
  if (choice.check) {
    if (!canAttemptCheck(next.sheet, choice.check)) {
      throw new EngineError(
        `choice "${choiceId}" needs ${choice.check.cost?.amount} ${choice.check.cost?.resource} and the player cannot pay it`,
      );
    }
    const resolved = resolveCheckOn(next, choice.check);
    checkResult = resolved.result;
    // The sheet half is already folded in; flags/inventory still need applying.
    next = applyAreaEffects(
      resolved.state,
      resolved.result.effects.filter((e) => !isSheetEffect(e)),
    );
  }

  const outcome: ConvoChoiceOutcome = { state: next };
  if (choice.reply !== undefined) outcome.reply = choice.reply;
  if (choice.transition !== undefined) outcome.transition = choice.transition;
  if (checkResult !== undefined) outcome.check = checkResult;
  return outcome;
}

export interface PortalOutcome {
  state: AreaGameState;
  transition: AreaTransition;
}

/** Take the portal the player is standing on. */
export function takePortal(
  state: AreaGameState,
  area: AreaSpec,
  portalId: string,
): PortalOutcome {
  assertInArea(state, area);
  const portal = area.portals.find((p) => p.id === portalId);
  if (!portal) throw new EngineError(`area "${area.id}" has no portal "${portalId}"`);
  if (portal.pos.x !== state.pos.x || portal.pos.y !== state.pos.y) {
    throw new EngineError(`player is not standing on portal "${portalId}"`);
  }
  return { state, transition: portal.transition };
}

export type AreaActionOutcome =
  | { kind: "interaction"; outcome: InteractionOutcome }
  | { kind: "convo"; outcome: ConvoChoiceOutcome }
  | { kind: "portal"; outcome: PortalOutcome }
  | { kind: "freeText"; state: AreaGameState; text: string };

/** Uniform entry point mirroring the v0 engine's applyAction. */
export function applyAreaAction(
  state: AreaGameState,
  area: AreaSpec,
  action: AreaAction,
): AreaActionOutcome {
  switch (action.type) {
    case "interact":
      return { kind: "interaction", outcome: runInteraction(state, area, action.entityId) };
    case "convoChoice":
      return {
        kind: "convo",
        outcome: applyConvoChoice(state, area, action.entityId, action.choiceId),
      };
    case "portal":
      return { kind: "portal", outcome: takePortal(state, area, action.portalId) };
    case "freeText":
      return { kind: "freeText", state, text: action.text };
  }
}

function assertInArea(state: AreaGameState, area: AreaSpec): void {
  if (state.currentAreaId !== area.id) {
    throw new EngineError(
      `state is in area "${state.currentAreaId}" but action targets area "${area.id}"`,
    );
  }
}

/**
 * Structural validity beyond the schema: grid dimensions, index ranges,
 * positions, reachability-critical placement, and referential integrity.
 * Run on every Director-produced area before acceptance.
 */
export function validateAreaIntegrity(area: AreaSpec): string[] {
  const problems: string[] = [];

  if (area.ground.length !== area.height) {
    problems.push(`ground has ${area.ground.length} rows, expected height ${area.height}`);
  }
  area.ground.forEach((row, y) => {
    if (row.length !== area.width) {
      problems.push(`ground row ${y} has ${row.length} columns, expected width ${area.width}`);
    }
    row.forEach((index, x) => {
      if (index >= area.tiles.length) {
        problems.push(`ground[${y}][${x}] = ${index} exceeds tile count ${area.tiles.length}`);
      }
    });
  });

  const tileIds = new Set<string>();
  for (const tile of area.tiles) {
    if (tileIds.has(tile.id)) problems.push(`duplicate tile id "${tile.id}"`);
    tileIds.add(tile.id);
  }

  if (!isWalkable(area, area.playerSpawn.x, area.playerSpawn.y)) {
    problems.push(
      `playerSpawn (${area.playerSpawn.x}, ${area.playerSpawn.y}) is not walkable`,
    );
  }

  const entityIds = new Set<string>();
  for (const entity of area.entities) {
    if (entityIds.has(entity.id)) problems.push(`duplicate entity id "${entity.id}"`);
    entityIds.add(entity.id);
    if (!inBounds(area, entity.pos.x, entity.pos.y)) {
      problems.push(`entity "${entity.id}" is out of bounds`);
    }
  }
  for (const entity of area.entities) {
    const sharing = area.entities.filter(
      (other) =>
        other.pos.x === entity.pos.x &&
        other.pos.y === entity.pos.y &&
        other.role !== "item" &&
        entity.role !== "item",
    );
    if (sharing.length > 1 && sharing[0] === entity) {
      problems.push(
        `entities ${sharing.map((e) => `"${e.id}"`).join(", ")} share tile (${entity.pos.x}, ${entity.pos.y})`,
      );
    }
  }

  for (const entity of area.entities) {
    const interaction = entity.interaction;
    if (!interaction) continue;
    for (const line of interaction.lines) {
      if (line.speakerId !== "narrator" && !entityIds.has(line.speakerId)) {
        problems.push(
          `entity "${entity.id}" dialogue speaker "${line.speakerId}" is not an entity in this area`,
        );
      }
    }
    const choiceIds = new Set<string>();
    for (const choice of interaction.choices) {
      if (choiceIds.has(choice.id)) {
        problems.push(`entity "${entity.id}" has duplicate choice id "${choice.id}"`);
      }
      choiceIds.add(choice.id);
    }
  }

  const portalIds = new Set<string>();
  for (const portal of area.portals) {
    if (portalIds.has(portal.id)) problems.push(`duplicate portal id "${portal.id}"`);
    portalIds.add(portal.id);
    if (!isWalkable(area, portal.pos.x, portal.pos.y)) {
      problems.push(
        `portal "${portal.id}" at (${portal.pos.x}, ${portal.pos.y}) is not on a walkable tile`,
      );
    }
  }

  return problems;
}
