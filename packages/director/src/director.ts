import {
  type PlayerAction,
  type SceneSpec,
  type SessionSave,
  type Transition,
} from "@unwritten/schema";
import { applyAction, enterScene, initialState } from "@unwritten/engine";
import {
  ANCHOR_CANON,
  ANCHOR_ENTRY_ID,
  getAnchorScenes,
} from "@unwritten/content";
import { CanonLedger } from "./canonLedger.js";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import type { WriterContext } from "./prompts.js";
import {
  advanceArc,
  buildProfile,
  createArc,
  extractFacts,
  isFinalAct,
} from "./stages.js";
import { writeScene } from "./writer.js";

export type TurnResult =
  | { kind: "scene"; scene: SceneSpec }
  | { kind: "anchorAck"; text: string }
  | { kind: "ended"; summary: string };

export interface DirectorOptions {
  model: ModelClient;
  log?: (msg: string) => void;
}

const ANCHOR_FREETEXT_ACK =
  "The moment takes what you did and keeps it — the road, you are beginning to suspect, remembers everything. But some things here were already written before you woke, and for now the scene holds.";

/**
 * The Director owns a play session: it routes fixed content while the Anchor
 * lasts, then authors everything after it. It never mutates the caller's
 * SessionSave — read the current state back with getSession().
 */
export class Director {
  private readonly model: ModelClient;
  private readonly log: (msg: string) => void;
  private session: SessionSave;
  private ledger: CanonLedger;

  constructor(opts: DirectorOptions, session?: SessionSave) {
    this.model = opts.model;
    this.log = opts.log ?? (() => {});
    this.session = session ? structuredClone(session) : Director.newSession();
    this.ledger = new CanonLedger(this.session.canon);
  }

  static newSession(id = `session-${Date.now()}`): SessionSave {
    const anchor = getAnchorScenes();
    const entry = anchor.get(ANCHOR_ENTRY_ID);
    if (!entry) throw new Error("anchor entry scene missing");
    const now = new Date().toISOString();
    return {
      id,
      createdAt: now,
      updatedAt: now,
      phase: "anchor",
      state: initialState(entry),
      scenes: Object.fromEntries(anchor),
      signals: [],
      canon: [],
    };
  }

  getSession(): SessionSave {
    return structuredClone(this.session);
  }

  currentScene(): SceneSpec {
    const scene = this.session.scenes[this.session.state.currentSceneId];
    if (!scene) {
      throw new Error(
        `current scene "${this.session.state.currentSceneId}" not found in session`,
      );
    }
    return scene;
  }

  async handleAction(action: PlayerAction): Promise<TurnResult> {
    if (this.session.phase === "ended") {
      return { kind: "ended", summary: this.session.endingSummary ?? "" };
    }
    const scene = this.currentScene();
    const outcome = applyAction(this.session.state, scene, action);

    // Record the play signal (profiling never stops).
    const label =
      action.type === "choice"
        ? (scene.choices.find((c) => c.id === action.choiceId)?.label ?? action.choiceId)
        : action.text;
    this.session.signals.push({
      sceneId: scene.id,
      kind: action.type,
      action: label,
    });

    if (outcome.kind === "freeText") {
      if (this.session.phase === "anchor") {
        // The Anchor is fixed; free text is recorded as signal, acknowledged in-fiction.
        this.touch();
        return { kind: "anchorAck", text: ANCHOR_FREETEXT_ACK };
      }
      return this.generateNext(
        `The player, in the middle of the scene "${scene.title}", took a free action of their own: "${outcome.text}". Author the scene that honestly responds to that action in context.`,
      );
    }

    this.session.state = outcome.state;
    return this.followTransition(scene, outcome.transition);
  }

  private async followTransition(
    from: SceneSpec,
    t: Transition,
  ): Promise<TurnResult> {
    switch (t.type) {
      case "scene": {
        const next = this.session.scenes[t.sceneId];
        if (!next) throw new Error(`transition to unknown scene "${t.sceneId}"`);
        this.session.state = enterScene(this.session.state, next);
        this.touch();
        return { kind: "scene", scene: next };
      }
      case "generate": {
        if (this.session.phase === "anchor") {
          await this.exitAnchor();
        }
        return this.generateNext(t.hint);
      }
      case "ending": {
        // Second step: the player closed the book on the generated ending scene.
        if (this.session.endingSceneId === from.id) {
          this.session.phase = "ended";
          this.session.endingSummary = from.narration;
          this.touch();
          return { kind: "ended", summary: from.narration };
        }
        // Ending gate: only the final act may end the game (whole-game coherence).
        if (!this.session.arc || !isFinalAct(this.session.arc)) {
          return this.generateNext(
            `The player moved toward an ending ("${t.hint}") — but the story is not finished. Give this attempted conclusion real narrative weight, then turn it back toward the work the arc still owes.`,
          );
        }
        return this.generateEnding(t.hint, t.tone);
      }
    }
  }

  /** Anchor complete: read the player, plan their whole game, seed canon. */
  private async exitAnchor(): Promise<void> {
    this.log("anchor complete — profiling player and designing arc");
    const profile = await buildProfile(this.model, this.session.signals);

    // Seed canon with the Anchor's hand-written facts + what the player took.
    this.ledger.append([...ANCHOR_CANON.map((f) => ({ ...f }))], "anchor-box");
    for (const item of this.session.state.inventory) {
      this.ledger.append(
        [
          {
            statement: `From the box bearing their name, the player took the ${item.name}.`,
            entities: [item.item, "named-box"],
          },
        ],
        "anchor-box",
      );
    }
    this.session.canon = [...this.ledger.all()];

    const arc = await createArc(this.model, profile, this.ledger.active());
    this.session.profile = profile;
    this.session.arc = arc;
    this.session.phase = "generated";
    this.log(
      `profile: ${profile.genre.primary} (${profile.genre.confidence}) · arc: ${arc.premise.slice(0, 80)}…`,
    );
  }

  private writerContext(hint: string): WriterContext {
    if (!this.session.profile || !this.session.arc) {
      throw new Error("writer context requested before profile/arc exist");
    }
    const recentIds = this.session.state.visitedSceneIds.slice(-2);
    const recentScenes = recentIds
      .map((id) => this.session.scenes[id])
      .filter((s): s is SceneSpec => !!s)
      .map((s) => ({ id: s.id, title: s.title, narration: s.narration }));
    const current = this.session.scenes[this.session.state.currentSceneId];
    const focusEntities = [
      ...(current?.entities.map((e) => e.id) ?? []),
      ...this.session.state.inventory.map((i) => i.item),
    ];
    return {
      profile: this.session.profile,
      arc: this.session.arc,
      facts: this.ledger.retrieve(focusEntities, DIRECTOR_CONFIG.retrievalLimit),
      state: this.session.state,
      recentScenes,
      hint,
      existingSceneIds: Object.keys(this.session.scenes),
    };
  }

  private async generateNext(hint: string): Promise<TurnResult> {
    const result = await writeScene(this.model, this.writerContext(hint), {
      log: this.log,
    });
    await this.acceptScene(result.scene, result.advancesBeatId);
    return { kind: "scene", scene: result.scene };
  }

  private async generateEnding(hint: string, tone: string): Promise<TurnResult> {
    const arc = this.session.arc;
    const fullHint = `${hint}\n\nThis is the FINAL scene. Planned ending (${arc?.plannedEnding.tone}): ${arc?.plannedEnding.summary}. The player's chosen ending tone: ${tone}. Conclude the story.`;
    const result = await writeScene(this.model, this.writerContext(fullHint), {
      ending: true,
      log: this.log,
    });
    // The server owns termination: a single "close the book" choice.
    const scene: SceneSpec = {
      ...result.scene,
      choices: [
        {
          id: "the-end",
          label: "Close the book.",
          effects: [],
          transition: {
            type: "ending",
            tone: (["triumphant", "bittersweet", "tragic", "mysterious"] as const).find(
              (v) => v === tone,
            ) ?? "bittersweet",
            hint: "The story is over.",
          },
        },
      ],
      freeText: { enabled: false },
    };
    await this.acceptScene(scene, result.advancesBeatId, { skipExtraction: true });
    this.session.endingSceneId = scene.id;
    this.touch();
    return { kind: "scene", scene };
  }

  private async acceptScene(
    scene: SceneSpec,
    advancesBeatId?: string,
    opts: { skipExtraction?: boolean } = {},
  ): Promise<void> {
    this.session.scenes[scene.id] = scene;

    if (!opts.skipExtraction) {
      const newFacts = await extractFacts(
        this.model,
        scene,
        this.ledger.all(),
        this.log,
      );
      this.ledger.append(newFacts, scene.id);
      this.session.canon = [...this.ledger.all()];
    }
    if (this.session.arc) {
      this.session.arc = advanceArc(this.session.arc, advancesBeatId);
    }
    this.session.state = enterScene(this.session.state, scene);
    this.touch();
  }

  private touch(): void {
    this.session.updatedAt = new Date().toISOString();
  }
}
