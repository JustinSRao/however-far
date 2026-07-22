# Roadmap

Phases are cumulative; each ends with something playable. Don't start a phase's polish
before the previous phase's loop is proven.

## Phase 0 — Foundation

- [x] Repo, docs, Claude skills, decision records
- [x] `packages/schema`: Scene DSL v0 (Zod) — narration, dialogue, choices, free text,
      flags/inventory effects, art requests (unused for now), transitions
- [x] `packages/engine`: pure reducer over (GameState, SceneSpec, PlayerAction), fully
      unit-tested, zero AI dependencies
- [x] Golden SceneSpec fixtures that double as DSL documentation

## Phase 1 — The text loop (prove the concept)

The whole vision, minus graphics, in a terminal/basic web UI.

- [x] Hand-write the **Anchor** as a set of fixed SceneSpecs (the only authored content)
- [x] Director v0: Profiler + Scene Writer — play signals in, next SceneSpec out,
      structured outputs + Zod validation + regeneration on failure
- [x] Canon Ledger v0: fact extraction per accepted scene, entity-first retrieval
- [x] `apps/play-cli`: playable terminal loop (new/resume/library/replay)
- [x] Play a session that visibly *becomes a different genre* depending on how the Anchor
      is played — **the go/no-go demo: PASSED 2026-07-22** against the live API
      (`npm run eval -w @unwritten/play-cli`). Three scripted play styles through the
      identical Anchor produced a gritty survival thriller, a gothic detective mystery,
      and an intimate amnesiac drama — each recontextualizing the same seeded facts
      (Marlow, the box, the bell, the eastern smoke) and building its arc around the item
      that player happened to take. The premise holds.
- [ ] A full 20–30 minute human playthrough end to end (the eval only covers anchor exit
      plus the first generated scene)

## Phase 2 — Whole-game coherence

- [x] Architect: full-game Story Arc, act advancement, planted setups → payoffs,
      revision triggered by arc-drift detection (3 scenes without beat progress)
- [x] Continuity Checker (Haiku) gating scene acceptance against canon
- [x] Endings: final-act gating, server-owned termination; playthroughs complete
- [ ] Speculative generation + streaming narration; latency good enough to feel
      like a game (deferred — the biggest open Phase 2 item)
- [x] Session persistence: quit and resume a playthrough

## Phase 3 — Presentation

- [x] `apps/server`: HTTP API over the Director (session create/resume/replay, turns,
      publish) — keeps the API key server-side
- [x] Web client: React, scene layout, choice UI, free-text input, typewriter narration.
      Plain DOM/CSS rather than PixiJS — the presentation is typographic, and PixiJS buys
      nothing until animated sprites exist. Revisit if that changes.
- [x] Pixel-art pipeline: provider seam → pixelize/palette-lock/outline → content-hash
      cache, placeholder-first rendering
- [x] Serve generated assets from the server (`GET /api/sessions/:id/art`) and render
      them pixel-exact in the web client's art slots
- [x] Style bible generation at genre-reveal time (Stylist role, locked per universe,
      inherited by replays)
- [ ] Real image-model provider behind `ImageProvider` (placeholders render today)
- [ ] Portraits for recurring characters, backgrounds per location — the Scene Writer
      emits art requests, but nothing yet makes a returning character reuse one

## Phase 4 — The library

- [x] Universe Bundle export at playthrough end (local library on disk)
- [x] Import/replay: canon + arc as fixed constraints, fresh scene generation
- [ ] Public library service: browse, play free, attribution to creator
- [ ] Accounts, moderation/report pipeline, content policy for published bundles
- [ ] Cost model for free play (this is the hard open question of Phase 4)

## Open questions (revisit each phase)

- How much mechanical depth (combat systems, stats) should the DSL support vs. keeping
  everything narrative-resolved?
- Multiplayer-adjacent ideas (shared universes, async ghosts) — out of scope until
  Phase 4 ships.
- Local/small-model fallbacks for cost control on library replays.
