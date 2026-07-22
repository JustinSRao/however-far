---
name: story-bible
description: Use when working on anything that touches the fixed story — Director prompts, prologue content, path framing, canon seeding, ending/threshold logic, or the Reunion. Enforces the STORY.md contract.
---

# The story bible contract

`docs/STORY.md` is the owner-authored, fixed narrative skeleton (ADR-0009). It has
Anchor-level protection: **never generate, rewrite, "improve", or contradict it.**
Changes to STORY.md are made only by the project owner or at their explicit direction.

## Hard rules (mirror of STORY.md "Rules for the Director")

1. STORY.md seed facts load as **immutable, highest-priority canon** at session start.
   The Continuity Checker must reject any spec contradicting them.
2. **Never resolve the central mystery early.** Itsuki learning "she's in another world"
   and Suzune finding a working way home are late-game beats — the Architect plans them,
   the World Writer never leaks them.
3. **Never kill, corrupt, or romantically reassign a protagonist.**
4. **Tone stays in the path's register.** Path A (Suzune) is an adventure that may get
   dark; Path B (Itsuki) is a drama that may have warmth. Profiling tunes intensity
   within the register, never across it.
5. **No explicit cross-path crossovers before the Reunion.** Small asymmetric echoes
   (dreams, songs, a feeling of being watched over) are encouraged.
6. **Both paths end at a threshold, not a resolution.** Solo endings must leave the
   Reunion necessary and possible.

## Working conventions

- Character names Itsuki (樹) and Suzune (鈴音) are **final** (ADR-0016). Never rename
  or re-spell them; their kanji meanings are canon.
- When writing Director prompts, quote seed facts verbatim from STORY.md rather than
  paraphrasing — paraphrase drift is how contradictions creep in.
- The shared Prologue is authored fixture content (like the old Anchor). Its beats are
  listed in STORY.md; its files live with the other authored content and are
  hand-written only.
- Anything not fixed by STORY.md's contract table is Director territory — don't
  hand-author content beyond the Prologue "to help".
- The Reunion (Phase 7) is long-term, but **canon must stay mergeable**: when designing
  canon storage or export, check that two playthroughs' canons (one per path) could be
  combined into one finale context.
