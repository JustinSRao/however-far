# Roadmap

Phases are cumulative; each ends with something playable. Don't start a phase's polish
before the previous phase's loop is proven.

> **2026-07-22 — the pivot (ADR-0009).** Phases 0–3 below were built for the original
> "genre-neutral adaptive novel" premise and are kept as the historical record. The
> systems they produced (schema/validation, deterministic engine, Director pipeline,
> canon ledger, profiling, art post-processing, server) are the foundation the pivot
> builds on. The old Phase 4 (public library) is cut per ADR-0012. New work starts at
> **Phase 4 — The Pivot**.

## Phase 0 — Foundation ✅ (pre-pivot)

- [x] Repo, docs, Claude skills, decision records
- [x] `packages/schema`: Scene DSL v0 (Zod); `packages/engine`: pure tested reducer;
      golden fixtures

## Phase 1 — The text loop ✅ (pre-pivot)

- [x] Anchor fixtures; Director v0 (Profiler + Scene Writer) with structured outputs,
      validation, regeneration; Canon Ledger v0; playable CLI
- [x] Go/no-go demo PASSED 2026-07-22: three play styles through one anchor produced
      three different games — **the core premise (play-shaped generation) is proven**,
      and that result carries over to the pivot unchanged

## Phase 2 — Whole-game coherence ✅ (pre-pivot)

- [x] Architect (Story Arc, act advancement, setups→payoffs, drift revision);
      Continuity Checker; endings; session persistence
- [ ] ~~Speculative generation + streaming~~ → moved to Phase 6 (latency work belongs to
      the real game client)

## Phase 3 — Presentation (text era) ✅ (pre-pivot)

- [x] `apps/server` HTTP API; React web client; pixel post-processing pipeline
      (pixelize/quantize/outline, content-hash cache, placeholder-first); style bibles
- Remaining items absorbed into Phases 4–5 below

---

## Phase 4 — The Pivot: story skeleton + a real game on screen

Goal: walk a character through a generated map in the Phaser client, on either path.

- [x] STORY.md story bible; docs/ADRs updated for the pivot (this change)
- [x] **DSL v1:** `AreaSpec` family (`dslVersion: 1`) — tile-grid maps with collision,
      placed entities (characters/props/items) with talk/examine/use/take interactions,
      convo choices, portals with generate/area/ending transitions, `AreaGameState` +
      `AreaAction`. Legacy v0 SceneSpec stays valid until the text-era apps retire (the
      pivot's "migration": both spec families coexist during the transition)
- [x] `packages/engine` v1: pure area rules — movement legality, collision (characters
      block, items don't), reachability, interaction execution with once-semantics,
      portals, `validateAreaIntegrity`. Fully unit-tested, zero AI/network dependencies
- [x] `apps/game`: Phaser 3 client (ADR-0010) — renders AreaSpecs, grid movement,
      interaction prompts, dialogue/choice UI, HUD, the "unwritten" veil at generate
      portals. Local prologue playthrough works today; server connection pending
- [x] **Prologue v1:** five hand-authored areas (Aozora Lane → the river road → the
      underpass → the vanishing → the crossing with the two path doors), with profiling
      probes designed into choices/interactions. *Streaming the probe signals into the
      Profiler happens with the server wiring below*
- [x] Director v1 core: **World Writer** — `writeArea` generation/validation/repair loop
      (structured output → engine integrity → continuity check → feedback retries →
      degrade), path registers (her adventure / his drama), ADR-0014 naming baked into
      the prompt, STORY.md path seeds as loadable canon (`PATH_SEED_CANON`)
- [x] Server session flow v1: area-based sessions over `apps/server`
      (`/api/world-sessions` create/resume/list/action, WorldDirector behind them,
      disk persistence), and the game client opens a server session on boot with
      graceful local fallback
- [x] Playable demo — **the Phase 4 go/no-go: PASSED 2026-07-22** against the live API
      (`npm run eval:world -w @howeverfar/director`). A scripted affectionate prologue
      (took her hand, promised to find her, held on in the underpass) profiled as
      "romantic portal fantasy — earnest, intimate"; the Architect planned her path
      inside the rails (vowthread magic — binding bonds into force; the threshold
      ending needs the ribbon left in his world; a Maru-echo companion from a whisker
      on her sleeve) and the World Writer opened on a 16x14 "Ruined Moon Shrine" —
      integrity clean, named characters carrying kanji nameMeanings. Crossing latency
      ~3min with strong models — the Phase 6 speculative-generation item is the answer
- [x] Post-demo polish: free-text input UI in the game client (press T — signals
      flow now; generation response to free text arrives with streaming, Phase 6),
      and an in-client path for resuming a saved session (boot menu lists the
      three newest saves; resume falls back to new, then to local play)

## Phase 5 — Asset Studio + the asset database

Goal: a large, coherent, growing pixel-art database, operable by agents (ADR-0011).

- [x] `apps/asset-studio` CLI: `validate` / `normalize` / `import` / `sprite` /
      `generate` / `variant` / `catalog` / `preview` / `credits` — every asset passes
      `processArt` + checks (dimensions, palette, transparency, frame consistency)
      before entering the DB. Agent-operable throughout (non-interactive, exit codes,
      `--json`, `--db` for scratch databases), and the human web UI (`npm run studio`)
      now reaches the database too: gate a PNG, name it, record where it came from,
      and it's filed — owner directive (usable without an agent) intact
- [x] Asset database in `packages/library`: content-addressed blobs + queryable
      catalog (kind, tags, path/style, size, source, license, `derivedFrom`). Blobs
      dedup by hash; catalog records are keyed by logical identity, so the same pixels
      can be two entries (one asset in both worlds) without one destroying the other
- [x] CC0 ingestion: `import --source cc0` refuses without pack/author/url, `slice`
      cuts packed spritesheets (how most packs ship), `variant` recolors and restyles
      with attribution chaining via `derivedFrom`, `credits` renders the shipping
      notice from the catalog. **27 CC0 assets curated and committed** from Kenney's
      Tiny Town (her world) and RPG Urban Pack (his world) — owner directive: CC0
      only, and every pack's bundled License.txt was read before ingesting. Raw pack
      files live in `apps/asset-studio/imports/<pack>/raw/` with a `manifest.json`
      carrying attribution; `npm run seed` re-gates them, so the database stays a
      derived artifact and the outline is never applied twice
- [x] Sprite-as-data: `SpriteData` schema (palette-indexed rows, `.` transparent,
      base-32 indices), deterministic `renderSpriteData`, validated like any other
      asset. Committed specs in `apps/asset-studio/sprites/`, `npm run seed` rebuilds
      the DB from them; three starter tiles for the prologue's real world
- [x] `gpt-image-2` provider behind the existing `ImageProvider` seam — deterministic
      prompt from request+style (so the asset cache works), border-flood chroma-key,
      no post-processing inside the provider, every call recorded in the cost ledger
      before any failure path returns. `generate` refuses to spend without `--yes`
- [x] Agent workflow: `asset-studio` skill updated with the command surface,
      sprite-as-data authoring guidance, the catalog-vs-blob keying rule, and the
      instruction to actually look at the preview before declaring success
- [x] Animation support: frame-sequence assets validated as a set (`validateFrameSet`,
      `validate --frames`, `import --frames --frame-ms`), stored as ordered frame
      hashes on one catalog record

- [x] Draft palettes rebuilt as 32-colour tonal ramps per path (ADR-0020), after the
      first CC0 batch exposed that her world had no brown and his had no green, and
      that both pinned their path to a single mood. Still drafts — **locking them
      against real gameplay is the owner's call**, and stays cheap because every art
      source is committed, so a swap is one `npm run seed`

## Phase 6 — The living RPG

Goal: both paths playable start → threshold ending, feeling like a real game.

- [x] Mechanics per path (ADR-0021): **one ruleset, emphasized per path** — a character
      sheet (might/wits/heart, vigor/focus, standings) and a single `check` primitive
      that is combat on her side and investigation on his. Seeded per session so a
      playthrough replays identically. DSL + pure engine rules + client HUD; the World
      Writer prompt teaches it, including "failure must be interesting"
- [ ] Quest structure: generated quests with objectives, tracking, and payoffs planted
      by the Architect
- [ ] Recurring characters: canonical visual descriptions in canon → stable art via the
      asset DB; companions/antagonists that persist and develop across the playthrough
- [ ] Latency: speculative generation of adjacent areas, streamed dialogue, in-fiction
      masking; art always placeholder-first
- [ ] **Path B meta-effects (`metaFx`, ADR-0015):** the DSL vocabulary for diegetic
      interface corruption — missing portraits, rewriting save labels, vanishing
      dialogue-log entries — sandboxed, non-destructive, engine-mediated
- [ ] Path endings: threshold finales per STORY.md; full playthroughs of both paths
- [ ] Cost guardrails: per-session token budgets, graceful degradation

## Phase 7 — The Reunion (multiplayer "DLC", long-term)

- [ ] Canon merge: two completed playthroughs (one per path) combine into one finale
      context — the exportable-canon requirement from ADR-0012
- [ ] Session pairing + realtime sync through `apps/server` (WebSocket); the Director
      writes for two players in one world
- [ ] The finale: reunion arc generated from both canons; the only true ending

## Phase 8 — Platforms & distribution (long-term)

- [ ] Capacitor builds: iOS, Android
- [ ] Tauri builds: Windows, macOS
- [ ] Distribution from the project owner's website (domain: owner-approved spend,
      ADR-0013); Apple Developer Program already paid by the owner. Google Play's fee
      not yet approved — ask when Android distribution becomes real

## Open questions (revisit each phase)

- How much mechanical depth does the DSL support vs. narrative resolution? (Answered
  for now by ADR-0021: one check primitive, no bespoke systems. Revisit if play proves
  it too thin.)
- ~~Do the two paths share one engine ruleset with different emphasis, or grow
  path-specific rule modules?~~ **Answered: one ruleset (ADR-0021), for the Reunion's
  sake.**
- Reunion matchmaking: how do two players find each other? (Friends-first? Codes?)
- Multiplayer hosting under the zero-spend rule (self-hosted from the owner's machine?
  free tiers?) — the hard open question of Phase 7.
