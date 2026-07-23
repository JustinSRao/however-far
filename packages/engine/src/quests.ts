import type { AreaGameState, AreaSpec, QuestDef, QuestEntry } from "@howeverfar/schema";

/**
 * Quest tracking (Phase 6). Pure bookkeeping over the log in game state:
 * the Director decides what a quest *means*, the engine only decides whether
 * it is started, how far along it is, and when it is done.
 */

export function findQuest(state: AreaGameState, questId: string): QuestEntry | undefined {
  return state.quests.find((q) => q.def.id === questId);
}

export function activeQuests(state: AreaGameState): QuestEntry[] {
  return state.quests.filter((q) => q.status === "active");
}

/** Objectives still outstanding on an active quest, in declaration order. */
export function openObjectives(entry: QuestEntry): QuestDef["objectives"] {
  return entry.def.objectives.filter(
    (o) => !entry.completedObjectiveIds.includes(o.id),
  );
}

/** The definition for `questId`, from the log first, then this area's offers. */
function defFor(
  state: AreaGameState,
  area: AreaSpec | undefined,
  questId: string,
): QuestDef | undefined {
  return findQuest(state, questId)?.def ?? area?.quests.find((q) => q.id === questId);
}

function replaceEntry(state: AreaGameState, entry: QuestEntry): AreaGameState {
  return {
    ...state,
    quests: state.quests.map((q) => (q.def.id === entry.def.id ? entry : q)),
  };
}

/**
 * Add a quest to the log. A quest already known is left exactly as it is —
 * re-offering a job you already took, finished, or failed must never reset it.
 */
export function startQuest(
  state: AreaGameState,
  area: AreaSpec | undefined,
  questId: string,
): AreaGameState {
  if (findQuest(state, questId)) return state;
  const def = defFor(state, area, questId);
  // An unknown quest id is a Director mistake, not a crash: integrity
  // validation reports it, and play continues without a phantom log entry.
  if (!def) return state;
  return {
    ...state,
    quests: [...state.quests, { def, status: "active", completedObjectiveIds: [] }],
  };
}

/**
 * Tick an objective. The quest auto-completes (and pays out) when the last one
 * lands, so the Director never has to remember to close a quest it finished.
 */
export function completeObjective(
  state: AreaGameState,
  area: AreaSpec | undefined,
  questId: string,
  objectiveId: string,
  applyReward: (state: AreaGameState, entry: QuestEntry) => AreaGameState,
): AreaGameState {
  const entry = findQuest(state, questId);
  if (!entry || entry.status !== "active") return state;
  if (!entry.def.objectives.some((o) => o.id === objectiveId)) return state;
  if (entry.completedObjectiveIds.includes(objectiveId)) return state;

  const completedObjectiveIds = [...entry.completedObjectiveIds, objectiveId];
  const allDone = completedObjectiveIds.length === entry.def.objectives.length;
  const next: QuestEntry = {
    ...entry,
    completedObjectiveIds,
    status: allDone ? "complete" : "active",
  };
  const advanced = replaceEntry(state, next);
  return allDone ? applyReward(advanced, next) : advanced;
}

/**
 * End a quest early. Status is written *before* the reward is applied, so a
 * reward that loops back to this quest terminates instead of recursing.
 */
export function resolveQuest(
  state: AreaGameState,
  questId: string,
  status: "complete" | "failed",
  applyReward: (state: AreaGameState, entry: QuestEntry) => AreaGameState,
): AreaGameState {
  const entry = findQuest(state, questId);
  if (!entry || entry.status !== "active") return state;
  const next: QuestEntry = { ...entry, status };
  const resolved = replaceEntry(state, next);
  return status === "complete" ? applyReward(resolved, next) : resolved;
}

/**
 * Active interface distortions (ADR-0015). Presentation-only: the client reads
 * these to decide what to render wrongly. Nothing here touches a real file,
 * and nothing here can make the game unplayable.
 */
export function metaFxOf<K extends string>(
  state: { metaFx: readonly { kind: string }[] },
  kind: K,
): Extract<{ kind: string }, { kind: K }>[] {
  return state.metaFx.filter((fx) => fx.kind === kind) as never;
}
