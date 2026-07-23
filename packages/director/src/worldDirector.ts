import type {
  AreaAction,
  AreaGameState,
  AreaSessionSave,
  AreaSpec,
  AreaTransition,
  StoryPath,
} from "@howeverfar/schema";
import { applyAreaAction, enterArea, initialAreaState } from "@howeverfar/engine";
import {
  PATH_CHOICE_PORTALS,
  PATH_SEED_CANON,
  PROLOGUE_CANON,
  PROLOGUE_ENTRY_ID,
  getPrologueAreas,
} from "@howeverfar/content";
import { CanonLedger } from "./canonLedger.js";
import { costCounter } from "./costs.js";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import { advanceArc, buildProfile, isFinalAct, reviseArc } from "./stages.js";
import {
  createWorldArc,
  extractAreaFacts,
  writeArea,
  type WriteAreaResult,
} from "./worldWriter.js";
import type { WorldWriterContext } from "./worldPrompts.js";

/** Accepted areas without beat progress before the Architect revises the arc. */
const DRIFT_THRESHOLD = 3;

/**
 * Hard cap on speculative area writes per session (Phase 6 latency vs ADR-0013
 * zero-spend). Speculation buys back the ~3 minute crossing measured in the
 * Phase 4 go/no-go, but every speculation the player walks away from is money
 * spent on an area nobody reads — so it is approach-triggered (the client only
 * asks when the player is walking at a door) and capped.
 */
const MAX_SPECULATIONS = Number(process.env["HOWEVERFAR_MAX_SPECULATIONS"] ?? 12);

/**
 * Soft budget per playthrough in USD (ADR-0018/0013). "Soft" is the whole
 * design: going over never blocks the area a player is standing at a door
 * waiting for, because the always-playable invariant outranks the budget.
 * What it does is cut the optional spend — speculation stops first, since an
 * area nobody walked into is the only spend that buys nothing.
 */
const SESSION_BUDGET_USD = Number(process.env["HOWEVERFAR_SESSION_BUDGET_USD"] ?? 3);

/** Stable 32-bit seed from a session id — same session, same dice, forever. */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const PROLOGUE_FREETEXT_ACK =
  "The moment takes what you did and keeps it. But this evening was already written before you lived it — and for now, it holds.";

export type WorldTurnResult =
  | { kind: "area"; area: AreaSpec; state: AreaGameState }
  | { kind: "ok"; state: AreaGameState; ack?: string }
  | { kind: "threshold"; summary: string };

export interface WorldDirectorOptions {
  model: ModelClient;
  log?: (msg: string) => void;
}

/**
 * The WorldDirector owns an RPG play session (Area DSL v1): it routes the
 * hand-authored Prologue, commits the path choice at the crossing (profile,
 * seed canon, arc), then authors every area after it. The server runs the
 * engine authoritatively; the client may run the same pure engine
 * optimistically. Never mutates the caller's save — use getSession().
 */
export class WorldDirector {
  private readonly model: ModelClient;
  private readonly log: (msg: string) => void;
  private session: AreaSessionSave;
  private ledger: CanonLedger;

  constructor(opts: WorldDirectorOptions, session?: AreaSessionSave) {
    this.model = opts.model;
    this.log = opts.log ?? (() => {});
    this.session = session ? structuredClone(session) : WorldDirector.newSession();
    this.ledger = new CanonLedger(this.session.canon);
  }

  static newSession(id = `world-${Date.now()}`): AreaSessionSave {
    const areas = getPrologueAreas();
    const entry = areas.find((a) => a.id === PROLOGUE_ENTRY_ID);
    if (!entry) throw new Error("prologue entry area missing");
    const now = new Date().toISOString();
    return {
      id,
      createdAt: now,
      updatedAt: now,
      phase: "prologue",
      path: "shared",
      // Seeded from the session id so every playthrough rolls its own dice,
      // while a given session replays identically from its action log.
      state: initialAreaState(entry, seedFromId(id)),
      areas: Object.fromEntries(areas.map((a) => [a.id, a])),
      signals: [],
      canon: [],
      spentUsd: 0,
      areasSinceBeatProgress: 0,
    };
  }

  /**
   * Areas written ahead of the player, keyed `${areaId}/${portalId}`. Held in
   * memory only: a speculation is tied to the exact state it was written
   * against, so it must not outlive the process or be persisted into a save.
   */
  private speculations = new Map<string, Promise<WriteAreaResult>>();
  private speculationCount = 0;

  /**
   * The player is walking toward a portal — start writing what is beyond it.
   * Fire-and-forget: failures are swallowed here and retried for real if the
   * player actually steps through.
   */
  /** What this playthrough has cost so far. */
  spentUsd(): number {
    return this.session.spentUsd;
  }

  /** True once the playthrough has spent past its soft budget. */
  overBudget(): boolean {
    return this.session.spentUsd >= SESSION_BUDGET_USD;
  }

  /**
   * Run `work`, attributing whatever it spends to this session. Sampling the
   * process-wide counter around the call is accurate as long as one session
   * generates at a time, and errs high (never low) under concurrency — the
   * safe direction for a budget.
   */
  private async charge<T>(work: () => Promise<T>): Promise<T> {
    const before = costCounter().usd;
    try {
      return await work();
    } finally {
      this.session.spentUsd += Math.max(0, costCounter().usd - before);
    }
  }

  approach(portalId: string): void {
    if (this.session.phase !== "generated") return;
    if (this.speculationCount >= MAX_SPECULATIONS) return;
    if (this.overBudget()) {
      this.log(
        `over budget ($${this.session.spentUsd.toFixed(2)} of $${SESSION_BUDGET_USD.toFixed(2)}) — not speculating; play continues at full quality`,
      );
      return;
    }

    const area = this.currentArea();
    const portal = area.portals.find((p) => p.id === portalId);
    if (!portal || portal.transition.type !== "generate") return;
    const hint = portal.transition.hint;

    const key = `${area.id}/${portalId}`;
    if (this.speculations.has(key)) return;

    this.speculationCount++;
    this.log(`speculating past "${portal.label}" (${this.speculationCount}/${MAX_SPECULATIONS})`);
    const pending = this.charge(() =>
      writeArea(this.model, this.writerContext(hint), { log: this.log }),
    );
    // Attach a catch so an early rejection never becomes an unhandled
    // rejection; the stored promise keeps the original outcome.
    pending.catch(() => undefined);
    this.speculations.set(key, pending);
  }

  getSession(): AreaSessionSave {
    return structuredClone(this.session);
  }

  currentArea(): AreaSpec {
    const area = this.session.areas[this.session.state.currentAreaId];
    if (!area) {
      throw new Error(
        `current area "${this.session.state.currentAreaId}" not found in session`,
      );
    }
    return area;
  }

  async handleAction(action: AreaAction): Promise<WorldTurnResult> {
    if (this.session.phase === "ended") {
      return { kind: "threshold", summary: this.session.endingSummary ?? "" };
    }
    const area = this.currentArea();
    const outcome = applyAreaAction(this.session.state, area, action);

    this.recordSignal(area, action);

    switch (outcome.kind) {
      case "interaction": {
        this.session.state = outcome.outcome.state;
        this.touch();
        return { kind: "ok", state: this.session.state };
      }
      case "convo": {
        this.session.state = outcome.outcome.state;
        this.touch();
        if (outcome.outcome.transition) {
          return this.followTransition(outcome.outcome.transition, "a conversation");
        }
        return { kind: "ok", state: this.session.state };
      }
      case "portal": {
        this.session.state = outcome.outcome.state;
        const portal = area.portals.find(
          (p) => action.type === "portal" && p.id === action.portalId,
        );
        return this.followTransition(
          outcome.outcome.transition,
          portal?.label ?? "a doorway",
          portal?.id,
        );
      }
      case "approach": {
        // The engine echoes the portal id back, so no narrowing on `action`.
        this.approach(outcome.portalId);
        return { kind: "ok", state: this.session.state };
      }
      case "freeText": {
        // Free text is a profiling signal everywhere; a generation trigger
        // only after the prologue (and that arrives with streaming, Phase 6).
        this.touch();
        return { kind: "ok", state: this.session.state, ack: PROLOGUE_FREETEXT_ACK };
      }
    }
  }

  private recordSignal(area: AreaSpec, action: AreaAction): void {
    const describe = (): { kind: "choice" | "freeText" | "interact" | "portal"; text: string } | undefined => {
      switch (action.type) {
        case "interact": {
          const e = area.entities.find((x) => x.id === action.entityId);
          return {
            kind: "interact",
            text: `${e?.interaction?.verb ?? "interact"}: ${e?.name ?? action.entityId}`,
          };
        }
        case "convoChoice": {
          const e = area.entities.find((x) => x.id === action.entityId);
          const c = e?.interaction?.choices.find((x) => x.id === action.choiceId);
          return { kind: "choice", text: c?.label ?? action.choiceId };
        }
        case "portal": {
          const p = area.portals.find((x) => x.id === action.portalId);
          return { kind: "portal", text: p?.label ?? action.portalId };
        }
        case "freeText":
          return { kind: "freeText", text: action.text };
        case "approach":
          // Not a play signal — walking near a door says nothing about the
          // player, and recording it would skew the profile.
          return undefined;
      }
    };
    const described = describe();
    if (!described) return;
    this.session.signals.push({ sceneId: area.id, kind: described.kind, action: described.text });
  }

  private async followTransition(
    t: AreaTransition,
    label: string,
    portalId?: string,
  ): Promise<WorldTurnResult> {
    switch (t.type) {
      case "area": {
        const next = this.session.areas[t.areaId];
        if (!next) throw new Error(`transition to unknown area "${t.areaId}"`);
        this.session.state = enterArea(this.session.state, next);
        this.touch();
        return { kind: "area", area: next, state: this.session.state };
      }
      case "generate": {
        if (this.session.phase === "prologue") {
          const path = portalId ? PATH_CHOICE_PORTALS[portalId] : undefined;
          if (!path || path === "shared") {
            throw new Error(
              `generate transition "${label}" reached during the prologue outside the crossing`,
            );
          }
          await this.commitPathChoice(path);
        }
        return this.generateNextArea(t.hint, portalId);
      }
      case "ending": {
        if (!this.session.arc || !isFinalAct(this.session.arc)) {
          return this.generateNextArea(
            `The player moved toward an ending ("${t.hint}") — but the story is not finished. Give this attempted conclusion real narrative weight, then turn it back toward the work the arc still owes.`,
          );
        }
        this.session.phase = "ended";
        this.session.endingSummary = t.hint;
        this.touch();
        return { kind: "threshold", summary: t.hint };
      }
    }
  }

  /** The crossing: read the player, load the rails, plan their side of the story. */
  private async commitPathChoice(path: Exclude<StoryPath, "shared">): Promise<void> {
    this.log(`path chosen: ${path} — profiling player and planning the arc`);
    this.session.path = path;

    if (!this.session.profile) {
      this.session.profile = await buildProfile(this.model, this.session.signals);
    }

    if (this.ledger.all().length === 0) {
      this.ledger.append([...PROLOGUE_CANON.map((f) => ({ ...f }))], "prologue-crossing");
      this.ledger.append(
        [...PATH_SEED_CANON[path].map((f) => ({ ...f }))],
        "prologue-crossing",
      );
    }
    this.session.canon = [...this.ledger.all()];

    if (!this.session.arc) {
      this.session.arc = await createWorldArc(
        this.model,
        path,
        this.session.profile,
        this.ledger.active(),
      );
    }
    this.session.phase = "generated";
    this.log(`arc: ${this.session.arc.premise.slice(0, 80)}…`);
  }

  private writerContext(hint: string): WorldWriterContext {
    if (!this.session.profile || !this.session.arc || this.session.path === "shared") {
      throw new Error("writer context requested before the path choice");
    }
    const recentIds = this.session.state.visitedAreaIds.slice(-2);
    const recentAreas = recentIds
      .map((id) => this.session.areas[id])
      .filter((a): a is AreaSpec => !!a)
      .map((a) => ({ id: a.id, name: a.name, description: a.description }));
    const current = this.session.areas[this.session.state.currentAreaId];
    const focusEntities = [
      ...(current?.entities.map((e) => e.id) ?? []),
      ...this.session.state.inventory.map((i) => i.item),
    ];
    return {
      path: this.session.path,
      profile: this.session.profile,
      arc: this.session.arc,
      facts: this.ledger.retrieve(focusEntities, DIRECTOR_CONFIG.retrievalLimit),
      state: this.session.state,
      recentAreas,
      hint,
      existingAreaIds: Object.keys(this.session.areas),
    };
  }

  private async generateNextArea(
    hint: string,
    portalId?: string,
  ): Promise<WorldTurnResult> {
    const result =
      (await this.claimSpeculation(portalId)) ??
      (await this.charge(() =>
        writeArea(this.model, this.writerContext(hint), { log: this.log }),
      ));
    await this.acceptArea(result.area, result.advancesBeatId);
    return { kind: "area", area: result.area, state: this.session.state };
  }

  /**
   * Take the area written ahead for this portal, if there is one. A
   * speculation that failed is discarded silently — the caller writes it for
   * real — and is not retried, since the same context would fail again.
   */
  private async claimSpeculation(
    portalId: string | undefined,
  ): Promise<WriteAreaResult | undefined> {
    if (!portalId) return undefined;
    const key = `${this.session.state.currentAreaId}/${portalId}`;
    const pending = this.speculations.get(key);
    if (!pending) return undefined;
    this.speculations.delete(key);
    try {
      const result = await pending;
      // Two portals can be speculated and both land on the same id; only the
      // first one through is usable.
      if (this.session.areas[result.area.id]) return undefined;
      this.log(`used speculation for "${key}" — no wait at the threshold`);
      return result;
    } catch {
      this.log(`speculation for "${key}" failed; writing it for real`);
      return undefined;
    }
  }

  private async acceptArea(area: AreaSpec, advancesBeatId?: string): Promise<void> {
    this.session.areas[area.id] = area;

    const newFacts = await extractAreaFacts(
      this.model,
      area,
      this.ledger.all(),
      this.log,
    );
    this.ledger.append(newFacts, area.id);
    this.session.canon = [...this.ledger.all()];

    if (this.session.arc) {
      this.session.arc = advanceArc(this.session.arc, advancesBeatId);
      this.session.areasSinceBeatProgress = advancesBeatId
        ? 0
        : this.session.areasSinceBeatProgress + 1;
      if (
        this.session.areasSinceBeatProgress >= DRIFT_THRESHOLD &&
        this.session.profile
      ) {
        this.log(
          `arc drift: ${this.session.areasSinceBeatProgress} areas without beat progress — revising arc`,
        );
        this.session.arc = await reviseArc(
          this.model,
          this.session.arc,
          this.session.profile,
          this.ledger.active(),
          `The last ${this.session.areasSinceBeatProgress} areas advanced no planned beat — play has drifted from the plan. Revise the arc to follow where the player is actually going.`,
        );
        this.session.areasSinceBeatProgress = 0;
      }
    }
    this.session.state = enterArea(this.session.state, area);
    this.touch();
  }

  private touch(): void {
    this.session.updatedAt = new Date().toISOString();
  }
}
