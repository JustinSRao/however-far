import type {
  AreaSpec,
  CanonFact,
  CharacterRecord,
  PlaythroughExport,
  ReunionGameState,
  StoryArc,
} from "@howeverfar/schema";
import { AUTHOR_PRINCIPLES } from "./prompts.js";

/**
 * Reunion prompts (Phase 7). Same cache discipline as the others: system
 * prompts are FROZEN, user content puts stable blocks first and the volatile
 * tail last.
 *
 * What makes these different from the World Writer's is a single inversion.
 * Every other prompt in this project forbids resolution — the Threshold Writer
 * spends most of its words on it. Here resolution is the assignment. This is
 * the only place in the game allowed to end the story.
 */

const REUNION_PREMISE = `THE STORY, BOTH SIDES AT ONCE.

Two high-school seniors — Itsuki Nemoto (根本 樹) and Suzune Toyama (遠山 鈴音), next-door neighbors on Aozora Lane, childhood friends, in love. On the walk home, inside the railway underpass, she heard a bell he could not hear, and vanished.

She was summoned into another world for a dormant power that only wakes there. Here, the world forgot her — her parents have one less child, the records are seamless, and only he remembers.

Two players lived those two halves separately, without ever seeing the other. One reached a way home she could not cross alone. One learned what happened and could not reach her alone. THEY ARE BOTH IN THIS SCENE NOW, and this is the only part of the game where that is true.

Both playthroughs are real history and neither may be contradicted. They are not two versions of events — they are the same span of time from either side, and every ally she made and every truth he dug up actually happened.`;

const REUNION_RULES = `Hard rules for the Reunion:
- BOTH SIDES MUST MATTER, in every area. What she brought back and what he worked out are both load-bearing. A scene either of them could have solved alone is a failed scene. Name their people: her allies and his witnesses are characters who existed, and the finale is where they finally exist at the same time.
- They address each other by bare given names — Itsuki and Suzune, no honorific. That is established and it never changes. Everyone else keeps the honorifics their side used.
- Never kill, corrupt, or romantically reassign either of them. Their bond is the point of the entire game.
- The interface stopped lying. No metaFx, ever — the erasure ends where they are both standing.
- This is the endgame: it runs a handful of areas, not twenty. Escalate, do not wander.
- Two people are walking this map. Build for two: places where both are needed at once, doors that take two, conversations someone else is also hearing. Never write an area only one of them can cross.`;

export const REUNION_ARCHITECT_SYSTEM = `You are the Architect of the last act of a game that two people played separately and are now finishing together.

${REUNION_PREMISE}

Design the arc of their shared finale, given both playthroughs.

${REUNION_RULES}

Additional rules for the arc:
- SHORT. Two acts, 2-4 beats each — roughly 5-9 areas total. This is a finale, not a third campaign.
- The beats must braid the two histories: each one should require something specific from HER playthrough and something specific from HIS. Cite them by name.
- The planned ending RESOLVES. They reach each other; the crossing is worked from both sides; the world that forgot her stops being allowed to. Earn it — the cost should be real and specific — but land it. This is the only ending in the game that is permitted to close, and it must.
- currentActId must be the first act's id.`;

export const REUNION_WRITER_SYSTEM = `You are the World Writer of the last act of a game that two people played separately and are now finishing together. You write the next shared area as structured data.

${REUNION_PREMISE}

${REUNION_RULES}

Area authoring rules:
- "path" must be "reunion". Never "her" or "his".
- The map: "ground" is row-major — ground[y][x] is an index into "tiles", exactly "height" rows of exactly "width" columns, every index in range. 10 to 24 tiles per side.
- BOTH PLAYERS SPAWN HERE. playerSpawn must be walkable and unblocked, and so must at least one tile next to it — the second player arrives beside the first. An area that can only hold one of them will be rejected.
- Entities: characters and props block movement, items do not. Every interactive entity gets ONE interaction (verb talk/examine/use/take): lines (speakerId must be "narrator" or an entity id in THIS area), then optionally 2-4 choices. The id "the-other" is reserved for the other player and must never be used.
- Returning characters from either playthrough: reuse their id, name and description VERBATIM where you are given them. Their appearance is cached art; changing a word repaints someone a player already knows.
- New human characters get a full Japanese name whose kanji meanings connect to their personality, recorded in "nameMeaning" (ADR-0014).
- "effects" are the only way state changes. Set flags for anything a later area needs. metaFx is forbidden here.
- CHECKS are the one mechanic: an attribute (might/wits/heart) versus a difficulty (1 trivial · 4 ordinary · 7 hard · 10 near-impossible), optional cost spent either way, and BOTH a success and a failure branch with real consequences. Failure must be interesting — sideways, never backwards. Two or three per area, not one per choice. By now both of them have earned their attributes; write gambles worthy of the end of a story.
- QUESTS: up to 4 declared per area; a questStart effect may only name a quest THIS area declares.
- Portals: 1-8. {"type":"generate","hint":"..."} for the next stretch; {"type":"ending","tone":...,"hint":"..."} ONLY when you are told the final act allows it.
- "description" is establishing prose on entry: second person, present tense, concrete and sensory, 60-180 words. It is addressed to BOTH players at once — write "you" so it lands on either of them. No headings, no meta-commentary.

${AUTHOR_PRINCIPLES}

Output: {"area": <AreaSpec>, "advancesBeatId": <beat id or omit>}.`;

export const REUNION_FINALE_SYSTEM = `You are the Director, writing the last thing two players will ever read in this game.

${REUNION_PREMISE}

They have finished. This is the ending, and it is the ONE ending in this game that is allowed to resolve — every other ending in every other playthrough was a threshold that deliberately did not. Do not hedge it. Do not leave the ache open. Close it.

Required:
- "closingText": 300-900 words, second person, present tense, concrete and sensory. The best prose in either playthrough. It must pay off BOTH histories by name — her allies, his witnesses, what each of them carried, what it cost. The crossing is worked from both sides. They reach each other.
- Earn it. A resolution that costs nothing is not a resolution. Something is given up, and it should be specific, and it should hurt in the right way. But they are not separated again, neither of them dies, and neither of them forgets.
- "paidOffSeedIds": the ids of the reunion seeds — from BOTH playthroughs — this ending actually pays off. At least one from each side. Do not list a seed you did not use.
- "tone" matches how the two playthroughs actually felt together.
- Never mention profiles, arcs, systems, or that anything was generated.`;

function factsBlock(facts: readonly CanonFact[]): string {
  if (facts.length === 0) return "(none)";
  return facts.map((f) => `- [${f.id}] ${f.statement}`).join("\n");
}

/** One playthrough, as the other side has never seen it. */
export function playthroughBlock(p: PlaythroughExport): string {
  const side = p.path === "her" ? "SUZUNE'S SIDE" : "ITSUKI'S SIDE";
  const people = p.characters.length
    ? p.characters
        .map((c) => `- [${c.id}] ${c.name} — ${c.appearance}`)
        .join("\n")
    : "(nobody recorded)";
  const road = p.road.length
    ? p.road.map((a) => `- ${a.name}`).join("\n")
    : "(not recorded)";
  return [
    `### ${side} — played by ${p.playerName}`,
    `Premise: ${p.arc.premise}`,
    `Theme: ${p.arc.theme}`,
    `How they played: ${p.profile.tone} (${p.profile.pacing}, ${p.profile.moralLean})`,
    `How it ended — "${p.ending.title}": ${p.ending.threshold}`,
    // Seed ids are shown side-prefixed because both playthroughs pick their
    // own ids and can collide; the finale has to be able to say which side a
    // payoff came from.
    `What they carry forward:\n${p.ending.reunionSeeds
      .map((s) => `- [${p.path}-${s.id}] ${s.statement}`)
      .join("\n")}`,
    `People they met (reuse id, name and description verbatim if they appear):\n${people}`,
    `Where they went:\n${road}`,
  ].join("\n");
}

export interface ReunionArchitectContext {
  her: PlaythroughExport;
  his: PlaythroughExport;
  facts: readonly CanonFact[];
}

export function buildReunionArchitectUser(ctx: ReunionArchitectContext): string {
  return [
    `## Fixed facts (immutable rails)\n${factsBlock(ctx.facts)}`,
    `## The two playthroughs\n\n${playthroughBlock(ctx.her)}\n\n${playthroughBlock(ctx.his)}`,
    `Design the arc of their shared finale.`,
  ].join("\n\n");
}

export interface ReunionWriterContext {
  arc: StoryArc;
  facts: readonly CanonFact[];
  her: PlaythroughExport;
  his: PlaythroughExport;
  characters: readonly CharacterRecord[];
  state: ReunionGameState;
  recentAreas: readonly Pick<AreaSpec, "id" | "name" | "description">[];
  hint: string;
  existingAreaIds: readonly string[];
  /** True when the arc is in its final act and an ending portal is allowed. */
  endingAllowed: boolean;
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

export function buildReunionWriterUser(ctx: ReunionWriterContext): string {
  const characters = ctx.characters.length
    ? ctx.characters.map((c) => `- [${c.id}] ${c.name} — ${c.appearance}`).join("\n")
    : "(nobody yet in the shared world)";
  const recent = ctx.recentAreas
    .map((a) => `### ${a.name} (${a.id})\n${a.description}`)
    .join("\n\n");
  const flags = Object.entries(ctx.state.flags)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return [
    `## The two playthroughs\n\n${playthroughBlock(ctx.her)}\n\n${playthroughBlock(ctx.his)}`,
    `## Shared arc\n${arcBlock(ctx.arc)}`,
    `## Established facts (do not contradict — both histories are true)\n${factsBlock(ctx.facts)}`,
    `## Already in the shared world (reuse id, name and description verbatim)\n${characters}`,
    `## Recent areas\n${recent || "(none — this is the first shared area)"}`,
    `## Shared state\nThe two players are ${ctx.state.her.name} (Suzune's side) and ${ctx.state.his.name} (Itsuki's side).\nFlags set: ${flags.length ? flags.join(", ") : "(none)"}\nCarrying: ${ctx.state.inventory.length ? ctx.state.inventory.map((i) => i.name).join(", ") : "(nothing)"}\nAreas so far: ${ctx.state.visitedAreaIds.length}`,
    `## Ending portals\n${
      ctx.endingAllowed
        ? 'The arc is in its final act: you MAY give this area a portal with {"type":"ending",...} when the fiction has earned it.'
        : "The arc is NOT in its final act: no ending portals. The story is not finished."
    }`,
    `## Already-used area ids (yours must be new)\n${ctx.existingAreaIds.join(", ")}`,
    `## Authoring instruction for THIS area\n${ctx.hint}`,
  ].join("\n\n");
}

export interface ReunionFinaleContext {
  arc: StoryArc;
  facts: readonly CanonFact[];
  her: PlaythroughExport;
  his: PlaythroughExport;
  /** The hint on the portal they stepped through together. */
  hint: string;
  visitedAreaIds: readonly string[];
}

export function buildReunionFinaleUser(ctx: ReunionFinaleContext): string {
  return [
    `## The two playthroughs\n\n${playthroughBlock(ctx.her)}\n\n${playthroughBlock(ctx.his)}`,
    `## The shared arc\nPremise: ${ctx.arc.premise}\nTheme: ${ctx.arc.theme}\nPlanned ending (${ctx.arc.plannedEnding.tone}): ${ctx.arc.plannedEnding.summary}`,
    `## Everything true\n${factsBlock(ctx.facts)}`,
    `## Where they walked together\n${ctx.visitedAreaIds.join(" -> ")}`,
    `## They stepped through toward\n${ctx.hint}`,
    `Write the ending. Close it.`,
  ].join("\n\n");
}
