/**
 * Single import surface for the monorepo packages, so the Phaser code reads
 * as presentation over a clean API (ADR-0010: rules live in the engine).
 */
export {
  applyConvoChoice,
  choiceAffordable,
  enterArea,
  initialAreaState,
  interactionUsed,
  portalUnderPlayer,
  reachableEntities,
  runInteraction,
  tryMove,
  type CheckResult,
  type Direction,
  type InteractionOutcome,
} from "@howeverfar/engine";
export {
  getPrologueArea,
  getPrologueAreas,
  PROLOGUE_ENTRY_ID,
} from "@howeverfar/content";
