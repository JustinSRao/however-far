import { AreaSpec, CanonFact, CheckerVerdict, Slug } from "@unwritten/schema";
import { validateAreaIntegrity } from "@unwritten/engine";
import { z } from "zod";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import { CHECKER_SYSTEM } from "./prompts.js";
import {
  WORLD_WRITER_SYSTEM,
  buildAreaCheckerUser,
  buildWorldWriterUser,
  type WorldWriterContext,
} from "./worldPrompts.js";

export const WorldWriterOutput = z.object({
  area: AreaSpec,
  /** Set when this area's content completes one of the current act's beats. */
  advancesBeatId: Slug.optional(),
});
export type WorldWriterOutput = z.infer<typeof WorldWriterOutput>;

export class WorldWriterFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldWriterFailedError";
  }
}

export interface WriteAreaResult {
  area: AreaSpec;
  advancesBeatId?: string;
  /** True when the continuity check was still failing on the last attempt (degraded accept). */
  continuityDegraded: boolean;
}

export async function checkAreaContinuity(
  model: ModelClient,
  area: AreaSpec,
  facts: readonly CanonFact[],
): Promise<z.infer<typeof CheckerVerdict>> {
  if (facts.length === 0) return { ok: true };
  return model.generateStructured({
    role: DIRECTOR_CONFIG.checker,
    system: CHECKER_SYSTEM,
    user: buildAreaCheckerUser(area, facts),
    schema: CheckerVerdict,
  });
}

/**
 * The generation/validation/repair loop for areas, mirroring writeScene
 * (writer.ts): structured output → engine integrity check → continuity
 * check; failures feed back verbatim, max DIRECTOR_CONFIG.maxRetries
 * regenerations. Integrity failures after all retries throw; continuity-only
 * failures degrade with a log — the player never waits forever.
 */
export async function writeArea(
  model: ModelClient,
  ctx: WorldWriterContext,
  opts: { log?: (msg: string) => void } = {},
): Promise<WriteAreaResult> {
  const user = buildWorldWriterUser(ctx);
  const feedback: string[] = [];
  const usedIds = new Set(ctx.existingAreaIds);

  let lastCandidate: WorldWriterOutput | undefined;
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt <= DIRECTOR_CONFIG.maxRetries; attempt++) {
    const out = await model.generateStructured({
      role: DIRECTOR_CONFIG.writer,
      system: WORLD_WRITER_SYSTEM,
      user,
      feedback,
      schema: WorldWriterOutput,
    });

    const problems = validateAreaIntegrity(out.area);
    if (usedIds.has(out.area.id)) {
      problems.push(`area id "${out.area.id}" is already used — choose a new one`);
    }
    if (out.area.path !== ctx.path) {
      problems.push(`area path "${out.area.path}" must be "${ctx.path}"`);
    }
    if (problems.length > 0) {
      lastCandidate = undefined;
      lastProblems = problems;
      feedback.push(
        `Your area had structural problems:\n${problems
          .map((p) => `- ${p}`)
          .join("\n")}\nRegenerate the complete output with these fixed.`,
      );
      continue;
    }

    const verdict = await checkAreaContinuity(model, out.area, ctx.facts);
    if (verdict.ok) {
      return {
        area: out.area,
        ...(out.advancesBeatId ? { advancesBeatId: out.advancesBeatId } : {}),
        continuityDegraded: false,
      };
    }
    lastCandidate = out;
    lastProblems = verdict.violations.map(
      (v) => `contradicts [${v.factId}]: ${v.explanation}`,
    );
    feedback.push(
      `Your area contradicts established facts:\n${lastProblems
        .map((p) => `- ${p}`)
        .join("\n")}\nRegenerate the complete output without these contradictions.`,
    );
  }

  if (lastCandidate) {
    opts.log?.(
      `continuity degraded accept for area ${lastCandidate.area.id}: ${lastProblems.join("; ")}`,
    );
    return {
      area: lastCandidate.area,
      ...(lastCandidate.advancesBeatId
        ? { advancesBeatId: lastCandidate.advancesBeatId }
        : {}),
      continuityDegraded: true,
    };
  }
  throw new WorldWriterFailedError(
    `area generation failed after ${DIRECTOR_CONFIG.maxRetries + 1} attempts: ${lastProblems.join("; ")}`,
  );
}
