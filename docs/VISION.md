# Vision

## What this is

A **top-down 2D pixel-art RPG** — walkable maps, NPCs, quests, encounters, real game
mechanics and UI — where the world between the story's fixed beats is **authored by AI in
real time while the player plays**. Not procedural generation from a content pool:
genuine authorship, live, by a model, shaped by the player's behavior.

It is **not** a choose-your-own-adventure novel. Text (dialogue, narration) is one channel
of the game, not the game itself. The player moves a character through a world, and the
world is being written just ahead of their footsteps.

## The story

The game is built on a fixed narrative skeleton — the dual-POV story in
[STORY.md](STORY.md): two high-school sweethearts, next-door neighbors, meant for each
other; one day the girl disappears. The player chooses a path:

- **Her path** — a classic isekai fantasy adventure: summoned to another world by a
  villainess for her dormant power, fighting to escape back home.
- **His path** — an emotional/psychological drama: the world forgot she ever existed,
  only he remembers, and he has to find out what happened and save her.

The skeleton is sacred; everything between its beats is generated per playthrough.

## The player experience

1. **The Prologue (the Anchor).** Every player starts in the same hand-authored opening:
   the couple's ordinary life, the last walk home, the disappearance, the path choice. It
   is the only authored content in the game and it never changes.

2. **The Read.** The prologue is secretly an instrument. How the player acts in it — what
   they examine, who they talk to, how they move, what they type — builds a **Player
   Profile**: pacing, combat/dialogue/exploration appetite, moral leanings, tone.
   Profiling never stops; the game keeps adapting the entire playthrough.

3. **The Unfolding.** From the path choice on, the AI Director authors the game live
   *within the story rails*: maps, towns, NPCs, quests, encounters, dialogue, items,
   abilities, art. Two players on the same path get genuinely different games — different
   allies, different villain schemes, different roads to the same threshold.

4. **The Whole.** Every solo playthrough is a complete arc with escalation, payoff, and a
   path ending. The Director maintains a full-game plan at all times and revises it
   rather than improvising blindly. Nothing generated may contradict what came before.

5. **The Reunion (long-term).** A solo path ends at a threshold that cannot be crossed
   alone. The true ending is **cross-platform multiplayer**: a player who finished her
   path joins a player who finished his path, and the final act is generated from both
   playthroughs' canon. This is the "DLC" and the reason the game exists.

## Non-negotiables

These hold no matter how the implementation evolves:

- **The story skeleton (STORY.md) and the Prologue are sacred.** Hand-authored, identical
  for every player, never generated, never contradicted.
- **Everything between the beats is unwritten** until it is played. No pre-authored
  content beyond the Prologue and the skeleton's seed facts.
- **It is a game, not a novel.** Mechanics, movement, and play come first; prose serves
  them.
- **Coherence over novelty.** Generated content must respect established canon;
  contradictions are bugs.
- **It must always be playable.** A generation failure may cost latency, never a crash or
  a nonsense state (the data-not-code rule guarantees this).
- **Zero spend beyond the model API.** No paid services, infra, or assets: the OpenAI API
  calls that drive the story (and, within the same budget, `gpt-image-2` art generation)
  are the only money this project costs. Everything else is free/open-source.

## Presentation

**Pixel art, everywhere, coherent.** Three sources, one look:

1. A curated base library of **CC0 assets** (tilesets, base characters), recolored and
   recombined by our pipeline.
2. **AI-authored sprite data** — the model emits small sprites as palette-indexed grids
   (validated JSON, like everything else it authors).
3. **`gpt-image-2` generation** for hero assets, forced through the deterministic
   post-processing pipeline (grid, palette lock, outline) so it coheres with the rest.

All three flow through the **Asset Studio** — an in-house, agent-operable tool that
validates, normalizes, previews, and catalogs every asset — into a growing **asset
database** that all playthroughs draw from and contribute to.

## Platforms

Web-first (Phaser 3 / TypeScript). Long-term: iOS and Android via Capacitor, Windows and
macOS via Tauri, distributed from the project owner's website — all free toolchains, in
line with the zero-spend rule.

## What "AI-developed" means here (and what it doesn't)

The AI authors: maps, scenes, characters, dialogue, quests, encounter rules, item and
ability definitions, art direction and art. The AI does **not** author executable code at
runtime. The engine — rendering, movement, collision, input, state transitions,
validation, persistence — is ordinary software, built once, by us (with AI assistance at
development time). Models are excellent authors and unreliable runtime programmers, so we
let them author.
