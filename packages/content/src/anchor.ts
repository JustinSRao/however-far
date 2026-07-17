import { SceneSpec } from "@unwritten/schema";

/**
 * THE ANCHOR — the fixed, hand-written opening every player shares.
 * It is sacred (CLAUDE.md invariant 4): never generated, never "improved" by
 * AI output, identical for every player forever.
 *
 * It is also an instrument. Every choice below probes something:
 *   scene 1 — approach (aggression / caution / curiosity / sociability)
 *   scene 2 — morality and humor tolerance
 *   scene 3 — genre appetite (the object taken is a genre vote)
 * Free text is enabled everywhere; what players type is the richest signal.
 *
 * Deliberately genre-neutral: a road, a fire, a stranger, a box, smoke on the
 * horizon. Could become horror, mystery, war story, romance, or comedy.
 */

const waking = {
  dslVersion: 0,
  id: "anchor-waking",
  title: "The Road at Dawn",
  location: {
    id: "old-road",
    name: "The Old Road",
    description:
      "A rutted road between grey fields, an hour before sunrise. Mist. A small fire burns on the verge.",
  },
  narration:
    "You wake on packed earth with dew in your hair and no memory of lying down. The road stretches both ways into mist. A few steps off the verge, a small fire crackles, tended by a figure in a travel-stained coat who has certainly already seen you. Beside you in the grass sits a narrow wooden box, latched, with your name burned into the lid — though you could not say, just now, who burned it there, or when. Far off to the east, a thin column of smoke climbs into the lightening sky. It is too straight, and too black, to be a chimney.",
  entities: [
    {
      id: "stranger",
      name: "The Stranger",
      description:
        "A figure at the fire, neither young nor old, with the patience of someone who has waited before.",
      role: "character",
    },
    {
      id: "named-box",
      name: "The Box With Your Name",
      description: "Narrow, wooden, latched. Your name is burned into the lid.",
      role: "prop",
    },
  ],
  dialogue: [
    {
      speakerId: "stranger",
      text: "Kettle's near boiled. You slept like the dead — which, around here, is worth being glad about.",
    },
  ],
  onEnterEffects: [],
  choices: [
    {
      id: "demand-answers",
      label: "Stand up fast and demand to know who they are and what happened to you.",
      effects: [{ op: "setFlag", key: "approach-aggressive", value: true }],
      transition: { type: "scene", sceneId: "anchor-fire" },
    },
    {
      id: "watch-quietly",
      label: "Stay low. Watch the stranger a while before revealing you're awake.",
      effects: [{ op: "setFlag", key: "approach-cautious", value: true }],
      transition: { type: "scene", sceneId: "anchor-fire" },
    },
    {
      id: "examine-box",
      label: "Ignore the stranger. Examine the box with your name on it.",
      effects: [{ op: "setFlag", key: "approach-curious", value: true }],
      transition: { type: "scene", sceneId: "anchor-fire" },
    },
    {
      id: "join-fire",
      label: "Carry the box to the fire and sit down across from them.",
      effects: [{ op: "setFlag", key: "approach-social", value: true }],
      transition: { type: "scene", sceneId: "anchor-fire" },
    },
  ],
  freeText: { enabled: true, placeholder: "Or do something else…" },
} satisfies unknown;

const fire = {
  dslVersion: 0,
  id: "anchor-fire",
  title: "Tea With a Stranger",
  location: {
    id: "old-road",
    name: "The Old Road",
    description:
      "The verge of the road. The fire has settled to coals; the mist is thinning.",
  },
  narration:
    "However you played it, you end up where everyone ends up: at the fire, with the box between you and the stranger, and two chipped cups of something that is mostly tea. The stranger introduces themself as Marlow — no first name or perhaps no last one — and does not ask for yours, which you notice. The smoke to the east has doubled. Marlow's eyes keep going to it the way a tongue goes to a broken tooth. There is half a loaf of bread in your coat pocket. You have no idea how it got there, but you are suddenly very hungry, and Marlow, you realize, is hungrier.",
  entities: [
    {
      id: "marlow",
      name: "Marlow",
      description:
        "The stranger at the fire. Travel-stained coat, careful hands, an unasked question behind every asked one.",
      role: "character",
    },
    {
      id: "named-box",
      name: "The Box With Your Name",
      description: "It sits between you. The latch, you notice, has no lock.",
      role: "prop",
    },
  ],
  dialogue: [
    {
      speakerId: "marlow",
      text: "That smoke's the third this month. Whole granary at Ferrow's Cross went up the same way. Nobody walks out of those fires, and nobody finds bones in them either.",
    },
    {
      speakerId: "marlow",
      text: "You don't remember the road, do you. It's all right. The road remembers you — that box didn't write itself.",
    },
  ],
  onEnterEffects: [{ op: "setFlag", key: "met-marlow", value: true }],
  choices: [
    {
      id: "share-bread",
      label: "Break the loaf in half and give Marlow the larger piece.",
      effects: [{ op: "setFlag", key: "shared-bread", value: true }],
      transition: { type: "scene", sceneId: "anchor-box" },
    },
    {
      id: "keep-bread",
      label: "Keep the bread hidden. You don't know this person, or this road.",
      effects: [{ op: "setFlag", key: "kept-bread", value: true }],
      transition: { type: "scene", sceneId: "anchor-box" },
    },
    {
      id: "press-smoke",
      label: "Press Marlow about the fires. People don't just vanish.",
      effects: [{ op: "setFlag", key: "pressed-about-smoke", value: true }],
      transition: { type: "scene", sceneId: "anchor-box" },
    },
    {
      id: "joke-about-it",
      label: "\"Nobody finds bones? Well. At least the fires are tidy.\"",
      effects: [{ op: "setFlag", key: "joked-at-fire", value: true }],
      transition: { type: "scene", sceneId: "anchor-box" },
    },
  ],
  freeText: { enabled: true, placeholder: "Or say or do something else…" },
} satisfies unknown;

const box = {
  dslVersion: 0,
  id: "anchor-box",
  title: "What the Box Holds",
  location: {
    id: "old-road",
    name: "The Old Road",
    description: "Full dawn now. The mist is gone. The smoke in the east is not.",
  },
  narration:
    "The latch lifts at your touch as if it had been waiting for exactly your hand. Inside, on a bed of wool, lie four things that have no business sharing a box: a knife with a worn grip and a clean edge; a tarnished key stamped with a symbol you almost remember; a brass compass whose needle ignores north entirely and strains, trembling, toward the eastern smoke; and a letter, folded shut, addressed in handwriting that is unmistakably your own. Marlow looks in, and for the first time since you woke, says nothing at all. Somewhere down the road behind you, a bell begins to ring — slow, deliberate, and getting closer. Whatever you take, take it now.",
  entities: [
    {
      id: "marlow",
      name: "Marlow",
      description: "Silent for once. Watching what you choose, and choosing something about you.",
      role: "character",
    },
  ],
  dialogue: [
    {
      speakerId: "narrator",
      text: "The bell rings again. Closer.",
    },
  ],
  onEnterEffects: [{ op: "setFlag", key: "opened-the-box", value: true }],
  choices: [
    {
      id: "take-knife",
      label: "Take the knife. Whatever is coming, meet it armed.",
      effects: [{ op: "addItem", item: "worn-knife", name: "Worn Knife" }],
      transition: {
        type: "generate",
        hint: "ANCHOR COMPLETE. The player took the knife — they want danger met head-on. The bell arrives. Reveal the genre now and commit to it.",
      },
    },
    {
      id: "take-key",
      label: "Take the key. Locks mean doors, and doors mean answers.",
      effects: [{ op: "addItem", item: "tarnished-key", name: "Tarnished Key" }],
      transition: {
        type: "generate",
        hint: "ANCHOR COMPLETE. The player took the key — they want mystery, locked things, and answers earned. The bell arrives. Reveal the genre now and commit to it.",
      },
    },
    {
      id: "take-compass",
      label: "Take the compass. It knows where it wants to go. Go there.",
      effects: [{ op: "addItem", item: "brass-compass", name: "Brass Compass" }],
      transition: {
        type: "generate",
        hint: "ANCHOR COMPLETE. The player took the compass — they want journey, horizon, and the unknown east. The bell arrives. Reveal the genre now and commit to it.",
      },
    },
    {
      id: "take-letter",
      label: "Take the letter in your own handwriting. Whatever you were, you wrote to whoever you are.",
      effects: [{ op: "addItem", item: "self-letter", name: "Letter in Your Own Hand" }],
      transition: {
        type: "generate",
        hint: "ANCHOR COMPLETE. The player took the letter written in their own hand — they want character, memory, and personal stakes. The bell arrives. Reveal the genre now and commit to it.",
      },
    },
  ],
  freeText: { enabled: true, placeholder: "Or do something else entirely…" },
} satisfies unknown;

/** Validated on first access; throws at startup (not mid-play) if malformed. */
let cache: ReadonlyMap<string, SceneSpec> | undefined;

export const ANCHOR_ENTRY_ID = "anchor-waking";

export function getAnchorScenes(): ReadonlyMap<string, SceneSpec> {
  if (!cache) {
    const parsed = [waking, fire, box].map((s) => SceneSpec.parse(s));
    cache = new Map(parsed.map((s) => [s.id, s]));
  }
  return cache;
}

/** True when the given scene id is part of the Anchor. */
export function isAnchorScene(sceneId: string): boolean {
  return getAnchorScenes().has(sceneId);
}

/**
 * Canon established by the Anchor itself — appended to the ledger at anchor
 * exit so generated scenes can't contradict the opening. Hand-written and
 * deterministic (no extraction pass over sacred content).
 */
export const ANCHOR_CANON: ReadonlyArray<{
  statement: string;
  entities: string[];
}> = [
  {
    statement:
      "The player woke at dawn on the Old Road with no memory of the previous night.",
    entities: ["old-road"],
  },
  {
    statement:
      "Marlow is a traveler the player met at a roadside fire; Marlow knows the road and fears the eastern fires.",
    entities: ["marlow", "old-road"],
  },
  {
    statement:
      "A narrow wooden box bearing the player's burned-in name opened only at the player's touch.",
    entities: ["named-box"],
  },
  {
    statement:
      "Black smoke rises in the east; fires like it consume whole places and leave no bones.",
    entities: ["eastern-smoke"],
  },
  {
    statement:
      "Marlow said the granary at Ferrow's Cross burned the same way as the eastern fires.",
    entities: ["marlow", "ferrows-cross", "eastern-smoke"],
  },
  {
    statement:
      "A slow, deliberate bell is approaching along the road behind the player.",
    entities: ["the-bell", "old-road"],
  },
];
