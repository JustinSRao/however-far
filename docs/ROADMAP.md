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
- [ ] Post-demo polish: free-text input UI in the game client (signals flow now;
      generation response to free text arrives with streaming, Phase 6), and an
      in-client path for resuming a saved session

## Phase 5 — Asset Studio + the asset database

Goal: a large, coherent, growing pixel-art database, operable by agents (ADR-0011).

- [ ] `apps/asset-studio` CLI: `import` / `validate` / `normalize` / `preview` /
      `catalog` — every asset passes `processArt` + checks (dimensions, palette,
      transparency, frame consistency) before entering the DB.
      *Progress: scaffold landed with working `validate` + `normalize` (tested,
      smoke-tested end to end), draft per-path style bibles, and a human-usable web
      UI (`npm run studio`, drag-and-drop gate with before/after previews — owner
      directive: usable without an agent)*
- [ ] Asset database in `packages/library`: content-addressed storage + queryable
      catalog (kind, tags, palette, size, source, license)
- [ ] CC0 ingestion: curate Kenney/OpenGameArt packs (tilesets, base characters, props),
      recolor/recombine variants, record attribution
- [ ] Sprite-as-data: schema for palette-indexed pixel grids the model can emit;
      renderer to PNG; validation like any other asset
- [ ] `gpt-image-2` provider behind the existing `ImageProvider` seam (chroma-key,
      post-process, cache — see "Notes for a real image provider" in ARCHITECTURE.md)
- [ ] Agent workflow: `asset-studio` Claude skill so "create a village tileset" in a
      Claude Code chat runs the tool, asks clarifying questions, and lands validated
      assets. Web preview UI only if the CLI proves insufficient
- [ ] Animation support: frame-sequence assets (walk cycles, effects) validated as sets

## Phase 6 — The living RPG

Goal: both paths playable start → threshold ending, feeling like a real game.

- [ ] Mechanics per path, tuned by profiling: her path — magic/combat/exploration
      systems; his path — investigation/evidence/relationship systems. All as DSL +
      engine rules (development-time), emphasized per player by the Director
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

- How much mechanical depth does the DSL support vs. narrative resolution? (Now urgent:
  Phase 6 needs real systems.)
- Do the two paths share one engine ruleset with different emphasis, or grow
  path-specific rule modules?
- Reunion matchmaking: how do two players find each other? (Friends-first? Codes?)
- Multiplayer hosting under the zero-spend rule (self-hosted from the owner's machine?
  free tiers?) — the hard open question of Phase 7.
