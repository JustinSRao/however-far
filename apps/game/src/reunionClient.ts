import type {
  AreaAction,
  AreaSpec,
  ReunionEnding,
  ReunionGameState,
  ReunionRole,
  TurnStage,
} from "@howeverfar/schema";

/**
 * The client half of the shared world (Phase 7).
 *
 * A socket rather than request/response, because for the first time there is
 * someone else on the other end: both players have to see the other move, and
 * either of them can be the one who opens the next door.
 *
 * Authority is not shared. Movement is applied locally for responsiveness —
 * it only ever moves you — and everything else is sent and awaited, because
 * two people acting on one world cannot both be right about who took the
 * lantern.
 */

export interface ReunionHandlers {
  onWelcome: (msg: {
    role: ReunionRole;
    area: AreaSpec;
    state: ReunionGameState;
    ending?: ReunionEnding;
  }) => void;
  /** Any turn, by either player. */
  onTurn: (msg: {
    by: ReunionRole;
    result:
      | { kind: "area"; area: AreaSpec; state: ReunionGameState }
      | { kind: "ok"; state: ReunionGameState; ack?: string }
      | { kind: "ending"; summary: string; ending?: ReunionEnding };
  }) => void;
  /** Someone attached or dropped. */
  onPresence: (state: ReunionGameState) => void;
  onStage: (stage: TurnStage) => void;
  onChunk: (text: string) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export class ReunionClient {
  private socket: WebSocket | undefined;

  constructor(
    private readonly reunionId: string,
    private readonly role: ReunionRole,
    private readonly handlers: ReunionHandlers,
  ) {}

  connect(): void {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}/api/reunions/${this.reunionId}/play?role=${this.role}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (msg["type"]) {
        case "welcome":
          this.handlers.onWelcome(
            msg as unknown as Parameters<ReunionHandlers["onWelcome"]>[0],
          );
          return;
        case "turn":
          this.handlers.onTurn(msg as unknown as Parameters<ReunionHandlers["onTurn"]>[0]);
          return;
        case "presence":
          this.handlers.onPresence(msg["state"] as ReunionGameState);
          return;
        case "stage":
          this.handlers.onStage(msg["stage"] as TurnStage);
          return;
        case "chunk":
          this.handlers.onChunk(String(msg["text"] ?? ""));
          return;
        case "error":
          this.handlers.onError(String(msg["message"] ?? "something went wrong"));
          return;
        default:
          return;
      }
    });

    socket.addEventListener("close", () => this.handlers.onClosed());
    socket.addEventListener("error", () =>
      this.handlers.onError("The connection to the other side faltered."),
    );
  }

  send(action: AreaAction): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ action }));
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}
