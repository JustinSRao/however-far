import type { SoloPath } from "@howeverfar/schema";

/**
 * STORY.md's fixed seed facts, loaded as immutable, highest-priority canon
 * the moment a path is chosen (story-bible skill: quote seeds near-verbatim;
 * paraphrase drift is how contradictions creep in). The protagonist names
 * Itsuki and Suzune are final (ADR-0016).
 */
export const PATH_SEED_CANON: Readonly<
  Record<SoloPath, ReadonlyArray<{ statement: string; entities: string[] }>>
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

/**
 * The Reunion's fixed seeds (Phase 7) — loaded as immutable canon the moment
 * two calls answer each other.
 *
 * STORY.md fixes the Reunion's shape without fixing its content: both paths
 * end at a threshold, only the Reunion resolves, and the finale is generated
 * from both players' canon. These state that shape as facts the Director
 * cannot write around. The one inference beyond STORY.md — that the seam
 * between the two worlds is the railway underpass — follows from where she
 * vanished, and is recorded in docs/REUNION.md for the owner to keep or cut.
 */
export const REUNION_SEED_CANON: ReadonlyArray<{
  statement: string;
  entities: string[];
}> = [
  {
    statement:
      "The two paths are the same span of time lived from either side: everything Suzune did in the other world and everything Itsuki did here happened at once, to each other, without either of them knowing.",
    entities: ["suzune", "itsuki"],
  },
  {
    statement:
      "Suzune stands at a way home she cannot cross alone, and Itsuki has learned what happened to her and cannot reach her alone. Neither threshold was ever passable from one side; that is what has been true about it all along.",
    entities: ["suzune", "itsuki"],
  },
  {
    statement:
      "The place where the two worlds touch is the railway underpass on Aozora Lane, where she vanished — on his side an underpass, on hers whatever her world made of the same seam.",
    entities: ["railway-underpass", "aozora-lane", "suzune", "itsuki"],
  },
  {
    statement:
      "The crossing can only be worked from both sides at once, by both of them, using what each of them earned on their own side. Nothing either of them learned alone is enough.",
    entities: ["suzune", "itsuki"],
  },
  {
    statement:
      "This is the only ending that resolves. They reach each other. Neither dies, neither gives up, neither is left behind, and the world that forgot her does not get to keep forgetting.",
    entities: ["suzune", "itsuki"],
  },
];
