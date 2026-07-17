---
name: scene-dsl
description: Use when adding, changing, or reviewing anything in the Scene DSL (packages/schema) — new scene capabilities, effect ops, entity kinds, or schema refactors. Enforces versioning, additive-evolution, and fixture rules.
---

# Changing the Scene DSL

The Scene DSL is the contract between the AI Director and the engine. Every change here
ripples into: engine rendering, Director prompts, structured-output JSON Schema, golden
fixtures, and (once the library exists) every published universe bundle.

## Before you edit

1. Read `packages/schema/src/` end to end — it's small on purpose.
2. Ask: can the engine actually render what this expresses? If not, the engine change is
   part of this task (DSL must stay closed-world — see ADR-0001).
3. Ask: is this additive? Adding an optional field or a new union member is additive.
   Renaming, removing, changing a type, or making optional→required is **breaking** and
   requires a `dslVersion` bump plus a migration for stored bundles.

## Checklist for every DSL change

- [ ] Zod schema updated; types flow from `z.infer` only (no hand-written parallel types)
- [ ] New capability has a golden fixture in `packages/schema/fixtures/` showing intended
      use — fixtures are the DSL's documentation and the Director's few-shot examples
- [ ] `npm run typecheck` and schema tests pass
- [ ] If the engine exists for this capability: engine handles it + unit test
- [ ] Director prompt docs that enumerate DSL capabilities updated in the same change
- [ ] Breaking? → bump `dslVersion`, write migration, note in DECISIONS.md if
      architecture-shaping

## Design tastes

- Prefer one general mechanism over three specific ones (e.g., a generic `effects` op
  beats bespoke `giveItem`/`takeItem`/`setFlag` trios) — but only when the engine can
  enforce it safely.
- Every free-form string the model can emit should have a length cap in the schema.
- IDs are model-authored slugs (`"innkeeper-vess"`); the schema enforces format, the
  server enforces referential integrity against the scene/canon.
