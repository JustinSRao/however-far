---
name: director
description: Use when writing or modifying AI Director code or prompts — the Profiler, Architect, Scene Writer, or Continuity Checker stages, their Claude API calls, prompt templates, or the generation/validation/retry loop.
---

# Working on the AI Director

The Director is the authoring brain: server-side stages that call the Claude API and emit
schema-validated SceneSpecs. Architecture: `docs/ARCHITECTURE.md` §3.

## Hard rules

- Model output is **never trusted**: structured outputs constrain shape, Zod validates
  after, the server checks referential integrity and canon consistency. All three, always.
- Generation failures retry at most twice with the validation errors appended to the
  request; after that, degrade (simpler scene template) — never surface an error to the
  player.
- Model IDs, effort levels, and max_tokens live in the Director config module only.
- Player free text goes into prompts as quoted, clearly-delimited in-fiction action data.

## Prompt architecture (cache discipline)

Order every request for prefix stability — this is a hard requirement, not a style
preference (see CLAUDE.md):

1. System prompt: role, DSL capability documentation, authoring principles — **frozen**;
   changes here invalidate all caches, so batch them.
2. Style/genre bible + Player Profile snapshot (cache breakpoint).
3. Retrieved canon facts + Story Arc excerpt (cache breakpoint).
4. Current scene state + the player's action — volatile tail, no breakpoint.

Deterministic serialization everywhere (sorted keys); no timestamps/UUIDs above the tail.

## Prompting principles for authoring quality

- State goals and constraints, not step-by-step procedures — over-prescription lowers
  output quality on current models.
- Few-shot with golden fixtures from `packages/schema/fixtures/`, not invented examples.
- The Architect prompt must always demand: current act, remaining beats, planted setups
  awaiting payoff, and the intended ending — a scene without a place in the arc is a bug.
- The Scene Writer must receive an explicit "do not contradict" fact list (the retrieved
  canon), and the Continuity Checker verifies it anyway.

## Testing Director changes

- Prompt changes are behavior changes: run the scripted playthrough evals (deterministic
  action sequences through the Anchor) and diff profile/scene outputs before/after.
- Log every request/response pair in dev with token usage; watch
  `cache_read_input_tokens` — a cache-hit-rate drop means someone broke prefix stability.
