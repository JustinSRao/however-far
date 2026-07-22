# STORY.md — the story bible

This is the **fixed narrative skeleton** of the game. It is hand-authored, owned by the
project owner, and has the same protected status as the Anchor (CLAUDE.md invariant 4):
**the Director may never contradict, rewrite, or "improve" anything in this file.**
Everything the Director generates lives in the space *between* the fixed beats below.

The protagonists' names are final (ADR-0016/0017), chosen by the ADR-0014 process:

- **ITSUKI NEMOTO** (根本 樹) — the boy: Nemoto "root, origin" + Itsuki "tree" — the
  rooted tree; when reality reorganizes around him, he stays planted and keeps what he
  was given.
- **SUZUNE TŌYAMA** (遠山 鈴音) — the girl: Tōyama "distant mountain" + Suzune
  "bell-sound" — bright, ringing, carries down the whole street; in hindsight, named
  for the bell only she could hear, ringing from however far. The foreshadowing is
  intentional: her name is why the bell could call her, and her full name encodes the
  game's title.

They address each other by bare given names (childhood-friend intimacy — see the
`dialogue` skill for the game's honorifics rules).

---

## Premise

Itsuki and Suzune are high-school seniors, next-door neighbors, childhood friends, and
deeply — genuinely — in love. Not puppy love: the kind of bond where two people are
simply *meant for each other*, and everyone around them knows it.

One day, on their walk home from school, something happens. Suzune disappears.

From that moment the story splits into two paths, and the player chooses which one to
live.

## The Shared Prologue (the new Anchor)

Every playthrough — both paths — begins with the same hand-authored prologue
(the equivalent of the trilogy's "identical first three chapters"):

1. **Ordinary days.** Senior year. The player inhabits the couple's everyday life —
   walking to school, small promises, the texture of a relationship that has existed
   since childhood. This section quietly profiles the player (what they linger on, how
   they talk to NPCs, whether they explore or beeline, tone of free-text input).
2. **The last walk home.** The disappearance event. Scripted, identical for everyone,
   and deliberately ambiguous — neither the player nor the characters understand what
   happened.
3. **The split.** The player chooses a path: play as Suzune, or play as Itsuki.
   (Choosing is explicit — this is the one place the game asks directly.)

The prologue is authored content (fixtures, like the old Anchor), never generated.
It ends at the path choice; from there, the Director takes over inside the rails below.

## Path A — Suzune (isekai fantasy adventure)

**Tone:** classic anime isekai — wonder, danger, found allies, growing power.
**Mechanical emphasis:** exploration, magic, combat, survival, faction navigation.

Fixed facts (canon seeds, immutable):

- Suzune was **summoned** into a classic fantasy world: goblins, elves, royalty, magic,
  monsters, kingdoms.
- The reason: people from the human realm sometimes carry **dormant superpowers that
  only activate in the fantasy world**. Suzune's dormant power is the strongest ever
  detected.
- She was summoned by the **Villainess** — a powerful antagonist native to the fantasy
  world — who wants one of three things (which one is generated per playthrough, and may
  evolve): to kill Suzune, to steal her power, or to use her.
- Suzune's overarching goal is fixed and unchangeable: **escape this world and return home**
  to her family and to Itsuki. She never "settles in" permanently; the pull home is the
  spine of her arc.

Everything else — the kingdoms, the allies, the shape of her power, the Villainess's
schemes, the escape attempts, every town, dungeon, companion, and betrayal — is generated
per playthrough, shaped by the player profile.

## Path B — Itsuki (emotional / psychological drama)

**Tone:** grounded, aching, quietly unsettling. The question anime never answers:
*when someone is spirited away to another world, what happens to the people who loved
them?*
**Mechanical emphasis:** investigation, dialogue, relationships, memory, evidence.

Fixed facts (canon seeds, immutable):

- When Suzune disappeared, **the world forgot her**. Reality reorganized: her parents have
  one less child and no memory of raising her; school records, photos, group chats — the
  world is seamless without her.
- **Only Itsuki remembers.** No exceptions at the start of the path. (Whether he ever
  finds another person, object, or trace that corroborates him is generated per
  playthrough — but it can never be trivially easy.)
- Itsuki **does not know** she was transported to another world, and must not find out
  cheaply. His early arc is grief, doubt (*is she real? am I unwell?*), and the social
  cost of insisting on a person no one else believes existed.
- His overarching goal is fixed: **figure out what happened and find a way to save her.**

Everything else — the leads he chases, who believes him and who turns on him, what traces
of Suzune leak through, how close he gets to the truth — is generated per playthrough,
shaped by the player profile.

**Presentation pillar — the game forgets her too (ADR-0015).** On his path, the
interface itself participates in the erasure: Suzune's portrait absent from menus that
should hold it, save-slot labels quietly rewriting themselves, dialogue-log entries about
her vanishing between sessions, conversations replaying as if they never happened. The
player should sometimes doubt the *game* remembers her — mirroring Itsuki doubting his own
mind. Strictly sandboxed to the game's own UI and data (never real files), never actually
destructive, and unique to his path.

## The Reunion (endgame — multiplayer, the "DLC")

- A solo playthrough of either path runs a **complete arc** with a real climax and a
  path ending — but the path ending is a **threshold, not a resolution**: Suzune reaches
  the way home but cannot cross alone; Itsuki discovers the truth but cannot reach her
  alone.
- **The game can only be truly beaten in the Reunion**: a cross-platform multiplayer
  session pairing a player who completed Path A with a player who completed Path B. The
  final act is generated from **both players' canon** — the allies Suzune made and the
  truths Itsuki uncovered both matter in the finale, so every Reunion is unique to that
  pair of playthroughs.
- This is long-term scope (see ROADMAP Phase 7). Nothing in earlier phases may
  structurally prevent it: both paths' canon must export cleanly enough to be merged.

## What is fixed vs. generated (the contract)

| Fixed forever (this file) | Generated per playthrough (the Director) |
|---|---|
| The prologue, beat for beat | Everything after the path choice, moment to moment |
| The disappearance and its ambiguity | How and when each path's truths surface |
| Path A seeds: summoned, dormant power, Villainess, goal = escape home | The fantasy world's places, factions, characters, quests, her power's expression |
| Path B seeds: world forgot her, only Itsuki remembers, goal = find and save her | The investigation, the people, the traces, the psychological texture |
| Both paths end at a threshold; only the Reunion resolves | The entire shape of the road to that threshold |
| The two protagonists and their love | Every other character in the game |

## Naming (ADR-0014)

Every named character in the game — both worlds — carries a **Japanese name whose
meaning connects to their personality**, chosen via the `name-creator` skill and
recorded (name, kanji, trait link) as a canon fact at first appearance.

## Rules for the Director

1. Never contradict a fixed fact. The Continuity Checker treats this file's seeds as
   highest-priority canon.
2. Never resolve the central mystery early. Itsuki learning "she's in another world" is a
   late-game beat; Suzune finding a working way home is a late-game beat.
3. Never kill, corrupt, or romantically reassign a protagonist. Their bond is the point.
4. Tone discipline per path: Path A may get dark, but it is an adventure; Path B may have
   warmth, but it is a drama. Profiling tunes intensity *within* the path's register, not
   across it.
5. The other path exists. Small asymmetric echoes (a dream, a song, a feeling of being
   watched over) are encouraged; explicit crossovers before the Reunion are forbidden.
