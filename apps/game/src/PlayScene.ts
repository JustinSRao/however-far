import Phaser from "phaser";
import type { AreaSpec, PlacedEntity } from "@howeverfar/schema";
import type {
  AreaGameState,
  ReunionEnding,
  ReunionGameState,
  ReunionRole,
  SoloPath,
  ThresholdEnding,
  TurnStage,
} from "@howeverfar/schema";
import {
  applyConvoChoice,
  choiceAffordable,
  interactionUsed,
  interstitialFor,
  interstitialStart,
  portalUnderPlayer,
  projectPlayer,
  reachableEntities,
  reunionMove,
  runInteraction,
  tryMove,
  type Direction,
} from "./deps.js";
import { fetchExport, placeCall, pollCall, showCall, type CallDraft } from "./call.js";
import { ensureTileTexture } from "./tiles.js";
import { ReunionClient } from "./reunionClient.js";
import {
  connect,
  followTransition,
  listReunions,
  listSaves,
  sendAction,
  ServerError,
  streamAction,
  type SaveInfo,
  type Session,
  type World,
} from "./world.js";
import * as ui from "./ui.js";

export const TILE = 48;
const MOVE_MS = 140;
/** LPC character sheet geometry (classic layout: 13 cols, 64px frames). */
const FRAME = 64;
const SHEET_COLS = 13;
/** Row of each direction's walk cycle in the classic LPC layout. */
const WALK_ROW: Record<Direction, number> = { up: 8, left: 9, down: 10, right: 11 };
/** How close the player gets before we ask the server to write what is beyond. */
const APPROACH_RADIUS = 4;

const PATH_LABEL: Record<SaveInfo["path"], string> = {
  shared: "the prologue",
  her: "her path",
  his: "his path",
};

function describeSave(save: SaveInfo): string {
  const areas = `${save.areasVisited} ${save.areasVisited === 1 ? "area" : "areas"}`;
  const when = new Date(save.updatedAt);
  const date = Number.isNaN(when.getTime()) ? "" : ` · ${when.toLocaleDateString()}`;
  // On his path the save may have rewritten its own label (ADR-0015). The
  // file underneath is intact and loads normally whatever it calls itself.
  return `${save.label ?? PATH_LABEL[save.path]}, ${areas}${date}`;
}

/**
 * Presentation + input only (ADR-0010): every rule goes through the engine;
 * this scene draws state and forwards key presses.
 */
export class PlayScene extends Phaser.Scene {
  private world?: World;
  private session: Session = { mode: "local" };
  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = "down";
  private mapLayer!: Phaser.GameObjects.Container;
  private entityLayer!: Phaser.GameObjects.Container;
  private moving = false;
  private menu: readonly { key: string; label: string; action: () => void }[] | undefined;
  /**
   * The shared world, once two calls have answered each other (Phase 7). When
   * this is set, `world.state` is a projection of `reunion.state` for this
   * player and every rule still runs through the same engine.
   */
  private reunion:
    | { client: ReunionClient; role: ReunionRole; state: ReunionGameState }
    | undefined;
  /** `${areaId}/${portalId}` already announced, so each door is asked for once. */
  private announced = new Set<string>();
  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("play");
  }

  preload(): void {
    // LPC character (CC-BY-SA 3.0 / GPL 3.0 — see apps/game/CREDITS.md).
    this.load.spritesheet("hero", "/assets/character.png", {
      frameWidth: FRAME,
      frameHeight: FRAME,
    });
  }

  /** The four walk cycles, defined once (frames 1–8 of each direction's row). */
  private defineAnims(): void {
    if (this.anims.exists("walk-down")) return;
    (Object.keys(WALK_ROW) as Direction[]).forEach((dir) => {
      const row = WALK_ROW[dir];
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers("hero", {
          start: row * SHEET_COLS + 1,
          end: row * SHEET_COLS + 8,
        }),
        frameRate: 10,
        repeat: -1,
      });
    });
  }

  /** The standing frame (column 0) for a direction. */
  private idleFrame(dir: Direction): number {
    return WALK_ROW[dir] * SHEET_COLS;
  }

  create(): void {
    this.defineAnims();
    ui.showVeil("However Far", "Opening the evening…", "");
    void this.boot();

    const kb = this.input.keyboard;
    if (!kb) throw new Error("keyboard input unavailable");
    this.keys = kb.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT") as PlayScene["keys"];

    kb.on("keydown-SPACE", (event: KeyboardEvent) => {
      event.preventDefault();
      if (ui.veilOpen()) return;
      ui.advancePanel();
    });
    kb.on("keydown-E", () => this.tryInteract());
    kb.on("keydown-T", () => this.trySay());
    kb.on("keydown-ENTER", () => this.tryPortal());
    kb.on("keydown-ESC", () => {
      if (!this.world) return;
      if (ui.veilOpen()) ui.hideVeil();
      else ui.closePanel();
    });
    kb.on("keydown", (event: KeyboardEvent) => {
      const picked = this.menu?.find((o) => o.key === event.key.toLowerCase());
      if (picked) {
        this.menu = undefined;
        picked.action();
      }
    });
    for (const n of [1, 2, 3, 4] as const) {
      kb.on(`keydown-${["ONE", "TWO", "THREE", "FOUR"][n - 1]}`, () => this.pickChoice(n));
    }
  }

  /** Boot: offer saved sessions when the server has any, else start fresh. */
  private async boot(): Promise<void> {
    const [saves, reunions] = await Promise.all([listSaves(), listReunions()]);
    const open = reunions.filter((r) => r.phase === "reunion");
    if (saves.length === 0 && open.length === 0) {
      await this.start(undefined);
      return;
    }
    // A shared world in progress goes first: someone else may already be
    // standing in it, waiting.
    const shared = open.slice(0, 2).flatMap((r, i) =>
      (["her", "his"] as const).map((role) => ({
        key: `${i === 0 ? "" : String(i + 1)}${role === "her" ? "h" : "i"}`,
        label: `the reunion — rejoin as ${role === "her" ? r.her : r.his}`,
        action: () => this.enterReunion(r.id, role),
      })),
    );
    const options = saves.slice(0, 3).map((save, i) => ({
      key: String(i + 1),
      label: `continue — ${describeSave(save)}`,
      action: () => void this.start(save.id),
    }));
    this.menu = [
      ...shared,
      ...options,
      { key: "n", label: "begin a new evening", action: () => void this.start(undefined) },
    ];
    ui.showMenu(
      "However Far",
      open.length > 0
        ? "Someone is already on the other side of this."
        : "The story remembers where you left it.",
      this.menu.map(({ key, label }) => ({ key, label })),
    );
  }

  private async start(resumeId: string | undefined): Promise<void> {
    ui.showVeil(
      "However Far",
      resumeId ? "Reopening where you left off…" : "Opening the evening…",
      "",
    );
    const { session, world } = await connect(resumeId);
    this.session = session;
    this.world = world;
    ui.hideVeil();
    this.buildArea();
    ui.showNarration(world.area.description);
  }

  override update(): void {
    if (!this.world) return;
    this.updateHud();
    if (this.moving || ui.panelState().mode !== "closed" || ui.veilOpen() || ui.sayOpen())
      return;

    this.announceNearbyPortals();

    const dir = this.heldDirection();
    if (!dir) return;
    const before = this.world.state;
    // Movement is applied locally in both modes: it only ever moves you, so
    // there is nothing for two players to disagree about. In the shared world
    // it goes through the reunion rules, which make the other person solid.
    const after = this.reunion
      ? this.stepInReunion(dir)
      : tryMove(before, this.world.area, dir);
    this.world = { ...this.world, state: after };
    if (after.pos.x !== before.pos.x || after.pos.y !== before.pos.y) {
      // In the shared world every step is broadcast: the other player is
      // watching, and a partner who teleports once a minute is not company.
      if (this.reunion) {
        this.reunion.client.send({ type: "moveTo", pos: { ...after.pos } });
      }
      this.facing = dir;
      this.player.anims.play(`walk-${dir}`, true);
      this.moving = true;
      this.tweens.add({
        targets: this.player,
        x: after.pos.x * TILE + TILE / 2,
        y: after.pos.y * TILE + TILE / 2,
        duration: MOVE_MS,
        onComplete: () => {
          this.moving = false;
          // Settle onto the standing frame unless another step is already held.
          if (!this.heldDirection()) {
            this.player.anims.stop();
            this.player.setFrame(this.idleFrame(this.facing));
          }
        },
      });
    } else {
      // Turned into a wall: face that way but stand still.
      this.facing = dir;
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(dir));
    }
  }

  /** One step through the reunion rules, keeping the shared state authoritative. */
  private stepInReunion(dir: Direction): AreaGameState {
    const reunion = this.reunion;
    const w = this.world;
    if (!reunion || !w) throw new Error("stepInReunion outside a shared world");
    const next = reunionMove(reunion.state, w.area, reunion.role, dir);
    reunion.state = next;
    return projectPlayer(next, reunion.role);
  }

  /**
   * Tell the server when the player is walking at a door it would have to
   * write, so generation starts before they arrive (Phase 6 latency). Sent
   * once per door: the server caps how much it will speculate, and a player
   * pacing back and forth should not spend the budget.
   */
  private announceNearbyPortals(): void {
    const w = this.world;
    if (!w || this.session.mode !== "server") return;
    for (const portal of w.area.portals) {
      if (portal.transition.type !== "generate") continue;
      const distance =
        Math.abs(portal.pos.x - w.state.pos.x) + Math.abs(portal.pos.y - w.state.pos.y);
      if (distance > APPROACH_RADIUS) continue;
      const key = `${w.area.id}/${portal.id}`;
      if (this.announced.has(key)) continue;
      this.announced.add(key);
      this.mirror({ type: "approach", portalId: portal.id });
    }
  }

  private heldDirection(): Direction | undefined {
    const k = this.keys;
    if (k.W.isDown || k.UP.isDown) return "up";
    if (k.S.isDown || k.DOWN.isDown) return "down";
    if (k.A.isDown || k.LEFT.isDown) return "left";
    if (k.D.isDown || k.RIGHT.isDown) return "right";
    return undefined;
  }

  private visibleEntities(): PlacedEntity[] {
    const w = this.world;
    if (!w) return [];
    return w.area.entities.filter(
      (e) =>
        !(
          e.role === "item" &&
          e.interaction?.once === true &&
          interactionUsed(w.state, w.area, e.id)
        ),
    );
  }

  /** Last position the server was told about, so we only sync when it changed. */
  private syncedPos: { x: number; y: number } | undefined;

  /**
   * Mirror an action to the authoritative server session; local play already
   * applied it.
   *
   * Movement runs client-side for responsiveness, so the server is told where
   * the player ended up BEFORE any action whose legality depends on standing
   * somewhere — otherwise the server still thinks they are on the area's spawn
   * and every portal refuses to open.
   */
  private mirror(action: Parameters<typeof sendAction>[1]): void {
    // In the shared world the socket is the only channel, and the server is
    // authoritative for everything except where you personally are standing.
    if (this.reunion) {
      this.reunion.client.send(action);
      return;
    }
    if (this.session.mode !== "server") return;
    const pos = this.world?.state.pos;
    if (
      pos &&
      action.type !== "moveTo" &&
      (this.syncedPos?.x !== pos.x || this.syncedPos?.y !== pos.y)
    ) {
      this.syncedPos = { ...pos };
      void sendAction(this.session, { type: "moveTo", pos: { ...pos } }).catch(() => {
        // Let the real action try anyway; a stale position fails loudly there.
        this.syncedPos = undefined;
      });
    }
    void sendAction(this.session, action).catch(() => {
      // The optimistic local engine result stands; signals catch up next action.
    });
  }

  /** Open the free-text line — the player acting in their own words. */
  private trySay(): void {
    if (
      !this.world ||
      ui.panelState().mode !== "closed" ||
      ui.veilOpen() ||
      ui.sayOpen() ||
      this.moving
    )
      return;
    ui.openSay((text) => this.submitSay(text));
  }

  private submitSay(text: string): void {
    if (this.session.mode !== "server") {
      ui.showNarration(
        "You say it into the evening air. Without the game server, no one is writing this down — start it, and your words will shape the story.",
      );
      return;
    }
    // The reply is written prose, so it arrives a word at a time rather than
    // after a silence (Phase 6). The panel opens empty and fills.
    ui.beginStreamingNarration();
    void streamAction(
      this.session,
      { type: "freeText", text },
      { onChunk: (chunk) => ui.appendNarration(chunk) },
    )
      .then((result) => {
        if (result.kind === "ok") {
          if (this.world) this.world = { ...this.world, state: result.state };
          ui.endStreamingNarration(
            result.ack ?? "The moment takes what you said and keeps it.",
          );
        }
      })
      .catch(() => {
        ui.endStreamingNarration(
          "Your words scattered before they landed — say it again.",
        );
      });
  }

  /**
   * Dress a stage of the Director's work as a moment in the story (Phase 6).
   * The lines are authored content, picked from the door being opened so the
   * same door always opens with the same words.
   */
  private showStage(stage: TurnStage, seed: string): void {
    const path = this.world?.area.path ?? "shared";
    const passage = interstitialFor(path, stage);
    ui.showInterstitial(
      passage.title,
      passage.lines,
      interstitialStart(seed, passage.lines.length),
    );
  }

  private tryInteract(): void {
    const w = this.world;
    if (!w || ui.panelState().mode !== "closed" || ui.veilOpen() || ui.sayOpen() || this.moving)
      return;
    const target = reachableEntities(w.state, w.area)[0];
    if (!target) return;
    const outcome = runInteraction(w.state, w.area, target.id);
    this.world = { ...w, state: outcome.state };
    if (outcome.kind === "afterText") {
      ui.showNarration(outcome.text);
    } else {
      const names = new Map(w.area.entities.map((e) => [e.id, e.name]));
      ui.showDialogue(outcome.lines, outcome.choices, names, target.id);
    }
    this.mirror({ type: "interact", entityId: target.id });
    this.redrawEntities();
  }

  private pickChoice(n: number): void {
    const w = this.world;
    if (!w) return;
    const picked = ui.choiceAt(n);
    if (!picked) return;
    // A gamble you cannot pay for is not offered — the engine would throw.
    if (!choiceAffordable(w.state, picked.choice)) return;

    const { state, reply, check } = applyConvoChoice(
      w.state,
      w.area,
      picked.entityId,
      picked.choice.id,
    );
    this.world = { ...w, state };
    const speaker = ui.displayName(
      picked.entityId,
      w.area.entities.find((e) => e.id === picked.entityId)?.name ?? "",
    );
    // A check's own prose is the real outcome, so it wins over the choice's
    // reply when both exist.
    const text = check ? check.text : reply;
    if (text !== undefined) ui.showReply(speaker, text, check);
    else ui.closePanel();
    this.mirror({ type: "convoChoice", entityId: picked.entityId, choiceId: picked.choice.id });
  }

  private tryPortal(): void {
    const w = this.world;
    if (!w || ui.panelState().mode !== "closed" || ui.veilOpen() || ui.sayOpen() || this.moving)
      return;
    const portal = portalUnderPlayer(w.state, w.area);
    if (!portal) return;

    if (this.reunion) {
      // Both of them go through together, so the server decides and tells
      // them both; there is nothing sensible to apply optimistically here.
      const seed = `${w.area.id}/${portal.id}`;
      if (portal.transition.type !== "area") {
        this.showStage(portal.transition.type === "ending" ? "closing" : "writing", seed);
      }
      this.reunion.client.send({ type: "portal", portalId: portal.id });
      return;
    }

    if (this.session.mode === "server") {
      const seed = `${w.area.id}/${portal.id}`;
      if (portal.transition.type !== "area") {
        // Cover the wait from the first frame: the stage events refine what is
        // on screen, but the door must not open onto a blank pause.
        this.showStage(portal.transition.type === "ending" ? "closing" : "writing", seed);
      }
      const session = this.session;
      const portalId = portal.id;
      // Movement is applied locally in server mode, so the server still thinks
      // we are standing on the area's spawn. A portal's legality depends on
      // where we ACTUALLY are, so tell the server first — and await it, so the
      // sync cannot race the portal request (which bypasses mirror()). Without
      // this, every door away from spawn refuses with "not standing on portal".
      const pos = { ...w.state.pos };
      void (async () => {
        try {
          await sendAction(session, { type: "moveTo", pos });
          this.syncedPos = pos;
          const result = await streamAction(
            session,
            { type: "portal", portalId },
            { onStage: (stage) => this.showStage(stage, seed) },
          );
          ui.hideVeil();
          if (result.kind === "area") {
            this.world = { area: result.area, state: result.state };
            this.buildArea();
            ui.showNarration(result.area.description);
          } else if (result.kind === "threshold") {
            this.reachedThreshold(result.summary, result.ending);
          }
        } catch (err: unknown) {
          const message =
            err instanceof ServerError
              ? err.message
              : "The world resisted being written just now — try again.";
          ui.showVeil("The pen hesitates.", message, "esc · step back and try again");
        }
      })();
      return;
    }

    const result = followTransition(w, portal.transition, portal.label);
    if (result.kind === "moved") {
      this.world = result.world;
      this.buildArea();
      ui.showNarration(result.world.area.description);
    } else if (result.kind === "unwritten") {
      ui.showVeil(
        "Here, the story is unwritten.",
        `You chose ${result.portalLabel}. Beyond this door, nothing exists yet — the AI Director writes it the moment you step through, shaped by everything you just did. (Start the game server to continue past this point.)`,
        "esc · step back from the threshold",
      );
    } else {
      ui.showVeil("An ending.", result.hint, "esc · back");
    }
  }

  /**
   * The path ends. The finale is authored prose, not a one-line hint, so it
   * gets the whole veil — and then, once they have had it, the one thing this
   * ending does not do is close the story. STORY.md is explicit: a solo path
   * stops at a threshold. The way past it is the other player.
   */
  private reachedThreshold(summary: string, ending?: ThresholdEnding): void {
    ui.showVeil(
      ending?.title ?? "A threshold.",
      ending?.closingText ?? summary,
      "space · and then?",
    );
    const path = this.world?.area.path;
    const side: SoloPath | undefined = path === "her" || path === "his" ? path : undefined;
    if (!side || this.session.mode !== "server" || !this.session.id) return;

    this.menu = [
      {
        key: " ",
        label: "",
        action: () => this.offerTheCall(side, ending?.threshold ?? summary),
      },
    ];
  }

  /** The Call: the other side of the story, and the only way past the threshold. */
  private offerTheCall(path: SoloPath, threshold: string): void {
    this.menu = [
      { key: "r", label: "reach for them", action: () => void this.runCall(path) },
      {
        key: "n",
        label: "not yet — sit with it",
        action: () => ui.showVeil("A threshold.", threshold, ""),
      },
    ];
    ui.showMenu(
      path === "her" ? "You cannot cross alone." : "You cannot reach her alone.",
      path === "her"
        ? "The way home is right there and it will not open for one pair of hands. Somewhere on the other side of it, someone spent this whole time looking for you. The Reunion is the two of you working the same crossing at once — and it only opens if you both reach."
        : "You know where she is now. Knowing turns out not to be a door. But she is standing at one, on the far side, and it will not open for one pair of hands either. The Reunion is the two of you working the same crossing at once — and it only opens if you both reach.",
      this.menu.map(({ key, label }) => ({ key, label })),
    );
  }

  private async runCall(path: SoloPath): Promise<void> {
    const veil = document.getElementById("veil");
    if (!veil || !this.session.id) return;
    const draft = await showCall(path, veil);
    if (!draft) {
      ui.showVeil("Not yet.", "The bell keeps. It has waited longer than this.", "");
      return;
    }
    ui.showVeil("Sending.", "Putting your name to it.", "");
    try {
      const playthrough = await fetchExport(this.session.id, draft.self.name);
      const result = await placeCall(draft, path, playthrough);
      if (result.kind === "refused") {
        this.callRefused(result.message, path, draft);
        return;
      }
      if (result.kind === "paired") {
        this.enterReunion(result.reunionId, result.role);
        return;
      }
      this.waitForAnswer(draft, path);
    } catch (err) {
      this.callRefused(
        err instanceof Error ? err.message : "the call did not carry",
        path,
        draft,
      );
    }
  }

  private callRefused(message: string, path: SoloPath, draft: CallDraft): void {
    this.menu = [
      { key: "r", label: "try again", action: () => void this.runCall(path) },
      {
        key: "n",
        label: "leave it for now",
        action: () => ui.showVeil("Not yet.", "The bell keeps.", ""),
      },
    ];
    ui.showMenu(
      "It did not carry.",
      `${message}${draft.calling.email ? ` (reaching for ${draft.calling.email})` : ""}`,
      this.menu.map(({ key, label }) => ({ key, label })),
    );
  }

  /**
   * Waiting for the other side. Deliberately not a spinner either: a player
   * who has just finished this story is very good at waiting, and the game
   * says so.
   */
  private waitForAnswer(draft: CallDraft, path: SoloPath): void {
    ui.showInterstitial(
      path === "her" ? "Rung." : "Written in.",
      [
        `It is out there now, with ${draft.calling.name}'s name in it.`,
        "Nothing to do but wait, which by now you are good at.",
        "The moment they reach back, this opens.",
        "You can close the game. It keeps. It has kept this long.",
      ],
      0,
    );
    const started = Date.now();
    const tick = async (): Promise<void> => {
      const answer = await pollCall(draft.self.email);
      if (answer) {
        this.enterReunion(answer.reunionId, answer.role);
        return;
      }
      // Slow down after the first few minutes: this is a wait measured in
      // days, not seconds, and hammering someone's laptop helps nobody.
      const elapsed = Date.now() - started;
      const delay = elapsed < 5 * 60_000 ? 5_000 : 60_000;
      if (this.reunion) return;
      window.setTimeout(() => void tick(), delay);
    };
    window.setTimeout(() => void tick(), 3_000);
  }

  /** Open the shared world. From here the socket owns the game. */
  private enterReunion(reunionId: string, role: ReunionRole): void {
    if (this.reunion) return;
    ui.showInterstitial(
      "Someone reached back.",
      [
        "The bell has something to ring against.",
        "Two sides of one place, being written into the same room.",
      ],
      0,
    );
    const client = new ReunionClient(reunionId, role, {
      onWelcome: ({ area, state, ending }) => {
        ui.hideVeil();
        this.reunion = { client, role, state };
        this.world = { area, state: projectPlayer(state, role) };
        this.buildArea();
        if (ending) {
          ui.showVeil(ending.title, ending.closingText, "");
          return;
        }
        ui.showNarration(area.description);
      },
      onTurn: ({ result }) => this.applySharedTurn(result),
      onPresence: (state) => {
        if (!this.reunion) return;
        this.reunion.state = state;
        if (this.world) {
          this.world = { ...this.world, state: projectPlayer(state, this.reunion.role) };
        }
        this.redrawEntities();
      },
      onStage: (stage) =>
        this.showStage(stage, this.world?.area.id ?? "reunion"),
      onChunk: (text) => ui.appendNarration(text),
      onError: (message) => ui.showVeil("A snag.", message, "esc · back"),
      onClosed: () => {
        if (!this.reunion) return;
        ui.showVeil(
          "The line went quiet.",
          "The connection to the shared world dropped. Nothing is lost — reload to step back in.",
          "",
        );
      },
    });
    client.connect();
  }

  private applySharedTurn(
    result:
      | { kind: "area"; area: AreaSpec; state: ReunionGameState }
      | { kind: "ok"; state: ReunionGameState; ack?: string }
      | { kind: "ending"; summary: string; ending?: ReunionEnding },
  ): void {
    const reunion = this.reunion;
    if (!reunion) return;
    if (result.kind === "ending") {
      ui.showVeil(
        result.ending?.title ?? "Together.",
        result.ending?.closingText ?? result.summary,
        "",
      );
      return;
    }
    reunion.state = result.state;
    const projected = projectPlayer(result.state, reunion.role);
    if (result.kind === "area") {
      ui.hideVeil();
      this.world = { area: result.area, state: projected };
      this.buildArea();
      ui.showNarration(result.area.description);
      return;
    }
    if (this.world) this.world = { ...this.world, state: projected };
    if (result.ack) ui.endStreamingNarration(result.ack);
    this.redrawEntities();
  }

  private buildArea(): void {
    if (!this.world) return;
    this.announced.clear();
    // A new area re-spawns the player on both sides; nothing to sync yet.
    this.syncedPos = undefined;
    const area = this.world.area;
    this.mapLayer?.destroy();
    this.entityLayer?.destroy();
    this.player?.destroy();

    this.mapLayer = this.add.container(0, 0);
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        const tile = area.tiles[area.ground[y]?.[x] ?? 0];
        if (!tile) continue;
        // A generated pixel texture in the tile's own colour (tiles.ts) rather
        // than a flat rectangle.
        const key = ensureTileTexture(this, tile);
        const img = this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, key);
        this.mapLayer.add(img);
      }
    }

    this.entityLayer = this.add.container(0, 0);
    this.redrawEntities();

    const spawn = this.world.state.pos;
    this.player = this.add
      .sprite(spawn.x * TILE + TILE / 2, spawn.y * TILE + TILE / 2, "hero", this.idleFrame(this.facing))
      // Origin low on the frame so the character stands on the tile with the
      // head rising above it — the taller-than-a-tile look of a top-down JRPG.
      .setOrigin(0.5, 0.78)
      .setDepth(10);

    const cam = this.cameras.main;
    cam.setBounds(
      Math.min(0, (area.width * TILE - Number(this.game.config.width)) / 2),
      Math.min(0, (area.height * TILE - Number(this.game.config.height)) / 2),
      Math.max(area.width * TILE, Number(this.game.config.width)),
      Math.max(area.height * TILE, Number(this.game.config.height)),
    );
    cam.centerOn((area.width * TILE) / 2, (area.height * TILE) / 2);
  }

  private redrawEntities(): void {
    if (!this.world) return;
    this.entityLayer.removeAll(true);
    for (const entity of this.visibleEntities()) {
      const color = Phaser.Display.Color.HexStringToColor(entity.color ?? "#94b0c2").color;
      const size = entity.role === "item" ? TILE - 26 : TILE - 12;
      const rect = this.add
        .rectangle(
          entity.pos.x * TILE + TILE / 2,
          entity.pos.y * TILE + TILE / 2,
          size,
          size,
          color,
        )
        .setStrokeStyle(1, 0x000000, 0.5);
      const label = this.add
        .text(entity.pos.x * TILE + TILE / 2, entity.pos.y * TILE - 4, ui.displayName(entity.id, entity.name), {
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: "10px",
          color: "#e8e6df",
        })
        .setOrigin(0.5, 1)
        .setShadow(0, 1, "#000000", 2);
      this.entityLayer.add(rect);
      this.entityLayer.add(label);
    }
    this.drawPartner();
    for (const portal of this.world!.area.portals) {
      const marker = this.add
        .rectangle(
          portal.pos.x * TILE + TILE / 2,
          portal.pos.y * TILE + TILE / 2,
          TILE - 8,
          TILE - 8,
        )
        .setStrokeStyle(2, 0xffcd75, 0.9);
      this.entityLayer.add(marker);
    }
    this.entityLayer.setDepth(5);
  }

  /**
   * The other player. Drawn from the shared state rather than as an area
   * entity, because they are not furniture — and only while they are actually
   * attached, so a dropped connection reads as an empty room rather than a
   * ghost standing still.
   */
  private drawPartner(): void {
    const reunion = this.reunion;
    if (!reunion) return;
    const partner = reunion.role === "her" ? reunion.state.his : reunion.state.her;
    if (!partner.connected) return;

    const x = partner.pos.x * TILE + TILE / 2;
    const y = partner.pos.y * TILE + TILE / 2;
    const sprite = this.add
      .sprite(x, y, "hero", this.idleFrame("down"))
      .setOrigin(0.5, 0.78)
      // A cool tint so the two players read apart at a glance.
      .setTint(0xbfd4ff);
    const label = this.add
      .text(x, partner.pos.y * TILE - 4, partner.name, {
        fontFamily: "ui-monospace, Consolas, monospace",
        fontSize: "10px",
        color: "#8fd3ff",
      })
      .setOrigin(0.5, 1)
      .setShadow(0, 1, "#000000", 2);
    this.entityLayer.add(sprite);
    this.entityLayer.add(label);
  }

  private updateHud(): void {
    const w = this.world;
    if (!w) return;
    ui.setSheet(w.state.sheet);
    ui.setQuests(w.state.quests);
    ui.setMetaFx(w.state.metaFx);
    ui.setAffordability((choice) => choiceAffordable(w.state, choice));
    let prompt = "wasd / arrows · move   t · speak";
    if (ui.veilOpen()) prompt = "";
    else if (ui.sayOpen()) prompt = "enter · say it   esc · never mind";
    else if (ui.panelState().mode !== "closed") prompt = "";
    else {
      const portal = portalUnderPlayer(w.state, w.area);
      const target = reachableEntities(w.state, w.area)[0];
      if (portal) prompt = `enter · ${portal.label}`;
      else if (target?.interaction) prompt = `e · ${target.interaction.verb} — ${target.name}`;
    }
    const inv = w.state.inventory;
    const invText = inv.length > 0 ? `   [${inv.map((i) => i.name).join(", ")}]` : "";
    ui.setHud(`${w.area.name}${invText}`, prompt);
  }
}
