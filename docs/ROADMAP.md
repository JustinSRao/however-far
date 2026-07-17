# Roadmap

Phases are cumulative; each ends with something playable. Don't start a phase's polish
before the previous phase's loop is proven.

## Phase 0 — Foundation (current)

- [x] Repo, docs, Claude skills, decision records
- [x] `packages/schema`: Scene DSL v0 (Zod) — narration, dialogue, choices, free text,
      flags/inventory effects, art requests (unused for now), transitions
- [ ] `packages/engine`: pure reducer over (GameState, SceneSpec, PlayerAction), fully
      unit-tested, zero AI dependencies
- [ ] Golden SceneSpec fixtures that double as DSL documentation

## Phase 1 — The text loop (prove the concept)

The whole vision, minus graphics, in a terminal/basic web UI.

- [ ] Hand-write the **Anchor** as a set of fixed SceneSpecs (the only authored content)
- [ ] Director v0: Profiler + Scene Writer (no Architect yet) — play signals in, next
      SceneSpec out, structured outputs + Zod validation + regeneration on failure
- [ ] Canon Ledger v0: fact extraction per accepted scene, keyword retrieval into prompts
- [ ] Play a 20–30 minute session that visibly *becomes a different genre* depending on
      how the Anchor is played — this is the go/no-go demo

## Phase 2 — Whole-game coherence

- [ ] Architect: full-game Story Arc, revision-on-derailment, planted setups → payoffs
- [ ] Continuity Checker (Haiku) gating scene acceptance against canon
- [ ] Endings: the Arc drives toward a real conclusion; playthroughs complete
- [ ] Speculative generation + streaming; latency good enough to feel like a game
- [ ] Session persistence: quit and resume a playthrough

## Phase 3 — Presentation

- [ ] Web client: React + PixiJS, scene layout, choice UI, free-text input, streamed text
- [ ] Style bible generation at genre-reveal time
- [ ] Pixel-art pipeline: image model → pixelize/palette-lock → content-hash cache,
      placeholder-first rendering
- [ ] Portraits for recurring characters, backgrounds per location

## Phase 4 — The library

- [ ] Universe Bundle export at playthrough end
- [ ] Import/replay: canon + arc as fixed constraints, fresh scene generation
- [ ] Public library service: browse, play free, attribution to creator
- [ ] Accounts, moderation/report pipeline, content policy for published bundles
- [ ] Cost model for free play (this is the hard open question of Phase 4)

## Open questions (revisit each phase)

- How much mechanical depth (combat systems, stats) should the DSL support vs. keeping
  everything narrative-resolved?
- Multiplayer-adjacent ideas (shared universes, async ghosts) — out of scope until
  Phase 4 ships.
- Local/small-model fallbacks for cost control on library replays.
