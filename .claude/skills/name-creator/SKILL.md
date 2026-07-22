---
name: name-creator
description: Use whenever ANY character in the game gets a name — hand-authored content, Director prompt templates, NPC generation, or renaming the protagonists. Names are always Japanese and always derived from the character's personality.
---

# Name creator — every name means something

Owner directive (2026-07-22, ADR-0014): **every character name in the game is a Japanese
name connected to that character's personality.** No exceptions — his real-world Japan,
her fantasy world (its people use Japanese names too; it reads as anime-fantasy, which is
the point), main cast, and one-scene NPCs alike.

## The process

1. **Extract 2–3 defining traits** of the character (from their design, role, or the
   Director's entity description). Not their job — their *nature*: steadfast, prickly,
   nurturing, two-faced, restless.
2. **Choose kanji whose meanings encode those traits**, then a natural Japanese name
   built from them. The connection may be direct (誠 makoto = sincerity for an honest
   character) or ironic/foreshadowing (a traitor named 忠 tadashi = loyalty) — ironic
   names must be intentional and payoff-planned, never accidental.
3. **Given name required; family name** for real-world characters (his path) and for
   fantasy nobility/royalty; optional elsewhere. Fantasy characters may carry an epithet
   instead of a surname ("Rin of the Ashgrove").
4. **Record the connection.** The name, its kanji, its reading, and the trait link
   become a canon fact at the character's first appearance (e.g.
   `Aoi (葵, "hollyhock" — turns toward the sun) — named for her stubborn optimism`).
   This is what keeps the Continuity Checker able to catch a renamed or
   personality-drifted character.
5. **Check for collisions** against existing canon before committing — no two named
   characters in one playthrough share a reading unless the story does it on purpose.

## Trait → kanji starting points (examples, not a lookup table)

| Trait | Kanji directions |
|---|---|
| steadfast, protective | 守 (protect), 岩 (rock), 盾 (shield), 剛 (sturdy) |
| bright, hopeful | 陽 (sun), 明 (bright), 晴 (clear sky), 光 (light) |
| gentle, nurturing | 優 (kindness), 育 (nurture), 和 (harmony), 恵 (blessing) |
| sharp, cunning | 鋭 (keen), 智 (wisdom), 狐 (fox), 策 (scheme) |
| melancholy, yearning | 望 (longing), 遥 (distant), 雫 (droplet), 影 (shadow) |
| fierce, driven | 炎 (flame), 嵐 (storm), 猛 (fierce), 竜 (dragon) |
| duplicitous (ironic) | virtue kanji worn as a mask: 忠 (loyalty), 純 (purity) |

Readings can be common (Haruki, Aoi, Ren, Shizuku) or rare — prefer names a Japanese
speaker would accept as a name, not kanji mashed together.

## Integration rules

- **Director prompts:** the World Writer's prompt template must state this rule and
  require, for every newly named entity, a `nameMeaning` note (kanji + trait link) that
  gets extracted into canon. If you touch naming-related prompt text, keep that
  requirement intact.
- **Villainess included:** her name should be beautiful and mean something chilling in
  hindsight.
- **Protagonists:** Itsuki (樹, rooted and steadfast) and Suzune (鈴音, the bell that
  called her) are final (ADR-0016) — never rename them.
- **Places/items** are exempt (name them in-world as fits the fiction), but named
  *personified* things — a sword with a soul, an AI, a spirit — count as characters.
