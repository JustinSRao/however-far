import type {
  CanonFact,
  GameState,
  PlayerProfile,
  PlaySignal,
  SceneSpec,
  StoryArc,
} from "@unwritten/schema";

/**
 * Prompt builders. Cache discipline (CLAUDE.md): system prompts are FROZEN —
 * batch changes, since any edit invalidates all cached prefixes. User content
 * orders stable parts first, volatile parts last. Deterministic serialization
 * only (stable key order via explicit object literals).
 */

const DSL_GUIDE = `You author scenes as JSON matching the provided schema. Rules that matter beyond the schema:
- Every dialogue speakerId must be "narrator" or the id of an entity you included in THIS scene.
- Ids are lowercase kebab-case slugs and must be unique within the scene.
- Choices: 2-4 is the sweet spot. Each choice's transition is usually {"type":"generate","hint":"..."} — the hint is a note to the NEXT author (you, later) about where this action leads and what it reveals about the player.
- "effects" are the only way state changes. Set flags for anything a later scene might care about; add/remove items when fiction says so.
- narration is prose shown to the player: second person, present tense, concrete and sensory. 80-250 words. No headings, no meta-commentary, never mention genres, profiles, or that anything is generated.
- freeText stays enabled unless the fiction truly forbids acting freely.
- Art requests describe what an illustrator should draw — subject and mood only, no style words (style is handled elsewhere).`;

const AUTHOR_PRINCIPLES = `Authoring principles:
- The player must never see the machinery. No "as an AI", no genre labels, no difficulty talk.
- Respect player agency: honor what their action was trying to do, including refusals and weird ideas. Weird free-text actions deserve real consequences, not deflection.
- Continuity is sacred. You will be given established facts — never contradict one. If the story must change something established, change it IN FICTION (things burn, people lie, people die) so a new fact supersedes the old.
- Advance the arc. Every scene should move the current act's beats forward, pay off a planted setup, or plant a new one worth paying off. No filler scenes.
- Show personality through specifics: names, objects, verbal habits. Avoid generic fantasy mush unless the profile asks for it.`;

export const WRITER_SYSTEM = `You are the Scene Writer of a game that is authored in real time, invisibly, for one specific player. You write the next scene of their game as structured data.

${DSL_GUIDE}

${AUTHOR_PRINCIPLES}

Output: an object {"scene": <SceneSpec>, "advancesBeatId": <beat id or omit>}. Set advancesBeatId when this scene completes one of the current act's beats.`;

export const ENDING_WRITER_SYSTEM = `You are the Scene Writer, now writing the FINAL scene of this player's game. Conclude the story: land the planned ending's tone, pay off what the arc still owes, give the player's journey weight and closure. This scene's narration is the last thing they will read — make it count.

${DSL_GUIDE}

${AUTHOR_PRINCIPLES}

The scene's choices will be replaced by a single "close the book" action, so write choices as a formality (one is fine). Output: {"scene": <SceneSpec>, "advancesBeatId": <beat id or omit>}.`;

export const PROFILER_SYSTEM = `You are the Profiler of a game that secretly tailors itself to its player. From a transcript of their actions in a fixed genre-neutral opening, infer who this player is and what game they are implicitly asking for.

Read behavior, not just content: aggression vs caution, talking vs acting, what they examined, what they ignored, what they typed freely (free text is the strongest signal), jokes made or not made, generosity or self-interest. Choose a PRIMARY genre that is specific and playable (e.g. "folk horror", "hardboiled mystery", "mil-SF survival", "cozy pastoral fantasy", "picaresque comedy"), not a mood. Confidence reflects evidence strength. Notes capture anything a later author should know.`;

export const ARCHITECT_SYSTEM = `You are the Architect of a game generated live for one player. Given their profile and the facts established so far, design the complete arc of their game: premise, theme, 3 acts with concrete beats, setups that will demand payoffs, and a planned ending whose tone fits the player.

Rules:
- The game continues seamlessly from the established facts (the opening at the road, Marlow, the box, the eastern smoke, the approaching bell). Recontextualize them into your genre — do not discard them.
- Beats are concrete events an author can write toward ("the bell-ringers take Marlow"), not themes.
- Act 1 beats should be reachable within a few scenes. The whole game should complete in roughly 20-40 scenes.
- currentActId must be the first act's id.
- The ending must be earnable and specific.`;

export const REVISER_SYSTEM = `You are the Architect of a live-generated game, revising the Story Arc because play has diverged from plan. Keep everything that still works. You may drop beats (mark "dropped"), add beats, and change the planned ending — but never contradict established facts, and never abandon planted setups silently: pay them off or mark them dropped deliberately. Output the complete revised arc. currentActId must reflect where the story actually is now.`;

export const CHECKER_SYSTEM = `You are a continuity checker. Given established facts and a candidate scene (JSON), report whether the scene contradicts any fact.

A contradiction is a direct conflict with a fact's plain meaning (someone established as dead speaks; an item established as destroyed is used; a name changes). NOT contradictions: new information, elaboration, characters lying in dialogue, tone shifts, superseding events clearly happening in-fiction. Be precise; false alarms are costly. Respond {"ok":true} or {"ok":false,"violations":[{"factId","explanation"}]}.`;

export const EXTRACTOR_SYSTEM = `You extract canon facts from a game scene (JSON). Extract only what a future scene could CONTRADICT: names and identities, relationships, deaths and injuries, world rules, promises and debts, items gained or lost, established traits, irreversible events. Not prose flavor, not atmosphere.

Each fact: one atomic statement (max ~200 chars), entity ids it concerns (kebab-case slugs of characters/items/places involved). If the scene establishes something that replaces a listed existing fact, set "supersedes" to that fact's id. 3-8 facts is typical; fewer is fine.`;

// ---------------------------------------------------------------------------

function stateSummary(state: GameState): string {
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
    `Scenes played: ${state.visitedSceneIds.length}`,
  ].join("\n");
}

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
    `Genre: ${p.genre.primary}${p.genre.secondary ? ` / ${p.genre.secondary}` : ""} (confidence ${p.genre.confidence})`,
    `Tone: ${p.tone}`,
    `Pacing: ${p.pacing} · Moral lean: ${p.moralLean} · Humor: ${p.humor}`,
    `Appetites — combat ${p.appetites.combat}, dialogue ${p.appetites.dialogue}, exploration ${p.appetites.exploration}, puzzle ${p.appetites.puzzle}, romance ${p.appetites.romance}`,
    p.notes.length ? `Notes: ${p.notes.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface WriterContext {
  profile: PlayerProfile;
  arc: StoryArc;
  facts: readonly CanonFact[];
  state: GameState;
  /** Narration of the last couple of scenes, for local continuity of voice. */
  recentScenes: readonly Pick<SceneSpec, "id" | "title" | "narration">[];
  hint: string;
  existingSceneIds: readonly string[];
}

export function buildWriterUser(ctx: WriterContext): string {
  const recent = ctx.recentScenes
    .map((s) => `### ${s.title} (${s.id})\n${s.narration}`)
    .join("\n\n");
  return [
    `## Player profile\n${profileBlock(ctx.profile)}`,
    `## Story arc\n${arcBlock(ctx.arc)}`,
    `## Established facts (do not contradict)\n${factsBlock(ctx.facts)}`,
    `## Recent scenes\n${recent || "(none)"}`,
    `## Mechanical state\n${stateSummary(ctx.state)}`,
    `## Already-used scene ids (yours must be new)\n${ctx.existingSceneIds.join(", ")}`,
    `## Authoring instruction for THIS scene\n${ctx.hint}`,
  ].join("\n\n");
}

export function buildProfilerUser(signals: readonly PlaySignal[]): string {
  const transcript = signals
    .map((s) => `[${s.sceneId}] (${s.kind}) ${s.action}`)
    .join("\n");
  return `Transcript of the player's actions in the opening:\n\n${transcript}\n\nProduce the player profile.`;
}

export function buildArchitectUser(
  profile: PlayerProfile,
  facts: readonly CanonFact[],
): string {
  return [
    `## Player profile\n${profileBlock(profile)}`,
    `## Facts established during the opening\n${factsBlock(facts)}`,
    `Design the complete story arc for this player's game.`,
  ].join("\n\n");
}

export function buildReviserUser(
  arc: StoryArc,
  profile: PlayerProfile,
  facts: readonly CanonFact[],
  reason: string,
): string {
  return [
    `## Player profile\n${profileBlock(profile)}`,
    `## Current arc\n${arcBlock(arc)}`,
    `## Established facts\n${factsBlock(facts)}`,
    `## Why revision is needed\n${reason}`,
    `Output the complete revised arc.`,
  ].join("\n\n");
}

export function buildCheckerUser(
  scene: SceneSpec,
  facts: readonly CanonFact[],
): string {
  return [
    `## Established facts\n${factsBlock(facts)}`,
    `## Candidate scene\n${JSON.stringify(scene)}`,
    `Does the scene contradict any fact?`,
  ].join("\n\n");
}

export function buildExtractorUser(
  scene: SceneSpec,
  existingFacts: readonly CanonFact[],
): string {
  return [
    `## Existing facts (for supersedes references)\n${factsBlock(existingFacts)}`,
    `## Scene\n${JSON.stringify(scene)}`,
    `Extract the new canon facts this scene establishes.`,
  ].join("\n\n");
}
