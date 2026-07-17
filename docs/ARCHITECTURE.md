# Architecture

This document describes the system that makes a real-time AI-authored game feasible,
coherent, and always playable. Read [VISION.md](VISION.md) first.

## Overview

```
┌──────────────────────────── Client (browser) ────────────────────────────┐
│  React UI + PixiJS renderer                                              │
│  Renders SceneSpecs. Captures actions, free text, timing signals.        │
└──────────────▲──────────────────────────────────────────┬────────────────┘
               │ SceneSpec (validated JSON)               │ PlayerAction
┌──────────────┴──────────────────────────────────────────▼────────────────┐
│                          Game Server (Node/TS)                           │
│                                                                          │
│  ┌────────────┐   ┌──────────────────────────────────────────────────┐   │
│  │  Engine    │   │              AI Director (Claude API)            │   │
│  │  (deter-   │   │  Profiler → Architect → Scene Writer → Checker   │   │
│  │  ministic) │◄──┤  emits SceneSpecs, validated against the schema  │   │
│  └────────────┘   └───────▲──────────────────────────┬───────────────┘   │
│                           │ retrieval                │ commits           │
│  ┌────────────────────────┴──────────────────────────▼───────────────┐   │
│  │   World State:  Canon Ledger · Story Arc · Player Profile ·       │   │
│  │                 Scene State · Asset Cache                         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Art Pipeline: image model → pixelize/palette-lock → content-hash cache  │
└──────────────────────────────────────────────────────────────────────────┘
```

## 1. The Scene DSL — the contract

The single most important artifact in the project. A **SceneSpec** is a JSON document,
validated by Zod schemas in `packages/schema`, describing everything the engine needs to
present one scene: setting, entities, dialogue, choices, free-text affordances, effects on
state, art requests, and transition rules.

Properties:

- **Versioned.** Every SceneSpec carries `dslVersion`. Schemas only evolve additively
  within a version; breaking changes bump the version and ship with a migration. Published
  library universes must remain loadable forever.
- **Closed-world.** The DSL can only express things the engine can render. If the Director
  wants a new kind of interaction, the DSL and engine grow first (a development-time
  change), then the Director may use it.
- **Self-contained effects.** State changes are declarative (`effects: [{op: "set", ...}]`),
  never code. The engine applies them; the Director predicts them.

The DSL starts small (narration, dialogue, choices, free text, simple inventory/flags) and
grows deliberately. Expressiveness is added by engineering, richness by the model.

## 2. The Engine — deterministic and dumb on purpose

A pure function over `(GameState, SceneSpec, PlayerAction) → GameState`. It renders specs,
applies declared effects, enforces validity, and knows nothing about stories. All
intelligence lives in the Director; all reliability lives in the engine. The engine is
fully unit-testable without any AI involved.

## 3. The AI Director

A server-side orchestration layer over the Claude API. Default model:
`claude-opus-4-8` with adaptive thinking (`thinking: {type: "adaptive"}`), streaming
always on. Roles within the Director (these are prompt/pipeline stages, not necessarily
separate services):

| Stage | Job | Typical model/effort |
|---|---|---|
| **Profiler** | Turn raw play signals from the Anchor (and ongoing play) into the Player Profile | `claude-opus-4-8`, effort `low`–`medium` |
| **Architect** | Own the full-game Story Arc: acts, beats, planned ending. Revise it when play diverges; never abandon coherence | `claude-opus-4-8`, effort `high` |
| **Scene Writer** | Author the next SceneSpec(s) from the Arc + Canon + Profile + current state | `claude-opus-4-8`, effort `medium`–`high`, structured outputs (`output_config.format` with the SceneSpec JSON schema) |
| **Continuity Checker** | Cheap pass that diffs a candidate SceneSpec against the Canon Ledger and rejects contradictions before the player sees them | `claude-haiku-4-5` |

Structured outputs + Zod validation give a two-layer guarantee: the API constrains the
shape, the server validates semantics (references resolve, effects are legal, canon not
contradicted). Invalid specs are regenerated with the validation errors fed back — the
player never sees a failure, only (rarely) a beat of extra latency.

### Memory model (how coherence is maintained)

Context windows are big but playthroughs are bigger, so memory is layered:

- **Canon Ledger** — append-only list of facts committed as true ("the innkeeper's name is
  Vess", "the player burned the archive"). Facts are extracted from every accepted scene.
  Canon is never edited, only appended; retractions are new facts that explain the change
  in-world. Relevant facts are retrieved (keyword/embedding) into the Scene Writer's
  context each turn.
- **Story Arc** — the Architect's living plan for the whole game: premise, acts, upcoming
  beats, planted setups and their required payoffs, intended ending(s). Rewritten (not
  appended) when the player derails it — the plan changes, canon never does.
- **Player Profile** — structured preferences with confidence scores, updated continuously.
- **Scene State** — the mechanical `GameState` (location, flags, inventory, party), owned
  by the engine, summarized for prompts.

### Latency strategy

Real-time generation must feel like a game, not a chatbot:

- **Speculative generation.** After presenting a scene, the Director immediately generates
  likely next scenes for the top choices in the background. On action, the pre-generated
  spec is served instantly (after a fast canon re-check); free-text or unpredicted actions
  fall back to live generation with streamed narration to cover the wait.
- **Streaming everywhere.** Narration and dialogue stream token-by-token into the client —
  this is a natural fit for a text-forward game and hides most latency.
- **Prompt caching.** Requests are structured for prefix stability: frozen system prompt +
  DSL documentation first, canon/profile snapshots next (breakpointed with
  `cache_control`), volatile per-turn state last. No timestamps or UUIDs in the prefix.
- **In-fiction latency masking.** Scene transitions, art reveals, and "the world holding
  its breath" moments are legitimate dramatic beats that buy generation time.

## 4. Art pipeline (pixel art)

Goal: every image in a playthrough looks like it came from one game.

1. The Scene Writer emits **art requests**, not images: `{kind: "background" | "sprite" |
   "portrait" | "item", subject, mood, paletteRef, sizeClass}` plus the universe's locked
   **style bible** (palette, grid size, outline rules, perspective) that the Director
   authors once per playthrough during the genre reveal.
2. An image model generates the raw image from request + style bible.
3. Deterministic post-processing enforces the style: downscale to the pixel grid, quantize
   to the universe palette, optional outline pass. This step is what makes disparate
   generations cohere.
4. **Content-hash caching**: `hash(request + styleBible)` → asset. Recurring characters and
   locations reuse their art; published universes ship with their asset cache so replays
   are cheap and visually identical.
5. **Placeholder fallback**: procedurally generated silhouettes/tiles render instantly and
   are swapped when the real asset arrives. Art is progressive enhancement — the game is
   never blocked on an image.

The text-only game must be excellent first. The art pipeline attaches to art requests in
the DSL without touching the engine's core loop.

## 5. Export & the public library

A finished playthrough exports a **Universe Bundle**:

```
universe.json     manifest: title, description, dslVersion, style bible, credits
canon.jsonl       the full Canon Ledger
arc.json          the final Story Arc (acts, beats, ending as played)
anchor-exit.json  the profile/genre state at the end of the Anchor (the branch point)
assets/           content-hash-addressed art cache
```

Replaying a published universe: the Director is loaded with the bundle's canon and arc as
**fixed constraints** instead of blank slates. Major beats and world facts are immutable;
scenes, dialogue, minor characters, and the player's own path through the beats are
generated fresh. The original creator's game is recognizable; the new player's experience
is their own. Bundles are validated against their `dslVersion` on import, and old versions
remain supported via migrations.

Moderation note: published bundles are user-generated content and will need a
review/report pipeline before the library is public. Tracked in the roadmap, not designed
yet.

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language, shared schema package between client/server |
| Schemas | Zod (+ generated JSON Schema for structured outputs) | Runtime validation + static types from one source |
| Client | React + PixiJS | Web-first distribution; PixiJS handles pixel-art rendering well |
| Server | Node.js (Fastify) + WebSocket for play sessions | Streaming-friendly |
| AI | Claude API (`@anthropic-ai/sdk`) — Opus 4.8 default, Haiku 4.5 for cheap checks | See Director table |
| Persistence | SQLite via Drizzle to start (playthroughs, canon, assets); Postgres when the library goes multi-user | Start simple |
| Monorepo | npm workspaces | No extra tooling until needed |

## 7. Security & cost guardrails

- API keys live server-side only; the client never talks to the Claude API directly.
- Per-session token budgets and per-scene `max_tokens` caps; the Director degrades
  gracefully (shorter scenes, fewer speculative branches) as budget depletes.
- Player free-text is untrusted input: it is data inside prompts, never instructions.
  The Director's system prompt establishes that player text describes *in-fiction actions*
  only, and the validation layer means prompt-injection can at worst produce weird fiction,
  never engine-level effects.
