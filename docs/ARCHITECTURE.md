# Architecture

This document describes the system that makes a real-time AI-authored RPG feasible,
coherent, and always playable. Read [VISION.md](VISION.md) and [STORY.md](STORY.md)
first. Sections marked *(text era)* describe built systems that predate the pivot
(ADR-0009) and are being evolved, not discarded.

## Overview

```
┌────────────────────────── Client: apps/game (Phaser 3) ──────────────────────────┐
│  Top-down 2D renderer: tilemaps, sprites, movement, dialogue UI, menus.          │
│  Presentation + input ONLY — no game rules live here.                            │
│  Captures actions, free text, movement/timing signals.                           │
└──────────────▲──────────────────────────────────────────────┬────────────────────┘
               │ validated specs (maps, entities, dialogue)   │ PlayerAction
┌──────────────┴──────────────────────────────────────────────▼────────────────────┐
│                            Game Server (Node/TS)                                 │
│                                                                                  │
│  ┌────────────┐   ┌──────────────────────────────────────────────────────────┐   │
│  │  Engine    │   │        AI Director (ModelClient — OpenAI default)        │   │
│  │  (pure,    │   │  Profiler → Architect → World Writer → Continuity Check  │   │
│  │  determin- │◄──┤  emits specs validated against packages/schema,          │   │
│  │  istic)    │   │  constrained by the STORY.md skeleton                    │   │
│  └────────────┘   └───────▲──────────────────────────────┬───────────────────┘   │
│                           │ retrieval                    │ commits              │
│  ┌────────────────────────┴──────────────────────────────▼───────────────────┐   │
│  │  World State: Canon Ledger · Story Arc · Player Profile · Game State      │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Asset DB ◄── Asset Studio (apps/asset-studio): CC0 imports · sprite-as-data ·   │
│               gpt-image-2 → processArt (grid/palette/outline) → catalog          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 1. The DSL — the contract

The single most important artifact in the project. The Director emits JSON documents
validated by Zod schemas in `packages/schema`. The text-era **SceneSpec** (narration,
dialogue, choices, effects, art requests) evolves into a family of specs the Phaser
client can render (DSL v1, Phase 4):

- **MapSpec** — tile layers referencing asset-DB tilesets, collision, spawn points,
  ambient/mood data.
- **Placed entities** — NPCs, items, portals, triggers, with positions and interaction
  affordances (talk / examine / use / custom verbs the engine knows).
- **Dialogue & choices** — the scene-era constructs, now attached to entities and
  triggers instead of floating as pages.
- **Effects** — declarative state changes (`{op: "set", ...}`), never code. Unchanged.
- **Quest specs** — objectives, tracking state, payoff conditions (Phase 6).

Properties (unchanged from the text era, they are the point):

- **Versioned.** Every spec carries `dslVersion`. Additive evolution within a version;
  breaking changes bump it and ship a migration. The pivot is such a bump.
- **Closed-world.** The DSL can only express what the engine can render/resolve. New
  interaction types grow engine-first (development time), then the Director may use them.
- **Self-contained effects.** The engine applies them; the Director predicts them.

## 2. The Engine — deterministic and dumb on purpose

Pure functions over `(GameState, Spec, PlayerAction) → GameState` in `packages/engine`:
movement legality, collision, trigger firing, interaction resolution, effect application,
encounter rules. Zero AI/network dependencies, full unit-test coverage, no unseeded
randomness.

**The Phaser client is not the engine.** `apps/game` renders state and captures input;
every rule that decides what a player action *does* lives in `packages/engine` where it
is testable without a browser. This split is what keeps "it must always be playable"
verifiable.

## 3. The AI Director

A server-side orchestration layer targeting the `ModelClient` interface (ADR-0008 —
OpenAI default, Anthropic supported; model IDs in `packages/director/src/config.ts`,
roles declare a provider-neutral `tier`).

| Stage | Job | Tier |
|---|---|---|
| **Profiler** | Turn play signals (movement, interactions, free text, pacing) into the Player Profile | strong, low effort |
| **Architect** | Own the playthrough's Story Arc *within STORY.md's rails*: acts, beats, planted setups → payoffs, the path's threshold ending. Revise on drift; never abandon coherence | strong, high effort |
| **World Writer** | Author the next specs (maps, entities, quests, dialogue) from Arc + Canon + Profile + state | strong, structured outputs |
| **Continuity Checker** | Cheap gate diffing candidate specs against the Canon Ledger — with STORY.md seeds as highest-priority canon — rejecting contradictions before the player sees them | cheap |

Structured outputs + Zod validation give a two-layer guarantee: the API constrains shape,
the server validates semantics. Invalid specs are regenerated with validation errors fed
back (max 2 retries + graceful degradation); the player sees latency, never failure.

### The story rails (new at the pivot)

STORY.md's fixed facts are loaded as immutable, highest-priority canon at session start.
The Architect's plan must route through the chosen path's register and end at its
threshold; the Continuity Checker rejects any spec contradicting a seed. Path A and
Path B have separate prompt framings (adventure vs. drama) and separate style bibles,
fixed at development time (ADR-0011).

### Memory model (unchanged)

- **Canon Ledger** — append-only facts extracted from every accepted spec; retractions
  are new facts. Relevant facts retrieved into the World Writer's context each turn.
- **Story Arc** — the Architect's living plan; rewritten when play diverges. The plan
  changes, canon never does.
- **Player Profile** — structured preferences with confidence scores, updated
  continuously. Now includes mechanical appetite (combat/exploration/dialogue/puzzle)
  driving which systems the World Writer emphasizes.
- **Game State** — the engine-owned mechanical state, summarized for prompts.

### Latency strategy

- **Speculative generation** of adjacent areas/likely interactions in the background;
  live generation covered by streamed dialogue and in-fiction masking otherwise.
- **Prompt caching** via prefix discipline: frozen system prompt + DSL docs first,
  canon/profile snapshots next, volatile per-turn state last. No timestamps/UUIDs in the
  prefix; sorted-key serialization.
- **A real map buys time.** Unlike the text era, the player can wander already-generated
  space while the Director writes ahead — the game generates just past the player's
  horizon.

## 4. Art: three sources, one gate, one database (ADR-0011)

Goal: every image in the game looks like it came from one game, at ~$0 beyond the OpenAI
budget.

> **The client now renders real art (ADR-0025).** It shipped drawing flat coloured
> rectangles; today the player and NPCs are **LPC** character sprites (CC-BY-SA 3.0 /
> GPL 3.0 — attribution in `apps/game/CREDITS.md`; the one non-CC0 exception), the ground
> and props/items are pixel textures synthesised per tile from the Director's own colour
> (`apps/game/src/tiles.ts`, `sprites.ts` — no bought atlas), and dialogue portraits come
> from gpt-image, capped and cached. Finished external pixel art (LPC) loads directly and
> deliberately **bypasses `processArt`**, which is only for our own placeholder/gpt-image
> art.

**Sources:**
1. **CC0 base library** — curated Kenney/OpenGameArt tilesets, base characters, props;
   recolored/recombined for variety; attribution recorded per asset.
2. **Sprite-as-data** — the model emits small sprites/icons as palette-indexed pixel
   grids (validated JSON), rendered to PNG deterministically. Bespoke content priced at
   API calls already being paid for.
3. **`gpt-image-2`** — hero assets (key art, portraits, unique monsters) behind the
   existing `ImageProvider` seam.

**The gate:** every asset from every source passes the deterministic pipeline in
`packages/art` — `processArt`: pixelize to the style's grid → quantize to its locked
palette → optional outline. This normalizer is what makes disparate sources cohere.
Then Asset Studio validation: dimensions, palette compliance, transparency, animation
frame consistency, license metadata. Only then does it enter the **asset database**
(content-addressed storage + queryable catalog in `packages/library`).

**The operator:** `apps/asset-studio` is CLI-first and **agent-operable** — Claude
Code/Codex drive it conversationally ("create a village tileset" → clarifying questions →
generation/import → validation → catalog). Humans get a preview page; agents get exit
codes and JSON.

**Style bibles** are per-path (her fantasy world / his real world), authored at
development time, locked. Placeholder-first rendering survives: procedural placeholders
render instantly, real assets swap in; no gameplay path blocks on an image.

### Notes for the gpt-image-2 provider (Phase 5)

- **Do not post-process inside the provider** — `processArt` is applied uniformly by
  `AssetCache.getOrGenerate`; the look is enforced in exactly one place.
- **Return an isolated subject on transparency** for sprites/portraits/items: request a
  flat uniform background and chroma-key it out; quantize/outline assume transparent
  means "not the subject".
- **Bump `PIPELINE_VERSION`** on any change that alters output bytes; it is part of the
  cache key and invalidates every cached asset globally.
- Cache key already covers request + style + pipeline version — repeat views are free.

## 5. Persistence & the asset database

File-based under `HOWEVERFAR_HOME` (ADR-0007): sessions, canon, profiles as validated
JSON; the asset DB as `blobs/<sha256>.png` plus a `catalog/` of validated `AssetRecord`s
keyed by `path.kind.name` — content addressing for the pixels, logical identity for the
records (ADR-0019). Art we author ourselves is committed as sprite-as-data text under
`apps/asset-studio/sprites/` and the database rebuilt from it (`npm run seed`), so the
DB stays a derived artifact. The public universe library is cut (ADR-0012); the Reunion
(Phase 7) instead requires both paths' canon to export/merge cleanly — that requirement
shapes canon storage now. A real database appears only if/when multiplayer demands it,
contained inside `packages/library`.

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language; schema package shared verbatim client/server |
| Schemas | Zod (+ generated JSON Schema for structured outputs) | Runtime validation + static types from one source |
| Game client | **Phaser 3** (`apps/game`) | ADR-0010: free, TS-native, tilemaps/camera/input built in, agent-friendly all-text workflow |
| Legacy client | React (`apps/web`) | Text-era client; retire or repurpose as debug console at Phaser parity |
| Server | Node.js (Fastify), WebSocket for play sessions | Streaming-friendly; multiplayer-ready seam |
| AI | `ModelClient` seam — OpenAI default (ADR-0008) | Provider is configuration, not architecture |
| Art tooling | `apps/asset-studio` + `packages/art` | ADR-0011: one gate for three sources |
| Packaging (later) | Capacitor (iOS/Android), Tauri (Win/macOS) | Free toolchains; zero-spend rule |
| Persistence | Files under `HOWEVERFAR_HOME` (ADR-0007) | Zero infrastructure until multiplayer forces the question |
| Monorepo | npm workspaces | No extra tooling until needed |

## 7. Security & cost guardrails

- API keys live server-side only; the client never talks to any model API directly.
- Per-session token budgets and per-call `max_tokens` caps; the Director degrades
  gracefully (smaller areas, fewer speculative branches) as budget depletes.
- Player free text is untrusted data inside prompts — framed as in-fiction action
  description, never instructions. Validation means prompt injection can at worst
  produce weird fiction, never engine-level effects.
- Zero-spend rule (VISION.md): no paid services or assets; OpenAI API usage (story +
  gpt-image-2) is the only cost. Free/open-source everything else.
