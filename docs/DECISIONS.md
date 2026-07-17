# Architecture Decision Records

Append-only. New decisions get the next number. Reversals are new ADRs that supersede old
ones — never edit history.

---

## ADR-0001: The AI authors content (data), never runtime code

**Status:** Accepted · 2026-07-17

The Director emits schema-validated SceneSpecs; a fixed deterministic engine renders them.
The AI never generates executable code during play.

**Why:** Models are excellent authors and unreliable runtime programmers. Validated data
can be rejected and regenerated invisibly; broken generated code crashes the game. This is
the difference between "always playable" and a tech demo.

**Consequence:** New interaction types require engine + DSL work first. Expressiveness
grows deliberately, at development time.

## ADR-0002: TypeScript monorepo, web-first

**Status:** Accepted · 2026-07-17

One language across client/server/schema (npm workspaces). Client is browser-based
(React + PixiJS). **Why:** the schema package must be shared verbatim between Director
(server) and renderer (client); web distribution makes the public library trivially
accessible; PixiJS is a proven pixel-art renderer.

## ADR-0003: Claude API, Opus 4.8 default, Haiku for checks

**Status:** Accepted · 2026-07-17

Director stages use `claude-opus-4-8` (adaptive thinking, streaming, structured outputs);
the Continuity Checker uses `claude-haiku-4-5`. **Why:** the Director's authoring quality
*is* the product — don't downgrade it; continuity diffing is a cheap classification-shaped
task. Revisit model choices as new models ship; the model IDs live in one config module so
swaps are one-line.

## ADR-0004: Canon is an append-only ledger

**Status:** Accepted · 2026-07-17

Established facts are never edited or deleted. In-world changes are new facts that
reference and supersede old ones ("the inn burned down" doesn't delete "the inn exists").

**Why:** contradiction detection needs a stable ground truth; exports need a complete
history; append-only makes the continuity check a diff problem instead of a state-sync
problem.

## ADR-0005: Text-first, art as progressive enhancement

**Status:** Accepted · 2026-07-17

Phases 1–2 prove the loop with text only. The art pipeline (Phase 3) attaches to art
requests already present in the DSL and renders placeholder-first — the game is never
blocked waiting on an image. **Why:** the core risk is coherent real-time authorship, not
rendering; pixel-art post-processing (grid + palette quantization) makes independently
generated images cohere, which full-res art styles do not.

## ADR-0006: Published universes fix the arc, regenerate the moments

**Status:** Accepted · 2026-07-17

A library replay loads the creator's canon + arc as immutable constraints; scenes,
dialogue, and minor characters are regenerated per player. **Why:** this is the identity
of the product — "the same game, but your playthrough" — and it keeps replay cost bounded
(asset cache ships with the bundle; heavy planning work is already done).
