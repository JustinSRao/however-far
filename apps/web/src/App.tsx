import { useState, type ReactElement } from "react";
import type { SceneSpec } from "@unwritten/schema";
import { ApiError, createSession, sendAction, type CreateSessionRequest } from "./api.js";
import { StartScreen } from "./screens/StartScreen.js";
import { PlayScreen } from "./screens/PlayScreen.js";
import { EndingScreen } from "./screens/EndingScreen.js";

type View =
  | { kind: "start" }
  | { kind: "play"; sessionId: string; scene: SceneSpec }
  | { kind: "ended"; sessionId: string; summary: string };

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something slipped in the machinery — try again.";
}

export function App(): ReactElement {
  const [view, setView] = useState<View>({ kind: "start" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ackText, setAckText] = useState<string | null>(null);

  async function handleStart(req: CreateSessionRequest): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await createSession(req);
      setAckText(null);
      setView({ kind: "play", sessionId: res.sessionId, scene: res.scene });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(
    sessionId: string,
    action: Parameters<typeof sendAction>[1],
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setAckText(null);
    try {
      const result = await sendAction(sessionId, action);
      if (result.kind === "scene") {
        setView({ kind: "play", sessionId, scene: result.scene });
      } else if (result.kind === "anchorAck") {
        setAckText(result.text);
      } else {
        setView({ kind: "ended", sessionId, summary: result.summary });
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function backToStart(): void {
    setView({ kind: "start" });
    setError(null);
    setAckText(null);
  }

  if (view.kind === "start") {
    return (
      <main className="app">
        <StartScreen busy={busy} error={error} onStart={handleStart} />
      </main>
    );
  }

  if (view.kind === "play") {
    const sessionId = view.sessionId;
    return (
      <main className="app">
        <PlayScreen
          sessionId={sessionId}
          scene={view.scene}
          busy={busy}
          error={error}
          ackText={ackText}
          onChoice={(choiceId) => void handleAction(sessionId, { type: "choice", choiceId })}
          onFreeText={(text) => void handleAction(sessionId, { type: "freeText", text })}
          onBackToStart={backToStart}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <EndingScreen sessionId={view.sessionId} summary={view.summary} onRestart={backToStart} />
    </main>
  );
}
