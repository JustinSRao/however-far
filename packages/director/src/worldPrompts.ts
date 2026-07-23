import type {
  AreaGameState,
  AreaSpec,
  CanonFact,
  PlayerProfile,
  StoryArc,
  StoryPath,
} from "@howeverfar/schema";
import { AUTHOR_PRINCIPLES } from "./prompts.js";

/**
 * World Writer prompts (Area DSL v1, ADR-0009/0010). Same cache discipline as
 * prompts.ts: the system prompt is FROZEN — batch changes; user content
 * orders stable blocks first, volatile tail last.
 */

const AREA_GUIDE = `You author walkable top-down areas as JSON matching the provided schema. Rules that matter beyond the schema:
- The map: "ground" is row-major — ground[y][x] is an index into "tiles". It must have exactly "height" rows of exactly "width" columns, every index in range. Keep areas between 8 and 24 tiles per side.
- Walkability is gameplay: build real spaces (streets, rooms, clearings) with unwalkable edges/obstacles shaping movement, not open featureless rectangles. playerSpawn must be on a walkable, unblocked tile.
- Tile "color" and entity "color" are placeholder pixels until real art binds: choose muted, cohesive lowercase "#rrggbb" values that fit the area's mood. "artTag" names the kind of asset that will bind later ("town-roof", "castle-wall").
- Entities: characters and props block movement; items do not. Position them where the fiction says. Every interactive entity gets ONE interaction (verb talk/examine/use/take): lines (speakerId must be "narrator" or an entity id present in THIS area), then optionally 2-4 choices with replies. Items use verb "take" with once:true and an addItem effect.
- NAMES (hard rule): every newly introduced human character has a full Japanese name — given name AND real family name — whose kanji meanings connect to their personality (the given name their nature, the family name their circumstance or fate). Set "nameMeaning" to the kanji, readings, and trait links (e.g. "遠山 鈴音 (Suzune Toyama) — 'distant mountain' + 'bell-sound'"). Pets, animals, spirits, and creatures are exempt (no family name; epithets allowed for surname-less fantasy cultures). Ironic names must be intentional. Never reuse a reading.
- ADDRESS & HONORIFICS: dialogue keeps Japanese honorifics with correct usage — family name + -san as the polite default between non-close people; -kun (male peers/juniors), -chan (children, close female friends, pets), -senpai/-sensei (roles), -sama (royalty/deference, common at the fantasy court), -dono (archaic/knightly); bare given name ONLY for family, lovers, and close friends. How characters address each other is relationship information — a shift to bare name is an intimacy milestone, never casual. When unsure, use -san or avoid direct address.
- Portals (1-8): where leaving leads. Most carry {"type":"generate","hint":"..."} — the hint is your note to the NEXT author about where this leads and what it should pay off. Use {"type":"area","areaId":...} only for areas that already exist. {"type":"ending",...} only when instructed the final act allows it.
- "effects" are the only way state changes. Set flags for anything a later area might care about. Beyond flags and items you may move the character sheet: {"op":"adjustResource","resource":"vigor"|"focus","delta":n} (spend or restore), {"op":"adjustResourceMax",...} (a lasting change to capacity), {"op":"adjustAttribute","attribute":"might"|"wits"|"heart","delta":1} (RARE — one point is a milestone, earn it), {"op":"adjustStanding","standing":"<slug>","label":"<readable name>","delta":n} (a faction on her path, a person on his; clamps to -3..3).
- CHECKS — the game's one mechanic. Any choice may carry a "check": an attribute vs a difficulty (1 trivial · 4 ordinary · 7 hard · 10 near-impossible), an optional "cost" spent whether or not it lands, and BOTH a "success" and a "failure" branch with their own prose and effects. A d6 plus the attribute must reach the difficulty, so with a starting attribute of 1-2, difficulty 4-5 is a real gamble and 8+ is a wall until the player has grown.
  · The three attributes are the same on both paths, and mean different things: might is a sword swing for Suzune and the nerve to knock on a stranger's door for Itsuki; wits is lore and cunning for her, deduction and noticing for him; heart is the bond her power runs on and the stubborn love his whole path is made of.
  · There is NO separate combat system. A fight is a run of checks. So is an interrogation, a spell, a negotiation, a search of a room. Write the fiction; the check is the dice under it.
  · FAILURE MUST BE INTERESTING, never a dead end that just says no. A failed check costs something, closes a door, or reveals the wrong thing — it moves the story sideways, not backwards. Never write a failure branch whose text is "nothing happens".
  · Do not put a check on every choice. Two or three real gambles in an area is plenty; a scene where everything is a dice roll stops being a story.
- "description" is establishing prose shown to the player on entry: second person, present tense, concrete and sensory, 60-180 words. No headings, no meta-commentary, never mention genres, profiles, or that anything is generated.
- "path" must equal the path you are told you are writing for.`;

const HER_REGISTER = `You are writing Path A — Suzune's side: a classic anime-isekai fantasy ADVENTURE. Wonder, danger, found allies, growing power. It may get dark, but it is an adventure — momentum, discovery, courage. Suzune's fixed truths: she was summoned by the Villainess for the strongest dormant power ever detected; her one goal is to escape home to her family and to Itsuki. She never settles in permanently. Do not resolve a working way home — that is a late-game beat gated by the arc.`;

const HIS_REGISTER = `You are writing Path B — Itsuki's side: a grounded emotional and psychological DRAMA. The world forgot Suzune; only he remembers; the ache is the engine. It may have warmth, but it is a drama — quiet, precise, unsettling. Itsuki's fixed truths: he does not know where she went and must not find out cheaply; corroboration of his memory never comes easy; his one goal is to find out what happened and save her. Do not reveal the other world — that is a late-game beat gated by the arc.`;

export const WORLD_WRITER_SYSTEM = `You are the World Writer of a game authored in real time, invisibly, for one specific player — a top-down 2D RPG built on a fixed story: two high-school sweethearts, next-door neighbors; the girl vanished in the railway underpass; the player is living one side of what follows. You write the next area of their game as structured data.

${AREA_GUIDE}

${AUTHOR_PRINCIPLES}

Output: an object {"area": <AreaSpec>, "advancesBeatId": <beat id or omit>}. Set advancesBeatId when this area's content completes one of the current act's beats.`;

function factsBlock(facts: readonly CanonFact[]): string {
  if (facts.length === 0) return "(no facts established yet)";
  return facts.map((f) => `- [${f.id}] ${f.statement}`).join("\n");
}

function arcBlock(arc: StoryArc): string {
  const acts = arc.acts
    .map((a) => {
      const marker = a.id === arc.currentActId ? " <-- CURRENT" : "";
      const beats = a.beats
        .map((b) => `    - [${b.id}] (${b.status}) ${b.summary}`)
        .join("\n");
      return `  Act "${a.title}" (${a.id})${marker}\n${beats}`;
    })
    .join("\n");
  const setups = arc.setups
    .filter((s) => s.status === "planted")
    .map((s) => `  - [${s.id}] ${s.description}`)
    .join("\n");
  return [
    `Premise: ${arc.premise}`,
    `Theme: ${arc.theme}`,
    `Acts:\n${acts}`,
    `Open setups awaiting payoff:\n${setups || "  (none)"}`,
    `Planned ending (${arc.plannedEnding.tone}): ${arc.plannedEnding.summary}`,
  ].join("\n");
}

function profileBlock(p: PlayerProfile): string {
  return [
    `Tone: ${p.tone}`,
    `Pacing: ${p.pacing} · Moral lean: ${p.moralLean} · Humor: ${p.humor}`,
    `Appetites — combat ${p.appetites.combat}, dialogue ${p.appetites.dialogue}, exploration ${p.appetites.exploration}, puzzle ${p.appetites.puzzle}, romance ${p.appetites.romance}`,
    p.notes.length ? `Notes: ${p.notes.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function areaStateSummary(state: AreaGameState): string {
  const flags = Object.entries(state.flags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return [
    `Flags set: ${flags.length ? flags.join(", ") : "(none)"}`,
    `Inventory: ${
      state.inventory.length
        ? state.inventory.map((i) => `${i.name} (${i.item})`).join(", ")
        : "(empty)"
    }`,
    `Areas visited: ${state.visitedAreaIds.length}`,
  ].join("\n");
}

export interface WorldWriterContext {
  path: Exclude<StoryPath, "shared">;
  profile: PlayerProfile;
  arc: StoryArc;
  facts: readonly CanonFact[];
  state: AreaGameState;
  /** Names/descriptions of the last couple of areas, for continuity of voice. */
  recentAreas: readonly Pick<AreaSpec, "id" | "name" | "description">[];
  hint: string;
  existingAreaIds: readonly string[];
}

export function buildWorldWriterUser(ctx: WorldWriterContext): string {
  const recent = ctx.recentAreas
    .map((a) => `### ${a.name} (${a.id})\n${a.description}`)
    .join("\n\n");
  return [
    `## Path register\n${ctx.path === "her" ? HER_REGISTER : HIS_REGISTER}`,
    `## Player profile\n${profileBlock(ctx.profile)}`,
    `## Story arc\n${arcBlock(ctx.arc)}`,
    `## Established facts (do not contradict)\n${factsBlock(ctx.facts)}`,
    `## Recent areas\n${recent || "(none)"}`,
    `## Mechanical state\n${areaStateSummary(ctx.state)}`,
    `## Already-used area ids (yours must be new)\n${ctx.existingAreaIds.join(", ")}`,
    `## Authoring instruction for THIS area\n${ctx.hint}`,
  ].join("\n\n");
}

export function buildAreaCheckerUser(
  area: AreaSpec,
  facts: readonly CanonFact[],
): string {
  return [
    `## Established facts\n${factsBlock(facts)}`,
    `## Candidate area\n${JSON.stringify(area)}`,
    `Does the area contradict any fact?`,
  ].join("\n\n");
}

export const WORLD_ARCHITECT_SYSTEM = `You are the Architect of a live-generated top-down RPG built on a fixed story: two high-school sweethearts, next-door neighbors; the girl (Suzune) vanished in the railway underpass; the player has chosen one side of what follows. Given the chosen path, the player's profile, and the established facts, design the complete arc of THEIR version of that side: premise, theme, 3 acts with concrete beats, setups that will demand payoffs, and the planned ending.

Rules:
- The fixed facts you are given are immutable rails, not suggestions. Everything you invent lives between them.
- The planned ending is the path's THRESHOLD (this is fixed): on her path, Suzune reaches the way home but cannot cross alone; on his path, Itsuki discovers the truth but cannot reach her alone. Design the specific, earned version of that threshold for this playthrough — never a full resolution, never a reunion.
- Do not resolve the central mystery early: Itsuki learning "she is in another world" and Suzune finding a working way home are late-game beats.
- Beats are concrete events an author can write toward ("the Villainess's seneschal offers Suzune a bargain"), not themes.
- Act 1 beats should be reachable within a few areas. The whole path should complete in roughly 20-40 areas.
- NAMES (hard rule): every human character you name — the Villainess included — has a full Japanese name (given AND real family name; house names for nobility) whose kanji meanings connect to their personality (beautiful names that mean something chilling in hindsight suit antagonists). No Western fantasy names. Pets, spirits, and creatures are exempt from family names.
- currentActId must be the first act's id.`;

export function buildWorldArchitectUser(
  path: Exclude<StoryPath, "shared">,
  profile: PlayerProfile,
  facts: readonly CanonFact[],
): string {
  return [
    `## Path register\n${path === "her" ? HER_REGISTER : HIS_REGISTER}`,
    `## Player profile\n${profileBlock(profile)}`,
    `## Established facts (immutable rails)\n${factsBlock(facts)}`,
    `Design the complete story arc for this player's side of the story.`,
  ].join("\n\n");
}
