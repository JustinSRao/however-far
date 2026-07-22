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

## ADR-0007: File-based persistence until the library goes multi-user

**Status:** Accepted · 2026-07-17

Sessions and universe bundles are JSON files under `UNWRITTEN_HOME` (default
`~/.unwritten`), one file per object, validated on read. **Why:** zero infrastructure
while the product is single-player-local; schemas already guarantee integrity; swapping in
a database later is contained inside `packages/library`.

## ADR-0008: The model provider is configuration, not architecture

**Status:** Accepted · 2026-07-22 · amends ADR-0002

The Director targets the `ModelClient` interface, never a vendor SDK. Two adapters
implement it — `OpenAIModelClient` (default) and `AnthropicModelClient` — and
`createModelClient()` picks one from the environment. Role→model mapping goes through a
provider-neutral `tier` ("strong" / "cheap") so a swap never touches Director logic.

**Why:** the project owner chose OpenAI, and the cost of honouring that was one adapter
because the seam already existed for testability. Keeping both is close to free and avoids
lock-in; the same seam is what would let a local model back replays later (a Phase 4 cost
question).

**Consequences.** Provider differences are absorbed in the adapter, not the prompts:

- **Structured outputs.** OpenAI strict mode accepts a restricted JSON Schema subset, so
  `openaiSchema.ts` translates: optional properties become nullable-and-required (nulls
  stripped from the response), root-level unions get wrapped in an object, and unsupported
  validation keywords are dropped. Those keywords are still enforced — every response is
  re-validated against the original Zod schema, which the retry loop already required.
  `packages/schema` stays the single source of truth and is unchanged.
- **Prompt caching** is automatic and prefix-based rather than marked with
  `cache_control`. The ordering discipline (frozen system prompt first, volatile per-turn
  content last) is what earns the hit, and it is unchanged.
- **Thinking budget** maps onto `reasoning_effort`; our two levels above "high" collapse
  onto it.

## ADR-0009: Pivot — fixed dual-POV story skeleton, real RPG, not an adaptive novel

**Status:** Accepted · 2026-07-22 · amends the premise behind ADR-0005 and VISION.md

The genre-neutral, "game invents its own genre" premise is replaced by a **hand-authored
story skeleton** ([STORY.md](STORY.md)): a dual-POV story (her isekai path / his
psychological-drama path) with fixed seed facts, a shared hand-authored Prologue as the
new Anchor, and path endings that only resolve in a (long-term) cross-platform
multiplayer Reunion. The product is a **top-down 2D pixel-art RPG**, not a text-forward
interactive novel.

**Why:** the project owner's call. The owner authored this story, wants a real game with
mechanics/art/UI, and judged the text-forward experience to be a choose-your-own-adventure
novel rather than a game.

**What survives unchanged:** the data-not-code invariant (ADR-0001), the deterministic
engine discipline, canon ledger (ADR-0004), Story Arc planning, player profiling, the
validation/retry loop, prompt-cache discipline, and the pixel post-processing pipeline.
They now operate *inside the rails* of STORY.md instead of a blank slate.

**Consequences:** STORY.md gains Anchor-level protection (never generated, never
contradicted; its seeds are highest-priority canon). The Profiler tunes tone, pacing, and
mechanical emphasis *within* the chosen path's register, never across it. The DSL must
grow from scene-description to world-description (maps, movement, encounters) — see
ADR-0010.

## ADR-0010: Phaser 3 + TypeScript is the game engine

**Status:** Accepted · 2026-07-22 · amends ADR-0002 (client layer)

The game client is built on **Phaser 3** in TypeScript inside the existing monorepo
(`apps/game`), replacing the React/DOM presentation as the primary client. Distribution
remains web-first; iOS/Android arrive later via Capacitor and Windows/macOS via Tauri —
all free toolchains.

**Why (vs. Godot 4):** Godot exports natively everywhere but pulls the client out of the
TypeScript monorepo — the shared Zod schema package (the project's single source of
truth) would need duplication and a second validation layer, and Godot's editor-centric,
partly-binary workflow is hostile to agent-driven development. Phaser keeps one language,
one schema package shared verbatim between Director and renderer, everything diffable
text, and costs nothing. **Why (vs. growing the custom PixiJS engine):** Phaser ships
tilemaps, camera, input, physics, and scene management we would otherwise rebuild.

**Consequences:** the deterministic-core rule is preserved by keeping game *rules*
(movement legality, effect application, encounter resolution) in `packages/engine` as
pure functions; Phaser code is presentation and input only, and is allowed to be
untestable-by-unit-test. The DSL grows map/entity/interaction specs the Phaser client can
render. `apps/web` (React) remains as a legacy/text client until the Phaser client
reaches parity, then is retired or repurposed as the debug console.

## ADR-0011: Hybrid art strategy behind one agent-operable Asset Studio

**Status:** Accepted · 2026-07-22 · extends ADR-0005

Art comes from three sources: (1) a curated **CC0 base library** (Kenney, OpenGameArt —
tilesets, base characters) recolored/recombined by the pipeline; (2) **model-authored
sprite data** — palette-indexed pixel grids emitted as validated JSON; (3) **`gpt-image-2`
generation** for hero assets (within the owner's OpenAI budget, the only permitted spend).

Every asset, regardless of source, passes through the existing deterministic
post-processing (`processArt`: grid → palette quantize → outline) and into a
content-addressed **asset database** shared across playthroughs.

The **Asset Studio** (`apps/asset-studio`) is the single gate: a CLI-first, agent-operable
tool that imports, validates (dimensions, palette compliance, transparency, animation
frame consistency), normalizes, previews, and catalogs assets. Agents (Claude Code,
Codex) drive it directly — "make me a village tileset" is a conversation with an agent
that operates the Studio, asks clarifying questions, and commits validated assets.

**Why:** CC0 gives reliable bulk quality at $0; sprite-as-data makes bespoke content from
API calls already being paid for; gpt-image-2 covers what both do badly. One gate keeps
the game's look coherent no matter the source.

**Consequences:** no asset enters the database without passing Studio validation. CC0
attribution/licenses are recorded per asset in the catalog. The old universe-locked style
bible becomes **per-path style bibles** (her world / his world), fixed at development
time rather than generated at play time.

## ADR-0012: Profiling stays core; the public universe library is cut

**Status:** Accepted · 2026-07-22 · supersedes ADR-0006, narrows ADR-0007

The Player Profile and adaptive generation remain central. The **public library of
exported universes** (export/browse/replay, ADR-0006) is cut: with a fixed story
skeleton, "publish your universe" no longer carries the product identity, and its open
cost/moderation questions die with it.

`packages/library` survives in its other role — session persistence and canon storage
(ADR-0007) — and gains the shared **asset database**. Universe-bundle export/replay code
is removed when it gets in the way, not preserved. The bundle format's lesson (canon must
export/merge cleanly) is retained as a requirement on both paths' canon for the
multiplayer Reunion, where two playthroughs' canons merge into one finale.

## ADR-0013: Zero-spend rule — owner-approved exceptions for distribution

**Status:** Accepted · 2026-07-22 · amends the zero-spend rule (ADR-0011 context, VISION)

The owner has paid for the **Apple Developer Program** and will pay for a **domain** to
distribute desktop builds from. These join the OpenAI API as the only permitted spend.
Everything else remains free/open-source. Google Play's one-time fee is *not* yet
approved — ask the owner when Android distribution becomes real.

## ADR-0014: Every character name is Japanese and personality-derived

**Status:** Accepted · 2026-07-22 · owner directive

All named characters — both paths, both worlds, main cast and one-scene NPCs — receive
Japanese names whose kanji meanings connect to their personality (directly or as
intentional irony). The process, examples, and Director-prompt integration live in the
`name-creator` skill; the name/kanji/trait link is recorded as a canon fact at first
appearance.

**Why:** owner directive; it also gives the Continuity Checker a concrete handle on
character identity (a name is now a claim about personality that later scenes must
honor), and it makes her fantasy world read as anime-fantasy, which is the product's
register.

## ADR-0015: Path B's interface lies, but the sandbox never does

**Status:** Accepted · 2026-07-22

His path may use **diegetic interface corruption** as a storytelling device (owner-loved,
DDLC-inspired): the game's own UI participates in the world's forgetting of Yuna — her
portrait missing from menus, save-slot labels quietly changing, dialogue-log entries
about her vanishing, NPCs repeating conversations as if they never happened.

**Hard constraints:**

- **Sandboxed absolutely.** Effects only ever touch the game's own UI state and the
  game's own save/data directory. Nothing outside it is read, written, renamed, or
  deleted — no real user files, ever. Anything that *looks* like file manipulation is
  fiction rendered by the UI.
- **Never actually destructive.** A "corrupted" or "missing" save is presentation over
  intact data; the player can always really quit, really resume, and really finish. The
  always-playable invariant outranks the bit.
- **Engine-mediated like everything else:** these are DSL-level effects (a `metaFx`
  vocabulary, Phase 6) emitted by the Director, validated, and rendered by the client —
  never model-driven improvisation at the UI layer.
- Path A does not use these effects; the contrast is the point.

## ADR-0016: The protagonists are Itsuki and Suzune; the game is "However Far"

**Status:** Accepted · 2026-07-22 · owner-delegated naming

The placeholder names KAITO and YUNA are retired. Per ADR-0014's process:

- **Itsuki (樹, "tree")** — the boy. Rooted, steadfast; when reality reorganizes around
  him, he stays planted and keeps what he was given. A tree remembers in rings.
- **Suzune (鈴音, "the sound of a bell")** — the girl. Bright, ringing, carries down the
  whole street — and, in hindsight, named for the bell only she could hear. The
  foreshadowing is intentional and payoff-planned: her name is why the bell could call
  her.

The game itself is retitled from **Unwritten** to **However Far**, after the promise in
the prologue ("I'd find you. However far.") — the line both paths are living and the
multiplayer Reunion fulfills. Consequences: npm scope `@unwritten/*` → `@howeverfar/*`,
persistence env var `UNWRITTEN_HOME` → `HOWEVERFAR_HOME` (default `~/.however-far`;
existing local saves under `~/.unwritten` are orphaned — acceptable pre-release), GitHub
repo renamed to `however-far`. Earlier ADRs keep their original wording (append-only
history).
