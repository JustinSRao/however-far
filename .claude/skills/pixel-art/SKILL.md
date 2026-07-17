---
name: pixel-art
description: Use when working on the art pipeline — art requests in the DSL, style bibles, image-model generation, pixelization/palette post-processing, asset caching, or placeholder rendering.
---

# Pixel-art pipeline

Goal: independently generated images that read as one game. The trick is that *pixel-art
post-processing is a normalizer* — grid + palette quantization hides most cross-generation
inconsistency, which is why this style was chosen (ADR-0005).

## Pipeline invariants

- The Director emits **art requests** (structured: kind, subject, mood, sizeClass,
  paletteRef), never images and never raw image-model prompts. Prompt construction from a
  request is deterministic server code.
- Every universe has one **style bible** (palette ≤ 32 colors, grid size, outline rule,
  perspective, era/mood keywords), authored by the Director once at genre-reveal and then
  locked. All art prompts derive from it.
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
