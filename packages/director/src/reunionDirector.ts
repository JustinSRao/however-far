import type {
  AreaAction,
  AreaSpec,
  AreaTransition,
  CallerIdentity,
  CanonFact,
  PlaythroughExport,
  ReunionEnding,
  ReunionGameState,
  ReunionRole,
  ReunionSessionSave,
} from "@howeverfar/schema";
import {
  applyReunionAction,
  enterReunionArea,
  initialReunionState,
} from "@howeverfar/engine";
import { REUNION_SEED_CANON } from "@howeverfar/content";
import { CanonLedger } from "./canonLedger.js";
import { costCounter } from "./costs.js";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import { advanceArc, isFinalAct } from "./stages.js";
import { extractAreaFacts } from "./worldWriter.js";
import {
  createReunionArc,
  mergeCanon,
  mergeCharacters,
  ReunionFailedError,
  writeReunionArea,
  writeReunionFinale,
} from "./reunion.js";
import type { TurnEvents } from "./worldDirector.js";

/**
 * The ReunionDirector (Phase 7) — one shared world, two players, and the only
 * ending in the game that closes.
 *
 * It is the WorldDirector's twin with three differences that matter: there is
 * no prologue and no path choice (both are already spent), every action
 * carries whose it is, and the finale is allowed to resolve.
 *
 * Turns are serialized by the caller — the server awaits each one before
 * starting the next — which is what keeps the shared dice counter meaningful
 * and stops a once-only interaction firing twice for two players who pressed
 * at the same instant.
 */

const DRIFT_THRESHOLD = 3;

/**
 * The Reunion's own soft budget (ADR-0018/0013), separate from the two solo
 * playthroughs that paid for themselves. Soft, for the same reason: it cuts
 * optional spend and never blocks the area two people are standing at a door
 * waiting for.
 */
const REUNION_BUDGET_USD = Number(process.env["HOWEVERFAR_REUNION_BUDGET_USD"] ?? 4);

/** The first shared area's authoring instruction — the seam, from both sides. */
const OPENING_HINT = `The first shared area. Both players arrive at the seam where the two worlds touch: the railway underpass on Aozora Lane on his side, and whatever her world has made of the same place on hers — one space, seen from two directions at once, and neither of them can quite believe the other is standing in it. Open on the moment of recognition, and do not spend it cheaply: they have each been alone with this for a whole playthrough. Then give them something only both of them together can do.`;

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export type ReunionTurnResult =
  | { kind: "area"; area: AreaSpec; state: ReunionGameState }
  | { kind: "ok"; state: ReunionGameState; ack?: string }
  | { kind: "ending"; summary: string; ending?: ReunionEnding };

export interface ReunionDirectorOptions {
  model: ModelClient;
  log?: (msg: string) => void;
}

export class ReunionDirector {
  private readonly model: ModelClient;
  private readonly log: (msg: string) => void;
  private session: ReunionSessionSave;
  private ledger: CanonLedger;

  constructor(opts: ReunionDirectorOptions, session: ReunionSessionSave) {
    this.model = opts.model;
    this.log = opts.log ?? (() => {});
    this.session = structuredClone(session);
    this.ledger = new CanonLedger(this.session.canon);
  }

  /**
   * Open a shared world from two answered calls. This is the expensive part of
   * the Reunion — planning a finale out of two whole histories — so it happens
   * once, when the pairing is made, and the first area is written on arrival.
   */
  static async open(
    opts: ReunionDirectorOptions,
    her: PlaythroughExport,
    his: PlaythroughExport,
    contacts: { her: CallerIdentity; his: CallerIdentity },
    id = `reunion-${Date.now()}`,
  ): Promise<ReunionDirector> {
    const players = { her: contacts.her.name, his: contacts.his.name };
    if (her.path !== "her" || his.path !== "his") {
      throw new ReunionFailedError("a reunion needs one playthrough of each side");
    }
    const log = opts.log ?? (() => {});
    const facts = mergeCanon(her, his, REUNION_SEED_CANON);
    log("planning the shared finale from both playthroughs");
    const arc = await createReunionArc(opts.model, her, his, facts);

    const now = new Date().toISOString();
    // The world starts with no areas: the opening one is written the first
    // time somebody asks for it, so a pairing made at 3am costs nothing until
    // the two of them actually sit down.
    const session: ReunionSessionSave = {
      id,
      createdAt: now,
      updatedAt: now,
      phase: "reunion",
      state: {
        currentAreaId: "unwritten",
        // Both arrive as what their playthrough made of them: an attribute
        // earned over thirty areas is not handed back at the door.
        her: {
          role: "her",
          name: players.her,
          pos: { x: 0, y: 0 },
          facing: "down",
          sheet: her.sheet,
          connected: false,
        },
        his: {
          role: "his",
          name: players.his,
          pos: { x: 0, y: 0 },
          facing: "down",
          sheet: his.sheet,
          connected: false,
        },
        flags: {},
        inventory: [],
        visitedAreaIds: [],
        usedInteractions: [],
        rng: { seed: seedFromId(id), counter: 0 },
        quests: [],
      },
      areas: {},
      arc,
      canon: facts,
      characters: mergeCharacters(her, his),
      her,
      his,
      contacts,
      spentUsd: 0,
      areasSinceBeatProgress: 0,
    };
    log(`the reunion is open: ${arc.premise.slice(0, 80)}…`);
    return new ReunionDirector(opts, session);
  }

  getSession(): ReunionSessionSave {
    return structuredClone(this.session);
  }

  /** True until the opening area has been written. */
  get needsOpening(): boolean {
    return this.session.state.currentAreaId === "unwritten";
  }

  currentArea(): AreaSpec {
    const area = this.session.areas[this.session.state.currentAreaId];
    if (!area) {
      throw new ReunionFailedError(
        `current area "${this.session.state.currentAreaId}" not found in the shared world`,
      );
    }
    return area;
  }

  /** Mark a player attached or gone. Play continues either way. */
  setConnected(role: ReunionRole, connected: boolean): ReunionGameState {
    const state = this.session.state;
    this.session.state =
      role === "her"
        ? { ...state, her: { ...state.her, connected } }
        : { ...state, his: { ...state.his, connected } };
    this.touch();
    return this.session.state;
  }

  private async charge<T>(work: () => Promise<T>): Promise<T> {
    const before = costCounter().usd;
    try {
      return await work();
    } finally {
      this.session.spentUsd += Math.max(0, costCounter().usd - before);
    }
  }

  overBudget(): boolean {
    return this.session.spentUsd >= REUNION_BUDGET_USD;
  }

  /** Write and enter the first shared area. Idempotent. */
  async openingArea(events: TurnEvents = {}): Promise<AreaSpec> {
    if (!this.needsOpening) return this.currentArea();
    events.stage?.("writing");
    const result = await this.charge(() =>
      writeReunionArea(this.model, this.writerContext(OPENING_HINT), { log: this.log }),
    );
    events.stage?.("arriving");
    // The state has no real area yet, so placement happens here rather than
    // through acceptArea's enter-from-somewhere path.
    this.session.areas[result.area.id] = result.area;
    const before = this.session.state;
    const placed = initialReunionState(
      result.area,
      { her: before.her.name, his: before.his.name },
      before.rng.seed,
    );
    // initialReunionState builds a world from nothing, which means base
    // sheets; the two of them arrive with what their own paths made of them.
    this.session.state = {
      ...placed,
      her: { ...placed.her, sheet: before.her.sheet, connected: before.her.connected },
      his: { ...placed.his, sheet: before.his.sheet, connected: before.his.connected },
    };
    await this.recordArea(result.area, result.advancesBeatId);
    return result.area;
  }

  async handleAction(
    role: ReunionRole,
    action: AreaAction,
    events: TurnEvents = {},
  ): Promise<ReunionTurnResult> {
    if (this.session.phase === "ended") {
      return {
        kind: "ending",
        summary: this.session.endingSummary ?? "",
        ...(this.session.ending ? { ending: this.session.ending } : {}),
      };
    }
    const area = this.currentArea();
    const { state, outcome } = applyReunionAction(this.session.state, area, role, action);
    this.session.state = state;
    this.touch();

    switch (outcome.kind) {
      case "convo":
        if (outcome.outcome.transition) {
          return this.followTransition(outcome.outcome.transition, events);
        }
        return { kind: "ok", state: this.session.state };
      case "portal":
        return this.followTransition(outcome.outcome.transition, events);
      case "freeText":
      case "approach":
      case "interaction":
      case "moveTo":
        return { kind: "ok", state: this.session.state };
    }
  }

  private async followTransition(
    t: AreaTransition,
    events: TurnEvents,
  ): Promise<ReunionTurnResult> {
    switch (t.type) {
      case "area": {
        const next = this.session.areas[t.areaId];
        if (!next) throw new ReunionFailedError(`transition to unknown area "${t.areaId}"`);
        this.session.state = enterReunionArea(this.session.state, next);
        this.touch();
        return { kind: "area", area: next, state: this.session.state };
      }
      case "generate": {
        events.stage?.("writing");
        const result = await this.charge(() =>
          writeReunionArea(this.model, this.writerContext(t.hint), { log: this.log }),
        );
        events.stage?.("arriving");
        this.session.areas[result.area.id] = result.area;
        this.session.state = enterReunionArea(this.session.state, result.area);
        await this.recordArea(result.area, result.advancesBeatId);
        return { kind: "area", area: result.area, state: this.session.state };
      }
      case "ending":
        return this.finish(t.hint, events);
    }
  }

  /** The end of the whole game. */
  private async finish(
    hint: string,
    events: TurnEvents = {},
  ): Promise<ReunionTurnResult> {
    events.stage?.("closing");
    const ending = await this.charge(() =>
      writeReunionFinale(
        this.model,
        {
          arc: this.session.arc,
          facts: this.ledger.active(),
          her: this.session.her,
          his: this.session.his,
          hint,
          visitedAreaIds: this.session.state.visitedAreaIds,
        },
        { log: this.log },
      ),
    );
    this.session.ending = ending;
    this.session.endingSummary = ending.title;
    this.session.phase = "ended";
    this.touch();
    this.log(`the reunion ends: ${ending.title}`);
    return { kind: "ending", summary: ending.title, ending };
  }

  private writerContext(hint: string) {
    const recentIds = this.session.state.visitedAreaIds.slice(-2);
    const recentAreas = recentIds
      .map((id) => this.session.areas[id])
      .filter((a): a is AreaSpec => !!a)
      .map((a) => ({ id: a.id, name: a.name, description: a.description }));
    const focus = [
      ...(this.session.areas[this.session.state.currentAreaId]?.entities.map((e) => e.id) ??
        []),
      ...this.session.state.inventory.map((i) => i.item),
    ];
    return {
      arc: this.session.arc,
      facts: this.retrieve(focus),
      her: this.session.her,
      his: this.session.his,
      characters: Object.values(this.session.characters),
      state: this.session.state,
      recentAreas,
      hint,
      existingAreaIds: Object.keys(this.session.areas),
      endingAllowed: isFinalAct(this.session.arc),
    };
  }

  /**
   * Retrieval, with the Reunion's fixed seeds always included. They are the
   * rails the shared finale runs on and are too important to lose to a
   * relevance cutoff.
   */
  private retrieve(focus: readonly string[]): CanonFact[] {
    const seeds = this.ledger
      .active()
      .filter((f) => f.id.startsWith("reunion-seed-"));
    const retrieved = this.ledger.retrieve(focus, DIRECTOR_CONFIG.retrievalLimit);
    const seen = new Set(seeds.map((f) => f.id));
    return [...seeds, ...retrieved.filter((f) => !seen.has(f.id))];
  }

  private async recordArea(area: AreaSpec, advancesBeatId?: string): Promise<void> {
    for (const entity of area.entities) {
      if (entity.role !== "character") continue;
      if (this.session.characters[entity.id]) continue;
      this.session.characters[entity.id] = {
        id: entity.id,
        name: entity.name,
        appearance: entity.description,
        ...(entity.nameMeaning ? { nameMeaning: entity.nameMeaning } : {}),
        firstAreaId: area.id,
      };
    }
    const newFacts = await extractAreaFacts(this.model, area, this.ledger.all(), this.log);
    this.ledger.append(newFacts, area.id);
    this.session.canon = [...this.ledger.all()];

    this.session.arc = advanceArc(this.session.arc, advancesBeatId);
    this.session.areasSinceBeatProgress = advancesBeatId
      ? 0
      : this.session.areasSinceBeatProgress + 1;
    if (this.session.areasSinceBeatProgress >= DRIFT_THRESHOLD) {
      // The Reunion is a handful of areas long, so drift is corrected by
      // pressing on rather than by re-planning: a finale that stops to revise
      // its own arc has already lost the momentum it needs.
      this.log(
        `reunion drift: ${this.session.areasSinceBeatProgress} areas without beat progress`,
      );
    }
    this.touch();
  }

  private touch(): void {
    this.session.updatedAt = new Date().toISOString();
  }
}

