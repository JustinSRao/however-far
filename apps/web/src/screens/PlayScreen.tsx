import type { ReactElement } from "react";
import type { SceneSpec } from "@unwritten/schema";
import { SceneView } from "../components/SceneView.js";

export interface PlayScreenProps {
  sessionId: string;
  scene: SceneSpec;
  busy: boolean;
  error: string | null;
  ackText: string | null;
  onChoice: (choiceId: string) => void;
  onFreeText: (text: string) => void;
  onBackToStart: () => void;
}

/** True for the hand-written opening every player shares (see docs/ARCHITECTURE.md — the Anchor). */
function isAnchorScene(sceneId: string): boolean {
  return sceneId.startsWith("anchor-");
}

export function PlayScreen({
  sessionId,
  scene,
  busy,
  error,
  ackText,
  onChoice,
  onFreeText,
  onBackToStart,
}: PlayScreenProps): ReactElement {
  return (
    <div className="play">
      <div className="play__topbar">
        <button type="button" className="link-button" onClick={onBackToStart}>
          ‹ Save & back to start
        </button>
        <span className="dim">{isAnchorScene(scene.id) ? "the Anchor" : "being written"}</span>
      </div>

      {error ? <p className="banner banner--error">{error}</p> : null}
      {ackText ? <p className="banner banner--ack">{ackText}</p> : null}

      <SceneView
        sessionId={sessionId}
        scene={scene}
        busy={busy}
        onChoice={onChoice}
        onFreeText={onFreeText}
      />

      {busy ? <p className="awaiting">…the world is being written…</p> : null}
    </div>
  );
}
