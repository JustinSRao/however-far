import { AreaSpec, type StoryPath } from "@unwritten/schema";

/**
 * THE PROLOGUE — the fixed, hand-written opening every player shares
 * (STORY.md "The Shared Prologue"; CLAUDE.md invariant 4). Never generated,
 * never "improved" by AI output, identical for every player forever.
 *
 * Like the old text-era Anchor, it is also an instrument. What the player
 * lingers on, who they talk to, which choices they pick with Suzune, whether
 * they examine the small things — all of it feeds the Profiler:
 *   street    — sociability, attention to detail, pace
 *   walk home — sentiment vs. humor vs. action (the promise conversation)
 *   underpass — protectiveness under pressure (the last choices with her)
 *   crossing  — the path choice itself (explicit, the one direct question)
 *
 * Names are final (ADR-0016): Itsuki (樹, rooted, steadfast) and Suzune
 * (鈴音, the bell that called her). The cat is named per ADR-0014: 丸 (maru,
 * "round") — round of body, round of habit, asleep in the same warm spot.
 */

const street = AreaSpec.parse({
  dslVersion: 1,
  id: "prologue-street",
  name: "Aozora Lane, Morning",
  description:
    "Two houses share a hedge on a street so familiar you could walk it with your eyes closed. You have, actually — she led you, laughing, one summer when you were nine. Her gate is eight steps from yours. You counted, once. The morning smells of asphalt and someone's laundry, and Suzune is already waiting.",
  path: "shared",
  width: 16,
  height: 9,
  tiles: [
    { id: "roof", name: "tiled roof", walkable: false, color: "#6b2643", artTag: "town-roof" },
    { id: "wall", name: "house wall", walkable: false, color: "#4a4b5b", artTag: "town-wall" },
    { id: "hedge", name: "shared hedge", walkable: false, color: "#38b764", artTag: "town-hedge" },
    { id: "sidewalk", name: "sidewalk", walkable: true, color: "#b0a7b8", artTag: "town-sidewalk" },
    { id: "street", name: "quiet street", walkable: true, color: "#3e3b65", artTag: "town-street" },
    { id: "grass", name: "front yard", walkable: true, color: "#a7f070", artTag: "town-grass" },
    { id: "doorstep", name: "doorstep", walkable: true, color: "#dfa06e", artTag: "town-doorstep" },
  ],
  ground: [
    [2, 0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2],
    [2, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2],
    [5, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 5, 5],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  ],
  playerSpawn: { x: 1, y: 3 },
  entities: [
    {
      id: "suzune",
      name: "Suzune",
      description:
        "Waiting at her gate with her bag over one shoulder, hair ribbon catching the light, wearing the particular smile she saves for exactly this hour of the morning.",
      role: "character",
      pos: { x: 13, y: 3 },
      color: "#f7f3b7",
      art: {
        kind: "sprite",
        subject: "high school girl waiting at a gate, bag over one shoulder, hair ribbon",
        mood: "warm morning, easy affection",
        sizeClass: "medium",
      },
      interaction: {
        verb: "talk",
        lines: [
          { speakerId: "suzune", text: "You're late. By eleven seconds. I counted." },
          { speakerId: "suzune", text: "...What? Don't make that face. Come on, we'll miss the good crossing light." },
        ],
        choices: [
          {
            id: "tease-her",
            label: "\"You counted? Who counts?\"",
            reply: "People who have been waiting eleven whole seconds, obviously. Walk faster.",
            effects: [{ op: "setFlag", key: "morning-teased", value: true }],
          },
          {
            id: "take-her-hand",
            label: "Take her hand without a word.",
            reply: "...Eleven seconds forgiven. Don't let it happen again.",
            effects: [{ op: "setFlag", key: "morning-held-hands", value: true }],
          },
          {
            id: "race-her",
            label: "\"Race you to the corner.\"",
            reply: "You KNOW I win downhill— hey! False start!",
            effects: [{ op: "setFlag", key: "morning-raced", value: true }],
          },
        ],
        effects: [],
        once: false,
      },
    },
    {
      id: "maru",
      name: "Maru",
      description:
        "The neighborhood cat, asleep on the warm sidewalk in a perfect circle. Named 丸 — \"round\" — for reasons visible from space.",
      role: "character",
      pos: { x: 6, y: 4 },
      color: "#eae4dd",
      nameMeaning: "丸 (maru, \"round\") — round of body, round of habit; sleeps in the same warm circle every morning",
      interaction: {
        verb: "examine",
        lines: [
          {
            speakerId: "narrator",
            text: "Maru opens one eye, files you under 'not breakfast', and closes it again. Suzune feeds him in secret. You feed him in secret. Neither of you has told the other.",
          },
        ],
        choices: [],
        effects: [{ op: "setFlag", key: "greeted-maru", value: true }],
        once: false,
      },
    },
    {
      id: "mailbox",
      name: "Your Mailbox",
      description: "The dented mailbox. The dent is from her bicycle, age eleven. She still denies it.",
      role: "prop",
      pos: { x: 0, y: 4 },
      color: "#ac2847",
      interaction: {
        verb: "examine",
        lines: [
          {
            speakerId: "narrator",
            text: "Empty, except for a flyer for a cram school. The dent catches the sun. Age eleven, blue bicycle, no brakes, a truly world-class lie about a raccoon.",
          },
        ],
        choices: [],
        effects: [],
        once: false,
      },
    },
  ],
  portals: [
    {
      id: "walk-to-school",
      pos: { x: 15, y: 4 },
      label: "the walk to school, together",
      transition: { type: "area", areaId: "prologue-walk-home" },
    },
  ],
  onEnterEffects: [],
});

const walkHome = AreaSpec.parse({
  dslVersion: 1,
  id: "prologue-walk-home",
  name: "The River Road, Dusk",
  description:
    "The long way home, which is the only way you two ever take. The river holds the last of the light. School emptied out hours ago — you stayed late again just to walk back at this exact color of sky. Neither of you has ever said that out loud. Neither of you has ever needed to.",
  path: "shared",
  width: 18,
  height: 7,
  tiles: [
    { id: "wall", name: "embankment wall", walkable: false, color: "#333c57", artTag: "river-wall" },
    { id: "railing", name: "river railing", walkable: false, color: "#21181b", artTag: "river-railing" },
    { id: "bank", name: "grass bank", walkable: true, color: "#566c86", artTag: "river-bank" },
    { id: "road", name: "river road", walkable: true, color: "#3e3b65", artTag: "river-road" },
    { id: "sidewalk", name: "sidewalk", walkable: true, color: "#7f708a", artTag: "river-sidewalk" },
  ],
  ground: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  playerSpawn: { x: 1, y: 3 },
  entities: [
    {
      id: "suzune",
      name: "Suzune",
      description:
        "Walking the railing-side like always, trailing one hand along the metal, dusk turning her silhouette gold at the edges.",
      role: "character",
      pos: { x: 3, y: 2 },
      color: "#f7f3b7",
      interaction: {
        verb: "talk",
        lines: [
          { speakerId: "suzune", text: "Hey. Weird question. If I got transferred somewhere really far away... like, REALLY far. What would you do?" },
          { speakerId: "narrator", text: "She's watching the river, not you. The railing hums faintly under her hand." },
        ],
        choices: [
          {
            id: "promise-find-her",
            label: "\"I'd find you. However far.\"",
            reply: "...Yeah. Okay. Good answer. Best answer. I'd find you too, you know. Even if I forgot everything else, I'd— wow, okay, getting heavy, forget I said anything!",
            effects: [{ op: "setFlag", key: "promised-to-find-her", value: true }],
          },
          {
            id: "joke-about-it",
            label: "\"Depends. How's the food there?\"",
            reply: "Unbelievable. I pour my heart out and he asks about FOOD. ...it'd be terrible food. Nothing like here. So you'd have to come get me, right?",
            effects: [{ op: "setFlag", key: "joked-at-the-promise", value: true }],
          },
          {
            id: "ask-why",
            label: "Stop walking. \"Why are you asking?\"",
            reply: "No reason! Honest. I've just had this... hum, all day. Like a tuning fork somewhere. Forget it — race you to the underpass!",
            effects: [{ op: "setFlag", key: "noticed-something-wrong", value: true }],
          },
        ],
        effects: [],
        once: false,
      },
    },
    {
      id: "vending-machine",
      name: "The Vending Machine",
      description: "Your vending machine. Legally it belongs to the beverage company. Spiritually it is yours.",
      role: "prop",
      pos: { x: 9, y: 4 },
      color: "#ac2847",
      interaction: {
        verb: "use",
        lines: [
          {
            speakerId: "narrator",
            text: "Two coins, one button you don't even have to look at anymore. Strawberry milk for her — the one thing this machine stocks that no other machine in town does. She calls it fate. You call it inventory management. She's probably right.",
          },
        ],
        choices: [],
        effects: [{ op: "addItem", item: "strawberry-milk", name: "Strawberry Milk" }],
        once: true,
        afterText: "The machine hums. You already got hers.",
      },
    },
  ],
  portals: [
    {
      id: "underpass-entrance",
      pos: { x: 17, y: 3 },
      label: "the shortcut under the railway",
      transition: { type: "area", areaId: "prologue-underpass" },
    },
  ],
  onEnterEffects: [],
});

const underpass = AreaSpec.parse({
  dslVersion: 1,
  id: "prologue-underpass",
  name: "The Railway Underpass",
  description:
    "Forty concrete steps of borrowed dark between one streetlight and the next. You've walked it a thousand times. The fluorescent tube in the middle has flickered since you were kids — the two of you named it, once, the way you named everything back then. Tonight its flicker is... off. Slower. Like breathing.",
  path: "shared",
  width: 12,
  height: 5,
  tiles: [
    { id: "wall", name: "concrete wall", walkable: false, color: "#10121c", artTag: "underpass-wall" },
    { id: "concrete", name: "concrete floor", walkable: true, color: "#4a4b5b", artTag: "underpass-floor" },
  ],
  ground: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  playerSpawn: { x: 1, y: 2 },
  entities: [
    {
      id: "suzune",
      name: "Suzune",
      description:
        "She has stopped walking. In the stuttering light she is there, and there, and there — a flipbook of herself, one frame missing.",
      role: "character",
      pos: { x: 4, y: 1 },
      color: "#f7f3b7",
      interaction: {
        verb: "talk",
        lines: [
          { speakerId: "suzune", text: "...Do you hear that? A bell. Far off. Like— like being rung for." },
          { speakerId: "narrator", text: "You hear the flicker. You hear the river. You do not hear a bell." },
          { speakerId: "suzune", text: "It's pretty. That's the worst part. Hey— hey, it's fine. Why do you look like that? I'm right here." },
        ],
        choices: [
          {
            id: "grab-her-hand",
            label: "Take her hand. Don't let go.",
            reply: "Cold hands! Sorry. Yours are warm though, so... okay. Okay. Stay like this till the end of the tunnel, deal?",
            effects: [{ op: "setFlag", key: "held-her-hand-at-the-end", value: true }],
          },
          {
            id: "laugh-it-off",
            label: "\"A bell? That's the 7:40 freight train, genius.\"",
            reply: "It is NOT the freight train, I know the freight train— ...it's not the train. But laugh. Please. It sounds less pretty when you're laughing.",
            effects: [{ op: "setFlag", key: "laughed-at-the-bell", value: true }],
          },
          {
            id: "listen-for-it",
            label: "Close your eyes and listen for it too.",
            reply: "...Anything? No? Good. That's good. If only one of us can hear it, then it's not real. That's the rule. I just made it the rule.",
            effects: [{ op: "setFlag", key: "listened-for-the-bell", value: true }],
          },
        ],
        effects: [{ op: "setFlag", key: "she-heard-the-bell", value: true }],
        once: false,
      },
    },
    {
      id: "flickering-light",
      name: "The Flickering Light",
      description: "The fluorescent tube you two named. Its rhythm tonight is nothing electrical.",
      role: "prop",
      pos: { x: 6, y: 0 },
      color: "#f7f3b7",
      interaction: {
        verb: "examine",
        lines: [
          {
            speakerId: "narrator",
            text: "Off... on. Off...... on. You time it against your heartbeat and immediately wish you hadn't: it is timing itself against hers.",
          },
        ],
        choices: [],
        effects: [{ op: "setFlag", key: "studied-the-light", value: true }],
        once: false,
      },
    },
  ],
  portals: [
    {
      id: "underpass-far-end",
      pos: { x: 11, y: 2 },
      label: "the far end of the underpass",
      transition: { type: "area", areaId: "prologue-vanishing" },
    },
  ],
  onEnterEffects: [{ op: "setFlag", key: "entered-the-underpass", value: true }],
});

const vanishing = AreaSpec.parse({
  dslVersion: 1,
  id: "prologue-vanishing",
  name: "The Far End",
  description:
    "One pair of footsteps. You are three steps past the flickering light before the arithmetic of that sound reaches you. One pair. The underpass runs empty in both directions, the fluorescent tube burning steady and white like nothing was ever wrong with it, and the evening is enormous and ordinary and silent. She was right here. She was RIGHT here.",
  path: "shared",
  width: 12,
  height: 5,
  tiles: [
    { id: "wall", name: "concrete wall", walkable: false, color: "#10121c", artTag: "underpass-wall" },
    { id: "concrete", name: "concrete floor", walkable: true, color: "#4a4b5b", artTag: "underpass-floor" },
  ],
  ground: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  playerSpawn: { x: 2, y: 2 },
  entities: [
    {
      id: "her-ribbon",
      name: "Her Hair Ribbon",
      description: "On the concrete, still holding the loop her hands tied this morning.",
      role: "item",
      pos: { x: 5, y: 2 },
      color: "#b13e53",
      interaction: {
        verb: "take",
        lines: [
          {
            speakerId: "narrator",
            text: "It's still warm. That's the thing you will not be able to explain to anyone, later, about this exact moment: the ribbon is still warm, and the underpass is empty, and both of those things are true at once.",
          },
        ],
        choices: [],
        effects: [{ op: "addItem", item: "her-ribbon", name: "Her Hair Ribbon" }],
        once: true,
        afterText: "Your hand is already in your pocket, holding it.",
      },
    },
    {
      id: "steady-light",
      name: "The Light, Steady",
      description: "The tube that has flickered for ten years is not flickering.",
      role: "prop",
      pos: { x: 6, y: 0 },
      color: "#f4f4f4",
      interaction: {
        verb: "examine",
        lines: [
          {
            speakerId: "narrator",
            text: "Steady. Perfectly, insultingly steady — as if it had only ever been flickering because it was trying to keep time with something, and the something is gone.",
          },
        ],
        choices: [],
        effects: [{ op: "setFlag", key: "saw-the-light-go-steady", value: true }],
        once: false,
      },
    },
  ],
  portals: [
    {
      id: "call-her-name",
      pos: { x: 11, y: 2 },
      label: "keep walking — call her name",
      transition: { type: "area", areaId: "prologue-crossing" },
    },
  ],
  onEnterEffects: [{ op: "setFlag", key: "suzune-vanished", value: true }],
});

const crossing = AreaSpec.parse({
  dslVersion: 1,
  id: "prologue-crossing",
  name: "Between",
  description:
    "Her name leaves your mouth and the world... hesitates. The underpass, the river, the dusk — all of it hangs like a held breath, and where the street should be there is only this: a dark crossing, and two doors of light. One burns pale as moonlight and smells of a country that has never existed. One falls soft as rain on the street where you both grew up. A story is about to be lived. Whose eyes will you live it through?",
  path: "shared",
  width: 9,
  height: 7,
  tiles: [
    { id: "void", name: "the held breath", walkable: false, color: "#10121c", artTag: "liminal-void" },
    { id: "moonlight", name: "moonlit floor", walkable: true, color: "#73eff7", artTag: "liminal-moon" },
    { id: "floor", name: "dark crossing", walkable: true, color: "#2c1e31", artTag: "liminal-floor" },
    { id: "rainlight", name: "rainlit floor", walkable: true, color: "#3b5dc9", artTag: "liminal-rain" },
  ],
  ground: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 2, 2, 2, 2, 2, 3, 0],
    [0, 1, 2, 2, 2, 2, 2, 3, 0],
    [0, 0, 2, 2, 2, 2, 2, 0, 0],
    [0, 0, 0, 2, 2, 2, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 0, 0],
  ],
  playerSpawn: { x: 4, y: 6 },
  entities: [],
  portals: [
    {
      id: "choose-her-path",
      pos: { x: 1, y: 3 },
      label: "the door of moonlight — live her story",
      transition: {
        type: "generate",
        hint: "Begin Path A (Suzune). She wakes in the fantasy world in the first moments after the summoning. STORY.md Path A seeds apply: summoned by the Villainess for the strongest dormant power ever detected; her goal is to escape home. Open with disorientation, wonder, and danger in the Villainess's domain.",
      },
    },
    {
      id: "choose-his-path",
      pos: { x: 7, y: 3 },
      label: "the door of rain — live his story",
      transition: {
        type: "generate",
        hint: "Begin Path B (Itsuki). The next morning, his room, her ribbon in his pocket. STORY.md Path B seeds apply: the world has forgotten Suzune ever existed; only he remembers; he does not know where she went. Open quiet and wrong: a breakfast table with one chair too few next door.",
      },
    },
  ],
  onEnterEffects: [{ op: "setFlag", key: "reached-the-crossing", value: true }],
});

export const PROLOGUE_ENTRY_ID = street.id;

const AREAS: readonly AreaSpec[] = [street, walkHome, underpass, vanishing, crossing];

const byId = new Map(AREAS.map((a) => [a.id, a]));

export function getPrologueAreas(): readonly AreaSpec[] {
  return AREAS;
}

export function getPrologueArea(id: string): AreaSpec | undefined {
  return byId.get(id);
}

export function isPrologueArea(id: string): boolean {
  return byId.has(id);
}

/** Which story path each crossing portal commits the player to. */
export const PATH_CHOICE_PORTALS: Readonly<Record<string, StoryPath>> = {
  "choose-her-path": "her",
  "choose-his-path": "his",
};

/**
 * Seed facts every playthrough starts from — the prologue's events as canon.
 * STORY.md's path seeds are loaded separately by the Director at path choice.
 */
export const PROLOGUE_CANON: ReadonlyArray<{ statement: string; entities: string[] }> = [
  {
    statement:
      "Itsuki and Suzune are high-school seniors, next-door neighbors on Aozora Lane, childhood friends, and deeply in love.",
    entities: ["itsuki", "suzune", "aozora-lane"],
  },
  {
    statement:
      "On the evening walk home, inside the railway underpass, Suzune heard a distant bell that Itsuki could not hear; moments later, between one flicker of the old fluorescent light and the next, she vanished.",
    entities: ["itsuki", "suzune", "railway-underpass"],
  },
  {
    statement:
      "All that remained of Suzune in the underpass was her hair ribbon, still warm when Itsuki picked it up.",
    entities: ["itsuki", "suzune", "her-ribbon", "railway-underpass"],
  },
  {
    statement:
      "Maru is the neighborhood cat of Aozora Lane; both Itsuki and Suzune feed him in secret without telling the other.",
    entities: ["maru", "itsuki", "suzune", "aozora-lane"],
  },
];
