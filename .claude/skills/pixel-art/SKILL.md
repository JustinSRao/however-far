---
name: pixel-art
description: Use when working on the art pipeline — art requests in the DSL, style bibles, image-model generation, pixelization/palette post-processing, asset caching, or placeholder rendering.
---

# Pixel-art pipeline

Goal: independently generated images that read as one game. The trick is that *pixel-art
post-processing is a normalizer* — grid + palette quantization hides most cross-generation
inconsistency, which is why this style was chosen (ADR-0005).

Since the pivot (ADR-0011), art comes from three sources — CC0 imports, model-emitted
sprite data, and gpt-image-2 — all gated through the Asset Studio (see the `asset-studio`
skill for operating it). This skill covers the pipeline code itself.

## Pipeline invariants

- The Director emits **art requests** (structured: kind, subject, mood, sizeClass,
  paletteRef), never images and never raw image-model prompts. Prompt construction from a
  request is deterministic server code.
- There are two **style bibles** (palette ≤ 32 colors, grid size, outline rule,
  perspective, era/mood keywords) — one per story path (her fantasy world / his real
  world) — authored at development time and locked (ADR-0011). All art prompts derive
  from the target path's bible.
- Post-processing is mandatory and deterministic: downscale to grid → quantize to the
  universe palette → optional outline. Raw model output never reaches the client.
- Cache key = `hash(canonicalized request + style bible + pipeline version)`. Same
  character, same art, forever. Bump pipeline version to invalidate globally.
- Placeholder-first: the engine renders procedural placeholders (silhouette + palette)
  immediately; real assets swap in when ready. No gameplay path may block on image
  generation.

## Practical notes

- Sprites need transparent backgrounds — request "isolated subject, flat background" and
  chroma-key in post; check alpha coverage before caching.
- Consistent recurring characters: include the character's *canonical visual description*
  (a canon fact, extracted at first appearance) in every request for that character.
- Keep a visual eval page (grid of generated assets per style bible) — cohesion is judged
  by eyes, so make the eyes' job easy.
- Image model choice is config, not code: expect to swap models; the post-processing step
  is what owns the look.
