import type {
  AreaEffect,
  AreaGameState,
  AttributeId,
  Check,
  CharacterSheet,
  RngState,
} from "@howeverfar/schema";

/**
 * Mechanics rules (Phase 6): character sheet mutation and check resolution.
 * Pure and deterministic like the rest of the engine — the only randomness is
 * derived from the session seed, so a playthrough replays identically from its
 * action log (invariant 2).
 */

/** Faces on the check die. Small on purpose: attributes should matter more than luck. */
export const CHECK_DIE = 6;

/**
 * Roll for `counter` under `seed`, in [1, CHECK_DIE].
 *
 * A finalizing integer hash (murmur3's), not a sequential PRNG: every counter
 * is independent, so resolving check #7 never depends on whether checks #1–6
 * happened. That keeps replay stable even when the Director's retries change
 * how many checks were *offered*.
 */
export function rollFor(seed: number, counter: number): number {
  let n = (seed ^ Math.imul(counter + 1, 0x9e3779b9)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return (n % CHECK_DIE) + 1;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Apply one mechanical effect to a sheet. Unknown-to-mechanics ops pass through. */
function applySheetEffect(sheet: CharacterSheet, effect: AreaEffect): CharacterSheet {
  switch (effect.op) {
    case "adjustResource": {
      const pool = sheet.resources[effect.resource];
      return {
        ...sheet,
        resources: {
          ...sheet.resources,
          [effect.resource]: {
            ...pool,
            current: clamp(pool.current + effect.delta, 0, pool.max),
          },
        },
      };
    }
    case "adjustResourceMax": {
      const pool = sheet.resources[effect.resource];
      const max = clamp(pool.max + effect.delta, 1, 999);
      return {
        ...sheet,
        resources: {
          ...sheet.resources,
          // Raising the ceiling does not fill the pool; lowering it never
          // leaves current above max.
          [effect.resource]: { max, current: Math.min(pool.current, max) },
        },
      };
    }
    case "adjustAttribute":
      return {
        ...sheet,
        attributes: {
          ...sheet.attributes,
          [effect.attribute]: clamp(
            sheet.attributes[effect.attribute] + effect.delta,
            0,
            10,
          ),
        },
      };
    case "adjustStanding": {
      const existing = sheet.standings[effect.standing];
      return {
        ...sheet,
        standings: {
          ...sheet.standings,
          [effect.standing]: {
            // First mention names it; later mentions keep the original label
            // so a renamed faction cannot quietly fork into two standings.
            label: existing?.label ?? effect.label,
            value: clamp((existing?.value ?? 0) + effect.delta, -3, 3),
          },
        },
      };
    }
    default:
      return sheet;
  }
}

/** True when this op touches the character sheet rather than flags/inventory. */
export function isSheetEffect(effect: AreaEffect): boolean {
  return (
    effect.op === "adjustResource" ||
    effect.op === "adjustResourceMax" ||
    effect.op === "adjustAttribute" ||
    effect.op === "adjustStanding"
  );
}

export function applySheetEffects(
  sheet: CharacterSheet,
  effects: readonly AreaEffect[],
): CharacterSheet {
  return effects.reduce(applySheetEffect, sheet);
}

export function attributeValue(sheet: CharacterSheet, attribute: AttributeId): number {
  return sheet.attributes[attribute];
}

/** Whether the player can currently pay a check's cost. */
export function canAttemptCheck(sheet: CharacterSheet, check: Check): boolean {
  if (!check.cost) return true;
  return sheet.resources[check.cost.resource].current >= check.cost.amount;
}

export interface CheckResult {
  success: boolean;
  /** The face rolled, for UI that wants to show the dice. */
  roll: number;
  attribute: AttributeId;
  attributeValue: number;
  difficulty: number;
  /** roll + attribute, the number compared against difficulty. */
  total: number;
  text: string;
  effects: readonly AreaEffect[];
}

/**
 * Resolve a check against the state's RNG, without applying anything: the
 * caller decides how the resulting effects reach the state. Advancing the
 * counter is the caller's job too (see `resolveCheckOn`).
 */
export function resolveCheck(rng: RngState, sheet: CharacterSheet, check: Check): CheckResult {
  const roll = rollFor(rng.seed, rng.counter);
  const value = attributeValue(sheet, check.attribute);
  const total = roll + value;
  const success = total >= check.difficulty;
  const branch = success ? check.success : check.failure;
  return {
    success,
    roll,
    attribute: check.attribute,
    attributeValue: value,
    difficulty: check.difficulty,
    total,
    text: branch.text,
    effects: branch.effects,
  };
}

export interface CheckResolution {
  state: AreaGameState;
  result: CheckResult;
}

/**
 * Resolve a check and fold everything into the state: spend the cost (whether
 * or not it lands — a failed attempt still costs), advance the RNG counter,
 * and apply the winning branch's sheet effects.
 *
 * Non-sheet effects (flags, inventory) are returned in `result.effects` for
 * the area engine to apply, so this module stays free of area concerns.
 */
export function resolveCheckOn(state: AreaGameState, check: Check): CheckResolution {
  const result = resolveCheck(state.rng, state.sheet, check);
  let sheet = state.sheet;
  if (check.cost) {
    sheet = applySheetEffects(sheet, [
      { op: "adjustResource", resource: check.cost.resource, delta: -check.cost.amount },
    ]);
  }
  sheet = applySheetEffects(sheet, result.effects);
  return {
    state: { ...state, sheet, rng: { ...state.rng, counter: state.rng.counter + 1 } },
    result,
  };
}
