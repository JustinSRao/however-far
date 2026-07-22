import Phaser from "phaser";
import type { AreaSpec, PlacedEntity } from "@unwritten/schema";
import {
  applyConvoChoice,
  interactionUsed,
  portalUnderPlayer,
  reachableEntities,
  runInteraction,
  tryMove,
  type Direction,
} from "./deps.js";
import {
  connect,
  followTransition,
  sendAction,
  ServerError,
  type Session,
  type World,
} from "./world.js";
import * as ui from "./ui.js";

export const TILE = 48;
const MOVE_MS = 140;

/**
 * Presentation + input only (ADR-0010): every rule goes through the engine;
 * this scene draws state and forwards key presses.
 */
export class PlayScene extends Phaser.Scene {
  private world?: World;
  private session: Session = { mode: "local" };
  private player!: Phaser.GameObjects.Rectangle;
  private mapLayer!: Phaser.GameObjects.Container;
  private entityLayer!: Phaser.GameObjects.Container;
  private moving = false;
  private keys!: Record<"W" | "A" | "S" | "D" | "UP" | "LEFT" | "DOWN" | "RIGHT", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("play");
  }

  create(): void {
    void connect().then(({ session, world }) => {
      this.session = session;
      this.world = world;
      ui.hideVeil();
      this.buildArea();
      ui.showNarration(world.area.description);
    });

    const kb = this.input.keyboard;
    if (!kb) throw new Error("keyboard input unavailable");
    this.keys = kb.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT") as PlayScene["keys"];

    kb.on("keydown-SPACE", (event: KeyboardEvent) => {
      event.preventDefault();
      if (ui.veilOpen()) return;
      ui.advancePanel();
    });
    kb.on("keydown-E", () => this.tryInteract());
    kb.on("keydown-ENTER", () => this.tryPortal());
    kb.on("keydown-ESC", () => {
      if (ui.veilOpen()) ui.hideVeil();
      else ui.closePanel();
    });
    for (const n of [1, 2, 3, 4] as const) {
      kb.on(`keydown-${["ONE", "TWO", "THREE", "FOUR"][n - 1]}`, () => this.pickChoice(n));
    }

    ui.showVeil("Unwritten", "Opening the evening…", "");
  }

  override update(): void {
    if (!this.world) return;
    this.updateHud();
    if (this.moving || ui.panelState().mode !== "closed" || ui.veilOpen()) return;

    const dir = this.heldDirection();
    if (!dir) return;
    const before = this.world.state;
    const after = tryMove(before, this.world.area, dir);
    this.world = { ...this.world, state: after };
    if (after.pos.x !== before.pos.x || after.pos.y !== before.pos.y) {
      this.moving = true;
      this.tweens.add({
        targets: this.player,
        x: after.pos.x * TILE + TILE / 2,
        y: after.pos.y * TILE + TILE / 2,
        duration: MOVE_MS,
        onComplete: () => {
          this.moving = false;
        },
      });
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

  /** Mirror an action to the authoritative server session; local play already applied it. */
  private mirror(action: Parameters<typeof sendAction>[1]): void {
    if (this.session.mode !== "server") return;
    void sendAction(this.session, action).catch(() => {
      // The optimistic local engine result stands; signals catch up next action.
    });
  }

  private tryInteract(): void {
    const w = this.world;
    if (!w || ui.panelState().mode !== "closed" || ui.veilOpen() || this.moving) return;
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
    const { state, reply } = applyConvoChoice(
      w.state,
      w.area,
      picked.entityId,
      picked.choice.id,
    );
    this.world = { ...w, state };
    const speaker = w.area.entities.find((e) => e.id === picked.entityId)?.name ?? "";
    if (reply !== undefined) ui.showReply(speaker, reply);
    else ui.closePanel();
    this.mirror({ type: "convoChoice", entityId: picked.entityId, choiceId: picked.choice.id });
  }

  private tryPortal(): void {
    const w = this.world;
    if (!w || ui.panelState().mode !== "closed" || ui.veilOpen() || this.moving) return;
    const portal = portalUnderPlayer(w.state, w.area);
    if (!portal) return;

    if (this.session.mode === "server") {
      if (portal.transition.type === "generate") {
        ui.showVeil(
          "The story is being written.",
          `You chose ${portal.label}. What lies beyond has never existed until now — it is being authored for you, out of everything you just did.`,
          "",
        );
      }
      void sendAction(this.session, { type: "portal", portalId: portal.id })
        .then((result) => {
          ui.hideVeil();
          if (result.kind === "area") {
            this.world = { area: result.area, state: result.state };
            this.buildArea();
            ui.showNarration(result.area.description);
          } else if (result.kind === "threshold") {
            ui.showVeil("A threshold.", result.summary, "esc · back");
          }
        })
        .catch((err: unknown) => {
          const message =
            err instanceof ServerError
              ? err.message
              : "The world resisted being written just now — try again.";
          ui.showVeil("The pen hesitates.", message, "esc · step back and try again");
        });
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

  private buildArea(): void {
    if (!this.world) return;
    const area = this.world.area;
    this.mapLayer?.destroy();
    this.entityLayer?.destroy();
    this.player?.destroy();

    this.mapLayer = this.add.container(0, 0);
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        const tile = area.tiles[area.ground[y]?.[x] ?? 0];
        if (!tile) continue;
        const color = Phaser.Display.Color.HexStringToColor(tile.color).color;
        const rect = this.add
          .rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, color)
          .setStrokeStyle(1, 0x000000, 0.18);
        this.mapLayer.add(rect);
      }
    }

    this.entityLayer = this.add.container(0, 0);
    this.redrawEntities();

    const spawn = this.world.state.pos;
    this.player = this.add
      .rectangle(spawn.x * TILE + TILE / 2, spawn.y * TILE + TILE / 2, TILE - 14, TILE - 10, 0xe8e6df)
      .setStrokeStyle(2, 0xffcd75, 1)
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
        .text(entity.pos.x * TILE + TILE / 2, entity.pos.y * TILE - 4, entity.name, {
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: "10px",
          color: "#e8e6df",
        })
        .setOrigin(0.5, 1)
        .setShadow(0, 1, "#000000", 2);
      this.entityLayer.add(rect);
      this.entityLayer.add(label);
    }
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

  private updateHud(): void {
    const w = this.world;
    if (!w) return;
    let prompt = "wasd / arrows · move";
    if (ui.veilOpen()) prompt = "";
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
