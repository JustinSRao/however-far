import { useEffect, useState, type ReactElement } from "react";
import type { ArtRequest } from "@unwritten/schema";
import { artUrl } from "../api.js";

export interface ArtSlotProps {
  sessionId: string;
  request: ArtRequest;
  label?: string;
}

/**
 * Renders the asset the art pipeline produced for this request, falling back
 * to a labelled placeholder box whenever there is no image to show: during the
 * Anchor (the universe has no StyleBible until the genre is revealed), or if
 * the stylist degraded. The layout is identical either way, so a scene never
 * reflows when art appears or fails.
 *
 * Images are rendered pixel-exact (`image-rendering: pixelated` in the
 * stylesheet) — the pipeline already quantized them to the universe's grid and
 * palette, so any smoothing here would undo that work.
 */
export function ArtSlot({ sessionId, request, label }: ArtSlotProps): ReactElement {
  const src = artUrl(sessionId, request);
  const [failed, setFailed] = useState(false);

  // A new request means a new URL — give it a fresh chance to load.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const className = `art-slot art-slot--${request.sizeClass} art-slot--${request.kind}`;
  const caption = label ?? request.subject;

  if (failed) {
    return (
      <div className={className} title={`art request — ${request.kind}: ${request.mood}`}>
        <span className="art-slot__kind">{request.kind}</span>
        <span className="art-slot__subject">{caption}</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <img
        className="art-slot__image"
        src={src}
        alt={caption}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
