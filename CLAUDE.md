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

## Model API usage (for Director code)

- **The provider is configuration, not architecture** (ADR-0008). Director code targets
  the `ModelClient` interface and never imports a vendor SDK. OpenAI is the default;
  Anthropic is still supported. Adding provider-specific behaviour means editing an
  adapter, never Director logic, prompts, or `packages/schema`.
- Model IDs live in one config module (`packages/director/src/config.ts`) — never scatter
  string literals. Roles declare a provider-neutral `tier` ("strong" / "cheap"); each
  adapter resolves that to its own model id.
- Structured outputs are fed from JSON Schema generated out of the Zod schemas. OpenAI's
  strict subset is handled in `openaiSchema.ts` — if you add an `.optional()` field or a
  root-level union to a model-facing schema, its tests cover you; check they still pass.
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

- **Commit and push as you go.** Every completed, verified unit of work (a package, a
  feature, a doc change) is committed immediately and pushed to `origin main` in the same
  step. Never accumulate a large uncommitted working tree; never end a session with
  unpushed commits. If a push is rejected, pull --rebase and push again before continuing.
- `npm install` at root; `npm run typecheck` and `npm test` must pass before any commit.
- When you make an architecture-shaping choice, append an ADR to `docs/DECISIONS.md` in
  the same change.
- When you finish a roadmap item, check it off in `docs/ROADMAP.md` in the same change.
- Keep this file current: if an instruction here goes stale, fix it in the same PR that
  made it stale.

## Delegation (multi-agent development)

The project owner has authorized free use of subagents. When delegating:

- Delegate **isolated workstreams with stable contracts** (a package with a defined
  interface, the web client against the schema package). Never delegate changes to
  `packages/schema` or the invariants — those are lead-agent work.
- Give the subagent: the relevant docs paths, the exact package boundary, the invariants
  from this file, and the verification commands (`npm run typecheck`, `npm test`).
- Subagents work in worktrees/branches; the lead agent reviews, merges to `main`, and
  pushes. Broken code never lands on `main`.
