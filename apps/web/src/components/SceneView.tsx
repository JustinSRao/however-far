import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { ArtRequest, Entity, SceneSpec } from "@unwritten/schema";
import { ArtSlot } from "./ArtSlot.js";
import { useTypewriter } from "../useTypewriter.js";

export interface SceneViewProps {
  sessionId: string;
  scene: SceneSpec;
  busy: boolean;
  onChoice: (choiceId: string) => void;
  onFreeText: (text: string) => void;
}

function speakerName(scene: SceneSpec, speakerId: string): string {
  if (speakerId === "narrator") return "";
  return scene.entities.find((e) => e.id === speakerId)?.name ?? speakerId;
}

function hasArt(e: Entity): e is Entity & { art: ArtRequest } {
  return e.art !== undefined;
}

export function SceneView({
  sessionId,
  scene,
  busy,
  onChoice,
  onFreeText,
}: SceneViewProps): ReactElement {
  const [freeText, setFreeText] = useState("");
  const { shown: narration, done: narrationDone } = useTypewriter(scene.narration, true);

  // Fresh input for a fresh scene.
  useEffect(() => {
    setFreeText("");
  }, [scene.id]);

  const entityArt = scene.entities.filter(hasArt);

  function submitFreeText(e: FormEvent): void {
    e.preventDefault();
    const text = freeText.trim();
    if (!text || busy) return;
    onFreeText(text);
  }

  return (
    <div className="scene">
      <header className="scene__header">
        <h1 className="scene__title">{scene.title}</h1>
        <p className="scene__location">{scene.location.name}</p>
      </header>

      {scene.location.art ? (
        <ArtSlot
          sessionId={sessionId}
          request={scene.location.art}
          label={scene.location.name}
        />
      ) : null}

      <p className="scene__narration">
        {narration}
        {!narrationDone ? <span className="scene__cursor" aria-hidden="true" /> : null}
      </p>

      {entityArt.length > 0 ? (
        <div className="scene__entities">
          {entityArt.map((e) => (
            <ArtSlot key={e.id} sessionId={sessionId} request={e.art} label={e.name} />
          ))}
        </div>
      ) : null}

      {scene.dialogue.length > 0 ? (
        <div className="scene__dialogue">
          {scene.dialogue.map((line, i) => {
            const name = speakerName(scene, line.speakerId);
            return (
              <p key={i} className="scene__line">
                {name ? <span className="scene__speaker">{name}</span> : null}
                <span className="scene__quote">{name ? `"${line.text}"` : line.text}</span>
              </p>
            );
          })}
        </div>
      ) : null}

      <div className="scene__choices">
        {scene.choices.map((choice, i) => (
          <button
            key={choice.id}
            type="button"
            className="choice-button"
            disabled={busy}
            onClick={() => onChoice(choice.id)}
          >
            <span className="choice-button__index">{i + 1}</span>
            <span className="choice-button__label">{choice.label}</span>
          </button>
        ))}
      </div>

      {scene.freeText.enabled ? (
        <form className="scene__freetext" onSubmit={submitFreeText}>
          <input
            type="text"
            value={freeText}
            disabled={busy}
            maxLength={500}
            placeholder={scene.freeText.placeholder ?? "…or do something else"}
            onChange={(e) => setFreeText(e.target.value)}
          />
          <button type="submit" disabled={busy || !freeText.trim()}>
            Act
          </button>
        </form>
      ) : null}
    </div>
  );
}
