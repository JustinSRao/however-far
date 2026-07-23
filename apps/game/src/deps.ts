/**
 * Single import surface for the monorepo packages, so the Phaser code reads
 * as presentation over a clean API (ADR-0010: rules live in the engine).
 */
export {
  applyConvoChoice,
  areaWithPartner,
  choiceAffordable,
  enterArea,
  initialAreaState,
  interactionUsed,
  portalUnderPlayer,
  reachableEntities,
  reunionMove,
  runInteraction,
  tryMove,
  type CheckResult,
  type Direction,
  type InteractionOutcome,
} from "@howeverfar/engine";
export { projectPlayer } from "@howeverfar/schema";
export {
  getPrologueArea,
  getPrologueAreas,
  interstitialFor,
  interstitialStart,
  PROLOGUE_ENTRY_ID,
  type Interstitial,
} from "@howeverfar/content";
