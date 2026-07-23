import {
  AreaSpec,
  PlaythroughExport,
  ReunionEnding,
  Slug,
  StoryArc,
  type AreaSessionSave,
  type CanonFact,
  type CharacterRecord,
} from "@howeverfar/schema";
import { validateAreaIntegrity, validateReunionArea } from "@howeverfar/engine";
import { z } from "zod";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import { normalizeArc } from "./stages.js";
import {
  buildReunionArchitectUser,
  buildReunionFinaleUser,
  buildReunionWriterUser,
  REUNION_ARCHITECT_SYSTEM,
  REUNION_FINALE_SYSTEM,
  REUNION_WRITER_SYSTEM,
  type ReunionFinaleContext,
  type ReunionWriterContext,
} from "./reunionPrompts.js";

/**
 * The Reunion writer stages (Phase 7): merge two finished playthroughs, plan
 * the shared finale, author its areas, and — uniquely in this project — write
 * an ending that is allowed to end.
 */

export class ReunionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReunionFailedError";
  }
}

/**
 * Turn a finished save into the small, portable thing the other machine
 * needs. Throws on an unfinished playthrough: a Reunion is what two *endings*
 * earn, and letting a half-played save across would quietly cheapen the only
 * true ending in the game.
 */
export function exportPlaythrough(
  session: AreaSessionSave,
  playerName: string,
): PlaythroughExport {
  if (session.phase !== "ended" || !session.ending) {
    throw new ReunionFailedError(
      "only a playthrough that reached its threshold can cross — finish the path first",
    );
  }
  if (session.path !== "her" && session.path !== "his") {
    throw new ReunionFailedError("a playthrough that never chose a path has no side");
  }
  if (!session.profile || !session.arc) {
    throw new ReunionFailedError("playthrough is missing its profile or arc");
  }
  // Parsed through the schema so an export is exactly what the wire contract
  // says it is, whatever a save on disk has drifted into.
  return PlaythroughExport.parse({
    formatVersion: 1,
    sessionId: session.id,
    path: session.path,
    playerName,
    completedAt: session.updatedAt,
    profile: session.profile,
    arc: session.arc,
    canon: session.canon,
    characters: Object.values(session.characters),
    sheet: session.state.sheet,
    ending: session.ending,
    road: session.state.visitedAreaIds
      .map((id) => session.areas[id])
      .filter((a): a is AreaSpec => !!a)
      .map((a) => ({ id: a.id, name: a.name, description: a.description })),
  });
}

/**
 * Merge two playthroughs' canon into one ledger's worth of facts.
 *
 * Fact ids are only unique within a playthrough, and both sides really can
 * have a `fact-1`, so every fact is re-keyed by the side it came from. The
 * statements themselves are left alone and are NOT deduplicated or
 * reconciled: two histories of the same weeks from opposite sides are supposed
 * to disagree about what was visible, and flattening that would erase the
 * thing the finale exists to put back together. The Reunion prompts tell the
 * model both are true.
 */
export function mergeCanon(
  her: PlaythroughExport,
  his: PlaythroughExport,
  seeds: readonly { statement: string; entities: string[] }[] = [],
): CanonFact[] {
  const out: CanonFact[] = [];
  seeds.forEach((seed, i) => {
    out.push({
      id: `reunion-seed-${i + 1}`,
      statement: seed.statement,
      entities: [...seed.entities],
      sceneId: "reunion",
    });
  });
  for (const [side, source] of [
    ["her", her],
    ["his", his],
  ] as const) {
    for (const fact of source.canon) {
      out.push({
        ...fact,
        id: `${side}-${fact.id}`,
        // Supersession is within a playthrough, so the reference is re-keyed
        // to the same side — a fact on her side never superseded one on his.
        ...(fact.supersedes ? { supersedes: `${side}-${fact.supersedes}` } : {}),
      });
    }
    // The threshold's seeds are the point of the export; they enter canon in
    // their own right so the finale can be checked against them by id.
    for (const seed of source.ending.reunionSeeds) {
      out.push({
        id: `${side}-${seed.id}`,
        statement: seed.statement,
        entities: [],
        sceneId: "reunion",
      });
    }
  }
  return out;
}

/** Everyone either player met, first appearance winning as it does in a solo path. */
export function mergeCharacters(
  her: PlaythroughExport,
  his: PlaythroughExport,
): Record<string, CharacterRecord> {
  const out: Record<string, CharacterRecord> = {};
  for (const record of [...her.characters, ...his.characters]) {
    if (out[record.id]) continue;
    out[record.id] = record;
  }
  return out;
}

/** Plan the shared finale from both histories. */
export async function createReunionArc(
  model: ModelClient,
  her: PlaythroughExport,
  his: PlaythroughExport,
  facts: readonly CanonFact[],
): Promise<StoryArc> {
  const arc = await model.generateStructured({
    role: DIRECTOR_CONFIG.architect,
    system: REUNION_ARCHITECT_SYSTEM,
    user: buildReunionArchitectUser({ her, his, facts }),
    schema: StoryArc,
  });
  return normalizeArc(arc);
}

export const ReunionWriterOutput = z.object({
  area: AreaSpec,
  advancesBeatId: Slug.optional(),
});
export type ReunionWriterOutput = z.infer<typeof ReunionWriterOutput>;

export interface WriteReunionAreaResult {
  area: AreaSpec;
  advancesBeatId?: string;
}

/**
 * The generation/validation/repair loop for shared areas. Same shape as
 * writeArea, with the reunion-specific integrity rules layered on: the path
 * must be "reunion", both players must fit, and the reserved partner id must
 * not be authored.
 *
 * Unlike writeArea there is no continuity check against a model here — the
 * merged canon deliberately contains two histories that disagree about what
 * was visible, and a checker fed that would reject everything.
 */
export async function writeReunionArea(
  model: ModelClient,
  ctx: ReunionWriterContext,
  opts: { log?: (msg: string) => void } = {},
): Promise<WriteReunionAreaResult> {
  const user = buildReunionWriterUser(ctx);
  const feedback: string[] = [];
  const usedIds = new Set(ctx.existingAreaIds);
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt <= DIRECTOR_CONFIG.maxRetries; attempt++) {
    const out = await model.generateStructured({
      role: DIRECTOR_CONFIG.writer,
      system: REUNION_WRITER_SYSTEM,
      user,
      feedback,
      schema: ReunionWriterOutput,
    });

    const problems = [
      ...validateAreaIntegrity(out.area),
      ...validateReunionArea(out.area),
    ];
    if (usedIds.has(out.area.id)) {
      problems.push(`area id "${out.area.id}" is already used — choose a new one`);
    }
    if (!ctx.endingAllowed && out.area.portals.some((p) => p.transition.type === "ending")) {
      problems.push(
        "this area has an ending portal, but the arc is not in its final act — the story is not finished",
      );
    }
    if (problems.length === 0) {
      return {
        area: out.area,
        ...(out.advancesBeatId ? { advancesBeatId: out.advancesBeatId } : {}),
      };
    }
    lastProblems = problems;
    opts.log?.(`reunion area rejected: ${problems.join("; ")}`);
    feedback.push(
      `Your area had structural problems:\n${problems
        .map((p) => `- ${p}`)
        .join("\n")}\nRegenerate the complete output with these fixed.`,
    );
  }
  throw new ReunionFailedError(
    `reunion area generation failed after ${DIRECTOR_CONFIG.maxRetries + 1} attempts: ${lastProblems.join("; ")}`,
  );
}

/**
 * Write the only ending in this game that resolves.
 *
 * The guard is the mirror of the Threshold Writer's: that one rejects an
 * ending that resolves, this one rejects an ending that does not pay off both
 * sides. A finale that honours only one playthrough's seeds is one player's
 * ending with a witness, which is exactly what the Reunion exists not to be.
 */
export async function writeReunionFinale(
  model: ModelClient,
  ctx: ReunionFinaleContext,
  opts: { log?: (msg: string) => void } = {},
): Promise<ReunionEnding> {
  const log = opts.log ?? (() => {});
  const feedback: string[] = [];

  for (let attempt = 0; attempt <= DIRECTOR_CONFIG.maxRetries; attempt++) {
    const ending = await model.generateStructured({
      role: DIRECTOR_CONFIG.writer,
      system: REUNION_FINALE_SYSTEM,
      user: buildReunionFinaleUser(ctx),
      feedback: [...feedback],
      schema: ReunionEnding,
    });

    const problems = checkReunionEnding(ending, ctx.her, ctx.his);
    if (problems.length === 0) return ending;

    log(`reunion finale rejected: ${problems.join("; ")}`);
    feedback.push(
      `Your ending was rejected: ${problems.join("; ")}. Rewrite it so both playthroughs are visibly in it.`,
    );
    if (attempt === DIRECTOR_CONFIG.maxRetries) {
      log("reunion finale: retries exhausted, accepting last candidate");
      // Two players who reached the end always get their ending — the
      // always-playable invariant outranks the guard (VISION.md).
      return ending;
    }
  }
  throw new ReunionFailedError("reunion finale writer exhausted retries");
}

/** Structural guards on the finale. Prose is the model's job; this is the arithmetic. */
export function checkReunionEnding(
  ending: ReunionEnding,
  her: PlaythroughExport,
  his: PlaythroughExport,
): string[] {
  const problems: string[] = [];
  const paid = new Set(ending.paidOffSeedIds);
  // Side-prefixed, matching how the prompt showed them: both playthroughs
  // choose their own seed ids and can collide, and a payoff that could belong
  // to either side proves nothing about both being here.
  const herSeeds = her.ending.reunionSeeds.map((s) => `her-${s.id}`);
  const hisSeeds = his.ending.reunionSeeds.map((s) => `his-${s.id}`);

  if (!herSeeds.some((id) => paid.has(id))) {
    problems.push(
      "pays off nothing from Suzune's playthrough — the finale must use what she brought back",
    );
  }
  if (!hisSeeds.some((id) => paid.has(id))) {
    problems.push(
      "pays off nothing from Itsuki's playthrough — the finale must use what he worked out",
    );
  }
  const known = new Set([...herSeeds, ...hisSeeds]);
  const invented = ending.paidOffSeedIds.filter((id) => !known.has(id));
  if (invented.length > 0) {
    problems.push(
      `claims to pay off seeds that do not exist: ${invented.join(", ")}`,
    );
  }
  // The one outcome the Reunion may not have: the ache left open. Every other
  // ending in the game is a threshold; this one is not allowed to be.
  const unresolved =
    /\b(still cannot reach|cannot cross|not yet|one day|someday, maybe|will find (her|him) (one day|someday))\b/i;
  if (unresolved.test(ending.closingText)) {
    problems.push(
      "reads as another threshold — this is the ending that resolves; they reach each other",
    );
  }
  return problems;
}
