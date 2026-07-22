import type { StoryPath } from "@unwritten/schema";

/**
 * STORY.md's fixed seed facts, loaded as immutable, highest-priority canon
 * the moment a path is chosen (story-bible skill: quote seeds near-verbatim;
 * paraphrase drift is how contradictions creep in). KAITO and YUNA are the
 * owner's placeholder names.
 */
export const PATH_SEED_CANON: Readonly<
  Record<Exclude<StoryPath, "shared">, ReadonlyArray<{ statement: string; entities: string[] }>>
> = {
  her: [
    {
      statement:
        "Yuna was summoned into a classic fantasy world — goblins, elves, royalty, magic, monsters, kingdoms.",
      entities: ["yuna"],
    },
    {
      statement:
        "People from the human realm sometimes carry dormant superpowers that only activate in the fantasy world; Yuna's dormant power is the strongest ever detected.",
      entities: ["yuna"],
    },
    {
      statement:
        "Yuna was summoned by the Villainess, a powerful antagonist native to the fantasy world, who wants to kill Yuna, steal her power, or use her.",
      entities: ["yuna", "villainess"],
    },
    {
      statement:
        "Yuna's overarching goal is fixed: escape the fantasy world and return home to her family and to Kaito. She never settles in permanently; the pull home is the spine of her arc.",
      entities: ["yuna", "kaito"],
    },
  ],
  his: [
    {
      statement:
        "When Yuna disappeared, the world forgot her: reality reorganized, her parents have one less child and no memory of raising her, and records of her are gone.",
      entities: ["yuna", "kaito"],
    },
    {
      statement:
        "Only Kaito remembers Yuna. No one else remembers her at the start of his path, and any corroborating trace he finds can never come trivially easy.",
      entities: ["kaito", "yuna"],
    },
    {
      statement:
        "Kaito does not know Yuna was transported to another world, and he must not find out cheaply; his early arc is grief, doubt, and the social cost of insisting on a person no one believes existed.",
      entities: ["kaito", "yuna"],
    },
    {
      statement:
        "Kaito's overarching goal is fixed: figure out what happened to Yuna and find a way to save her.",
      entities: ["kaito", "yuna"],
    },
  ],
};
