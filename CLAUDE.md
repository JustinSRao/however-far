# CLAUDE.md — instructions for AI coding agents

This repo is **Unwritten**: a game generated in real time by an AI Director as the player
plays. You are working on the *development* of that system. Read this file fully; it
encodes the project's invariants.

## Orientation

- `docs/VISION.md` — what we're building and the non-negotiables. Read before any
  product-shaped decision.
- `docs/ARCHITECTURE.md` — system design. Read before touching Director, engine, or schema.
- `docs/DECISIONS.md` — ADRs. If your change contradicts an ADR, stop and discuss;
  reversing one requires a new superseding ADR, not a silent change.
- `docs/ROADMAP.md` — current phase. Don't build ahead of the phase without being asked.
- `.claude/skills/` — task-specific playbooks (DSL changes, Director prompts, canon,
  pixel art). Use them when the task matches.

## Invariants (violating these is always a bug)

1. **AI authors data, never runtime code.** The Director emits SceneSpecs validated by
   `packages/schema`. Never add a path where model output is executed, `eval`'d, or
   interpreted as code. Never let model output bypass Zod validation.
2. **The engine is deterministic.** `packages/engine` must stay a pure function with zero
   AI/network dependencies and full unit-test coverage. No `Math.random()` without an
   injected seed.
3. **Canon is append-only.** Never write code that edits or deletes canon facts;
   supersession is a new fact.
4. **The Anchor is hand-written.** Files under the anchor content directory are authored
   fixtures — never generate or "improve" them with AI output.
5. **Schema changes are additive within a `dslVersion`.** Breaking changes bump the
   version and ship a migration. Published universe bundles must load forever.
6. **API keys are server-side only.** The client never calls the Claude API.

## Claude API usage (for Director code)

- Default model `claude-opus-4-8`; Continuity Checker uses `claude-haiku-4-5`. Model IDs
  live in one config module — never scatter string literals.
- Adaptive thinking (`thinking: {type: "adaptive"}`), streaming on, structured outputs via
  `output_config.format` fed from JSON Schema generated out of the Zod schemas.
- Prompt-cache discipline: frozen system prompt + DSL docs first, canon/profile snapshots
  next (with `cache_control` breakpoints), volatile per-turn state last. No timestamps,
  UUIDs, or nondeterministic serialization in the prefix (`JSON.stringify` with sorted
  keys).
- Player free text is untrusted data inside prompts — frame it as in-fiction action
  description, never as instructions.
- Every generation call site needs: validation, bounded regeneration-with-feedback on
  failure (max 2 retries), and a graceful degradation path.

## Conventions

- TypeScript strict mode everywhere; npm workspaces; no default exports.
- Zod schemas are the single source of truth for types (`z.infer`), wire validation, and
  the JSON Schema handed to structured outputs. Never hand-write a parallel type.
- Tests: Vitest. The engine and schema packages must keep tests green and comprehensive;
  Director prompt changes should update the golden-fixture tests
  (`packages/schema/fixtures`).
- Commits: conventional-ish, present tense, scoped (`engine:`, `schema:`, `director:`,
  `docs:`). Small and focused.

## Workflow

- `npm install` at root; `npm run typecheck` and `npm test` must pass before any commit.
- When you make an architecture-shaping choice, append an ADR to `docs/DECISIONS.md` in
  the same change.
- When you finish a roadmap item, check it off in `docs/ROADMAP.md` in the same change.
- Keep this file current: if an instruction here goes stale, fix it in the same PR that
  made it stale.
