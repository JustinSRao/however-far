# Vision

## What this is

A playable game where **the entire game is developed by AI in real time while the player
plays it**. Not procedural generation from a content pool — genuine authorship, live, by a
model, shaped entirely by the player's behavior.

## The player experience

1. **The Anchor.** Every player starts in the same short, hand-crafted opening sequence.
   It is deliberately genre-neutral — a situation, a few characters, a handful of choices,
   free-text input. It always stays the same, forever. It is the one part of the game that
   is written by humans.

2. **The Read.** The Anchor is secretly an instrument. How the player acts in it — what
   they examine, whether they fight or talk, what they type, what they ignore, their pace,
   their tone — is analyzed to build a **Player Profile**: preferred genre, pacing,
   combat/dialogue/exploration appetite, moral leanings, humor tolerance.

3. **The Unfolding.** From that point on, the AI Director authors the game live: the world,
   the story, the characters, the mechanics that get emphasized, the art. The player is
   never told "your genre is horror" — the game simply *becomes* the game they were
   implicitly asking for. Profiling never stops; the game keeps adapting through the entire
   playthrough.

4. **The Whole.** This is not an endless sandbox. Every playthrough is a complete game:
   it has an arc, escalation, payoff, and an ending. The Director maintains a full-game
   plan at all times and revises it rather than improvising blindly. Nothing generated may
   contradict what came before.

5. **The Library.** When a playthrough ends, the player can export their universe — the
   world, canon, story arc, characters, and art — to a **public game library**. Anyone can
   play any published universe for free. The overarching world and major story beats stay
   fixed (that's what makes it *that* game), but scenes, dialogue, and character
   interactions are generated fresh for each new player, so two people playing the same
   published universe have genuinely different experiences inside the same story.

## Non-negotiables

These hold no matter how the implementation evolves:

- **The end result is a game that doesn't exist** until it is played. No pre-authored
  content beyond the Anchor.
- **Coherence over novelty.** The full game scope is always considered. Generated content
  must respect established canon; contradictions are bugs.
- **It must always be playable.** A generation failure may cost latency, never a crash or
  a nonsense state. (This is what the data-not-code rule in the README guarantees.)
- **The Anchor is sacred.** Hard-coded, identical for every player, never generated.
- **Published universes are free to play.**

## Presentation (art) direction

Long-term the game should have real graphics. Near-term, the achievable and stylistically
safe target is **AI-generated pixel art**: sprites, backgrounds, portraits, key art —
generated on demand by image models, post-processed to a locked palette and grid so
everything looks like one game. Text-first presentation comes first (it's the fastest path
to proving the core loop), with the art pipeline layered on without changing the engine.

## What "AI-developed" means here (and what it doesn't)

The AI authors: world, plot, scenes, characters, dialogue, choices, encounter rules, item
and ability definitions, art direction and art. The AI does **not** author executable code
at runtime. The engine — rendering, input, state transitions, validation, persistence — is
ordinary software, built once, by us (with AI assistance at development time). This split is
what makes the vision shippable with current models: models are excellent authors and
unreliable runtime programmers, so we let them author.
