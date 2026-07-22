import type { StoryPath } from "@unwritten/schema";

/**
 * STORY.md's fixed seed facts, loaded as immutable, highest-priority canon
 * the moment a path is chosen (story-bible skill: quote seeds near-verbatim;
 * paraphrase drift is how contradictions creep in). The protagonist names
 * Itsuki and Suzune are final (ADR-0016).
 */
export const PATH_SEED_CANON: Readonly<
  Record<Exclude<StoryPath, "shared">, ReadonlyArray<{ statement: string; entities: string[] }>>
> = {
  her: [
    {
      statement:
        "Suzune was summoned into a classic fantasy world — goblins, elves, royalty, magic, monsters, kingdoms.",
      entities: ["suzune"],
    },
    {
      statement:
        "People from the human realm sometimes carry dormant superpowers that only activate in the fantasy world; Suzune's dormant power is the strongest ever detected.",
      entities: ["suzune"],
    },
    {
      statement:
        "Suzune was summoned by the Villainess, a powerful antagonist native to the fantasy world, who wants to kill Suzune, steal her power, or use her.",
      entities: ["suzune", "villainess"],
    },
    {
      statement:
        "Suzune's overarching goal is fixed: escape the fantasy world and return home to her family and to Itsuki. She never settles in permanently; the pull home is the spine of her arc.",
      entities: ["suzune", "itsuki"],
    },
  ],
  his: [
    {
      statement:
        "When Suzune disappeared, the world forgot her: reality reorganized, her parents have one less child and no memory of raising her, and records of her are gone.",
      entities: ["suzune", "itsuki"],
    },
    {
      statement:
        "Only Itsuki remembers Suzune. No one else remembers her at the start of his path, and any corroborating trace he finds can never come trivially easy.",
      entities: ["itsuki", "suzune"],
    },
    {
      statement:
        "Itsuki does not know Suzune was transported to another world, and he must not find out cheaply; his early arc is grief, doubt, and the social cost of insisting on a person no one believes existed.",
      entities: ["itsuki", "suzune"],
    },
    {
      statement:
        "Itsuki's overarching goal is fixed: figure out what happened to Suzune and find a way to save her.",
      entities: ["itsuki", "suzune"],
    },
  ],
};
