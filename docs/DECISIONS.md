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

## ADR-0017: Full names for every human character; dialogue honorifics codified

**Status:** Accepted · 2026-07-22 · owner directive, extends ADR-0014/0016

Every human character gets a **given name AND a family name**, both trait-derived per
ADR-0014 (real Japanese surnames only). Exempt: pets/animals, spirits and creatures,
and fantasy characters whose culture plausibly lacks surnames (epithets allowed).
English prose and UI use given-name-first order ("Suzune Tōyama"); macrons in docs,
ASCII in slugs.

The protagonists' full names, by the same process:

- **Itsuki Nemoto** (根本 樹) — Nemoto "root, origin" + Itsuki "tree": the rooted tree;
  the boy who stays planted when reality rearranges.
- **Suzune Tōyama** (遠山 鈴音) — Tōyama "distant mountain" + Suzune "bell-sound": a
  bell heard from a distant mountain — her full name encodes the title *However Far*.

Dialogue now follows the **`dialogue` skill**: Japanese honorifics kept in English text
(anime-localization style) with correct usage (-san default, -kun/-chan intimacy
registers, -senpai/-sensei roles, -sama/-dono in the fantasy court, yobisute for
family/lovers/close friends), family-name-first social distance, and **address shifts
treated as story beats recorded in canon**. The World Writer prompt carries a compressed
version of these rules.

## ADR-0018: Every API call is recorded in the cost ledger

**Status:** Accepted · 2026-07-22 · owner directive

**Every** external model/image API call — Director stages today, gpt-image-2 asset
generation when Phase 5 lands, anything after — is recorded to a persistent ledger
(`HOWEVERFAR_HOME/costs.jsonl`, one JSON line per call: timestamp, provider, model,
Director role, raw token counts, derived USD cost). The goal is a cost mockup of the
entire game: cost per crossing, per area, per playthrough, per asset.

Mechanics: the two `ModelClient` adapters record automatically inside
`generateStructured`, so no Director call site can forget; `packages/director/src/costs.ts`
owns the pricing table (prices verified 2026-07-22 — gpt-5.5 $5/$30, gpt-5.4-mini
$0.75/$4.50, claude-opus-4-8 $5/$25, claude-haiku-4-5 $1/$5 per MTok; cached input ~0.1×)
and the ledger IO. **Tokens are the ground truth** — unknown models record with
`costUsd: null`, and `npm run costs -w @howeverfar/director` reports both recorded and
recomputed-at-current-prices totals, broken down by model/role/day. Recording is
best-effort and never breaks play. `eval:world` prints each run's call count and cost.

**Consequence:** any NEW code path that calls an external paid API must either go
through an instrumented adapter or call `recordUsage` itself — a call that doesn't land
in the ledger is a bug. (The pre-existing text-era eval runs and the first Phase 4
go/no-go run predate the ledger and are not in it.)

## ADR-0019: Asset identity — blobs by content, catalog records by name

**Status:** Accepted · 2026-07-22

The asset database (ADR-0011) stores two different things with two different keys, and
conflating them is a data-loss bug:

- **Blobs** (`blobs/<sha256>.png`) are keyed by a hash of their own bytes. Two assets
  that gate to identical pixels share one file. This is the point of content addressing
  and it stays.
- **Catalog records** (`catalog/<path>.<kind>.<name>.json`) are keyed by the asset's
  *logical identity*. They are deliberately NOT keyed by content hash.

The first implementation filed records by hash and it was wrong. The same pixels
legitimately appear as more than one catalog entry — most obviously "the same asset in
both worlds is two entries, one per style bible" (asset-studio skill), which is exactly
what happens whenever a gated image lands identically in her-world and his-world, or
when one image is cataloged under two names. Hash-keyed records made the second write
silently destroy the first. A regression test in `packages/library/test/assets.test.ts`
pins the behaviour.

`AssetRecord.id` remains the first frame's content hash: it is the cross-reference and
cache key, just not the filename. Uniqueness is enforced on `(path, kind, name)` —
re-storing identical content is a no-op, storing different content under a taken name
requires an explicit `replace`.

**Provenance chains rather than being overwritten.** A `variant` (recolor or restyle)
keeps its parent's `source` verbatim and records `derivedFrom: <parent id>`. A recolored
Kenney tile is still Kenney's CC0 work, so it must still credit Kenney — `credits`
builds the shipping attribution from `source` alone and therefore covers every
derivative for free. Re-sourcing a derived asset as "hand" or "sprite-data" is an
attribution bug, not a shortcut.

**Consequence:** anything that writes to the asset DB goes through `putAsset`, which
owns both rules. Code that computes a catalog path itself, or that replaces `source` on
a derivative, is a bug.

## ADR-0020: Draft palettes rebuilt as tonal ramps, per path

**Status:** Accepted · 2026-07-22 · owner-approved

The first draft palettes were borrowed 16-colour sets (her world started from
Sweetie-16). Once real CC0 art was pushed through the gate, two gaps showed up that
only appear when you look at the output:

- **Her world had no brown.** Every imported earth tile, timber wall and wooden fence
  quantized to bright orange, because orange was the nearest thing to brown on offer.
- **His world had no green.** A contemporary Japanese neighbourhood needs hedges and
  front yards; the hand-authored hedge tile came out teal-and-purple.

Both palettes also pinned their world to one emotional register — bright and cheerful
for her, muted and grey for his — which contradicts STORY.md's tone discipline
("Path A may get dark, but it is an adventure; Path B may have warmth, but it is a
drama") and the owner's references: Re:Zero for her path, *Rascal Does Not Dream of
Bunny Girl Senpai* for his.

Both are now **32 colours built as deliberate tonal ramps** rather than a flat set of
pleasing hues, so each world can swing across its whole register without leaving the
palette:

- **her-world:** neutrals · earth/wood · foliage · cool stone · blood · gold · arcane ·
  sky/water. The blood and arcane ramps are what let the Director ask for something
  horrific without the gate prettifying it.
- **his-world:** neutrals · concrete/asphalt · warm wood · skin · foliage · sky ·
  warm lamplight · uniform navy · red accent. The warm ramps are what keep his path
  from being uniformly grey.

**Non-obvious mechanic worth remembering:** `quantize` picks the nearest colour in RGB
space, so palette entries *compete*. The first rebuild kept neutral greys and a pale
cyan; Kenney's cool blue-grey stone landed nearer the cyan, and the stone floor came
out solid azure. Fixing it meant making the stone ramp cool-leaning, not adding more
greys. When an asset gates to a surprising colour, the fix is usually the *distance
between* palette entries, not the entry you expected it to hit.

**Consequence:** palettes remain drafts in `apps/asset-studio/styles/` until the owner
locks them against real gameplay. That stays cheap: every art source is committed
(sprite-as-data specs and raw CC0 files), so a palette change is one `npm run seed`
and the whole database re-gates. Sprite-as-data specs embed their own palette, so any
palette swap should regenerate them too, or their colours merely snap to the nearest
new entry.

## ADR-0021: One ruleset, emphasized per path — checks are the only mechanic

**Status:** Accepted · 2026-07-22

ROADMAP asked: *"Do the two paths share one engine ruleset with different emphasis, or
grow path-specific rule modules?"* **One ruleset.**

Her path is exploration/magic/combat/survival/factions; his is investigation/dialogue/
relationships/memory/evidence. Those look like different games, but mechanically they
are the same contest: spend a resource, test an attribute against a difficulty, change
the world whichever way it lands. What differs is vocabulary and emphasis, and that is
the Director's job, not the engine's.

The decider is **the Reunion** (Phase 7): it merges one completed playthrough of each
path into a single finale. Two divergent rule modules would make that a reconciliation
problem — whose stats survive, how do they map — instead of a merge. A shared sheet
means both playthroughs arrive already speaking the same language.

**The sheet.** Three attributes (`might`, `wits`, `heart`) and two pools (`vigor`,
`focus`), fixed at development time so the DSL stays closed-world (ADR-0001). They are
deliberately abstract enough to read on both sides: `might` is a sword swing for Suzune
and the nerve to knock on a stranger's door for Itsuki; `focus` is her mana and his
clarity. Standings cover factions (her) and relationships (his) with identical
bookkeeping. Both protagonists start with `heart` highest — not balance, but the story:
the spine is a bond, her dormant power runs on it, his whole path is refusing to let go.

**Checks are the only mechanic.** There is no separate combat system, and there will
not be one. A fight is a run of checks; so is an interrogation, a spell, a search of a
room. A d6 plus the attribute against a difficulty of 1–10, with an optional cost spent
whether or not it lands. This keeps the engine small and pure, and spends the Director's
intelligence on fiction instead of rules — which is the whole architecture (ADR-0002).

Randomness is seeded from the session id and indexed by a counter, using a finalizing
integer hash rather than a sequential PRNG, so check #7 does not depend on whether
checks #1–6 ever happened. A session replays identically from its action log even when
the Director's retries changed how many checks were *offered*.

**Consequence:** the prompt tells the World Writer that failure must be interesting —
a failed check moves the story sideways, never backwards, and never resolves to
"nothing happens". A mechanic that can only stall is worse than no mechanic.
`AreaEffect` supersedes `Effect` inside the Area DSL as a superset; the legacy text-era
engine keeps the smaller union it already exhaustively handles.

## ADR-0022: A turn can be watched — SSE stages, streamed prose, and the Interstitial

**Status:** Accepted · 2026-07-22

The Phase 4 go/no-go measured a ~3 minute crossing against the live API. Speculation
(Phase 6) removes that wait when the player walks at a door with warning; it cannot
remove the crossing itself, an ending, or a door taken from a standing start. Something
has to be on the screen for those minutes, and the honest options were a progress
indicator or fiction. **We chose fiction, and gave it real information to work with.**

**Three parts.**

1. **A streaming twin of the action route.** `POST /api/world-sessions/:id/action/stream`
   returns the same `WorldTurnResult` as the plain route, preceded by `stage` events
   (`profiling` → `planning` → `writing` → `arriving`, or `improvising`, or `closing`)
   and `chunk` events carrying prose as it is written. Server-sent events, not a socket:
   a turn is one request with one answer and a running commentary, which is exactly the
   shape SSE has, and it needs no client protocol beyond `fetch`. The plain route stays,
   unchanged, and the client falls back to it silently — a player must never lose a move
   to a transport.

2. **`streamText` is optional on `ModelClient`.** Adapters that can stream do; `streamProse`
   falls back to a one-field structured call for those that cannot, so no Director code
   branches on provider support and every existing test fake keeps working. Streamed
   calls still record usage (ADR-0018) — after the stream drains, where the totals are
   final.

3. **The Interstitial.** Hand-authored passages per path in `@howeverfar/content`, shown
   one line at a time while the Director works, chosen deterministically from the door
   being opened so the same door always opens with the same words. This is authored
   content, not generated: what the player reads at the *seams* of the game is ours. The
   game never admits there is a machine behind it — no spinner, no percentage, no
   "generating".

**The Improviser.** The same streaming pathway made free text answerable at last: after
the crossing, typing something now gets narration written for it rather than a fixed
acknowledgement. Its boundary is absolute and is why it is allowed to be prose at all:
**it returns narration, never data.** No flags, no items, no doors, no quest progress.
A player cannot type their way into a state the engine did not authorize (ADR-0001) —
the world can acknowledge anything and grant nothing. Inside the prologue nothing
changes: the evening is hand-authored (CLAUDE.md invariant 4) and the acknowledgement
stays honest about that.

## ADR-0023: Two players find each other by calling for each other

**Status:** Accepted · 2026-07-23

ROADMAP asked: *"Reunion matchmaking: how do two players find each other? (Friends-first?
Codes?)"* **Friends-first, by mutual call.**

There is no matchmaking service, no lobby, and no account system, because ADR-0013 says
there will not be one and because the Reunion does not want strangers. STORY.md's finale
is two people who each spent a whole playthrough alone with one half of the same loss;
pairing them with whoever is queueing would be a different game.

**The rule.** Both players fill in a name and an address for themselves and for the
person they are reaching for. Two calls pair when each names the other's address and
they came from opposite paths. Names are displayed, never matched on — people spell each
other's names however they like. A call to yourself, a call from the same side, and a
one-sided call all refuse; a call nobody has answered waits, costs nothing, and is
replaced by a newer one from the same address.

**Why email rather than a code.** A code is one more thing to lose, and it has no place
in the fiction. An address is something the two of them already exchanged — this is
friends-first by construction — and it lets the same field be both the identity the
pairing matches on and the address a licence is bound to (ADR-0024). One question, asked
once, doing three jobs.

**It is diegetic on both sides, and only the price tag isn't.** Her side rings a bell
toward a name; his side writes a name back into the register that erased it. Both
gestures need the same four fields, which is why the same form fits both. The licence
field is deliberately *not* dressed up: dressing a purchase as story would be a trick.
See docs/REUNION.md for the fiction and its two flagged inferences.

**Consequence:** a `PlaythroughExport` — not the save file — travels inside the call, so
it does not matter which machine a playthrough was lived on. One player hosts; the other
points a client at them. Canon from the two sides is merged **side-keyed and
unreconciled**: two accounts of the same weeks are supposed to disagree about what was
visible, and flattening that would erase what the finale exists to reassemble.

## ADR-0024: The Reunion is paid for, and the licence is a receipt, not a lock

**Status:** Accepted · 2026-07-23

The Reunion is the DLC. It has to be gateable, and the gate has to work on somebody's
laptop with no internet, because the Reunion is self-hosted and ADR-0013 forbids paying
for infrastructure to check licences.

**The mechanism.** An offline key: `HMAC(secret, product + email)`, Crockford base32,
grouped for reading aloud. Verification needs the shared secret, the key, and the address
that claims it — no call home, no database, no service. Minting is a one-line CLI, so any
storefront that can send an email can fulfil an order.

**Bound to email, which the story was already asking for.** The Call needs an address to
pair on (ADR-0023). Binding the licence to that same address means the paid gate asks the
player for nothing the fiction had not already asked for.

**Both players are checked.** Not just the host, and not just the caller. A finale is
something two people bought; letting one carry the other would make a two-seat experience
a one-seat purchase.

**Fails closed.** A build with no `HOWEVERFAR_LICENSE_SECRET` refuses rather than gives
the DLC away. Development uses an explicit, separate `HOWEVERFAR_REUNION_UNLOCKED=1` — an
unconfigured build must never be mistaken for an unlocked one.

**What this is not, stated plainly:** offline licensing is not copy protection. Anyone
running their own server can read the secret out of their own build, and no amount of
obfuscation changes that for a self-hosted game. This is a receipt. It keeps honest
buyers straight, it is proportionate to a finale both players must finish an entire
playthrough to reach, and it does not cost the project a cent to operate. If the owner
later wants real entitlement checks, that is a hosted service and a new ADR — the seam
(`packages/entitlement`) is where it would go, and nothing above it would change.

**Not decided here:** which storefront takes the money. Stripe, Gumroad, itch, a page on
the owner's own site — all of them can deliver a key string in a receipt, so all of them
compose with this, and none of them is a code change beyond the fulfilment hook.

## ADR-0025: The client renders real art — LPC (CC-BY-SA), procedural tiles, gpt-image portraits

**Status:** Accepted · 2026-07-23

The Phaser client shipped rendering only flat coloured rectangles: none of the art
pipeline was ever wired to the screen. Fixing that surfaced two owner calls that modify
earlier rules.

**CC-BY-SA is now allowed (was CC0-only, ADR-0011/ROADMAP Phase 5).** The player and NPC
characters are built from **LPC** (Liberated Pixel Cup) sprites — CC-BY-SA 3.0 / GPL 3.0.
That is copyleft, not public domain: attribution ships in `apps/game/CREDITS.md` and
derivatives of the art stay under the same licenses. The trade was deliberate — LPC is the
nearest *free* path to the SNES-JRPG look the owner asked for, and CC0 alone could not
reach it. Everything else stays CC0/our own.

**Real external pixel art bypasses `processArt` and the Asset Studio gate, on purpose.**
That pipeline pixelizes and quantizes to a *locked palette* — it exists to make OUR
placeholder and gpt-image art cohere. Running finished LPC art through it would wreck it.
So LPC loads directly from `apps/game/public/assets`; the gate still owns everything that
goes into the asset database. (Asset Studio's `import` already records a `--license`, so a
CC-BY-SA asset that ever *did* need the database has a home; nothing does today.)

**Ground and objects are generated, not a bought tileset.** Areas are authored at runtime
and the World Writer picks each tile's colour for mood (and the Reunion seam, ADR-0020), so
a fixed atlas would fight that. `apps/game/src/tiles.ts` and `sprites.ts` synthesise a
pixel texture per tile/prop/item from the entity's *own* colour, pattern chosen by
`artTag`/name keyword. Pattern gives detail; the Director's colour keeps intent; every
generated thing renders with no atlas to map.

**Portraits are gpt-image, capped and cached (extends ADR-0011 source #3).** The dialogue
box shows a character portrait from `GET /api/portrait`, generated once, chroma-keyed,
quantized to that path's palette, and content-hash cached forever. Spend is capped per
server run (`HOWEVERFAR_PORTRAIT_BUDGET_USD`, default $2) with a free procedural fallback
past the cap, on `HOWEVERFAR_PORTRAITS=off`, or on any failure — the always-something-on-
screen rule outranks the budget. This is the one place the zero-spend rule is relaxed by
owner approval, and it is bounded and opt-outable.
