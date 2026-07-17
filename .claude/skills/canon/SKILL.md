---
name: canon
description: Use when working on the Canon Ledger, fact extraction, retrieval into prompts, contradiction checking, or the Story Arc revision logic — anything about keeping the generated game consistent with itself.
---

# Canon & coherence

Coherence is the product's hardest promise: "the entire game scope is always considered
and always makes sense." Canon is the mechanism.

## The model

- **Canon Ledger**: append-only facts, each `{id, statement, entities[], sceneId,
  supersedes?}`. Never edited, never deleted (ADR-0004). An in-world change appends a
  superseding fact.
- **Story Arc**: the Architect's revisable plan. Arc ≠ canon: the arc is intention (may
  change), canon is history (may not).
- **Facts are atomic and entity-tagged.** "Vess owns the inn and hates the guard" is two
  facts. Atomicity is what makes retrieval and contradiction-diffing work.

## Extraction rules

- Extract after a scene is *accepted*, from the final spec — not from drafts.
- Extract only what a future scene could contradict: names, relationships, deaths, world
  rules, promises made, items gained/lost, player-established traits. Not prose flavor.
- Cheap model (`claude-haiku-4-5`) is fine here; recall matters more than elegance.

## Retrieval rules

- Retrieval feeds the Scene Writer: facts tagged with entities present in the upcoming
  scene + facts from the current location + always-include list (deaths, world rules,
  active promises/setups).
- Budget-bounded: cap retrieved facts; prefer recency + supersession-resolved (retrieve
  the superseding fact, not the superseded one — but keep both in the ledger).

## Contradiction checking

- The Continuity Checker receives (candidate spec, retrieved facts) and answers with a
  structured verdict `{ok} | {violations: [{factId, explanation}]}` — never free prose.
- Violations feed the regeneration retry verbatim.
- Keep an eval set of known-contradiction cases (scene + canon → must flag) and grow it
  every time a contradiction slips through in playtesting. That eval set is the regression
  suite for this whole subsystem.
