import { SceneSpec, Slug } from "@unwritten/schema";
import { validateSceneIntegrity } from "@unwritten/engine";
import { z } from "zod";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient } from "./modelClient.js";
import {
  ENDING_WRITER_SYSTEM,
  WRITER_SYSTEM,
  buildWriterUser,
  type WriterContext,
} from "./prompts.js";
import { checkContinuity } from "./stages.js";

export const WriterOutput = z.object({
  scene: SceneSpec,
  /** Set when this scene completes one of the current act's beats. */
  advancesBeatId: Slug.optional(),
});
export type WriterOutput = z.infer<typeof WriterOutput>;

export class WriterFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterFailedError";
  }
}

export interface WriteSceneResult {
  scene: SceneSpec;
  advancesBeatId?: string;
  /** True when the continuity check was still failing on the last attempt (degraded accept). */
  continuityDegraded: boolean;
}

/**
 * The generation/validation/repair loop (CLAUDE.md invariant): structured
 * output → integrity check → continuity check; failures feed back verbatim,
 * max DIRECTOR_CONFIG.maxRetries regenerations. Integrity failures after all
 * retries throw; continuity-only failures degrade with a log — the player
 * never waits forever on a stubborn checker.
 */
export async function writeScene(
  model: ModelClient,
  ctx: WriterContext,
  opts: { ending?: boolean; log?: (msg: string) => void } = {},
): Promise<WriteSceneResult> {
  const system = opts.ending ? ENDING_WRITER_SYSTEM : WRITER_SYSTEM;
  const user = buildWriterUser(ctx);
  const feedback: string[] = [];
  const usedIds = new Set(ctx.existingSceneIds);

  let lastCandidate: WriterOutput | undefined;
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt <= DIRECTOR_CONFIG.maxRetries; attempt++) {
    const out = await model.generateStructured({
      role: DIRECTOR_CONFIG.writer,
      system,
      user,
      feedback,
      schema: WriterOutput,
    });

    const problems = validateSceneIntegrity(out.scene);
    if (usedIds.has(out.scene.id)) {
      problems.push(`scene id "${out.scene.id}" is already used — choose a new one`);
    }
    if (problems.length > 0) {
      lastCandidate = undefined;
      lastProblems = problems;
      feedback.push(
        `Your scene had structural problems:\n${problems
          .map((p) => `- ${p}`)
          .join("\n")}\nRegenerate the complete output with these fixed.`,
      );
      continue;
    }

    const verdict = await checkContinuity(model, out.scene, ctx.facts);
    if (verdict.ok) {
      return {
        scene: out.scene,
        ...(out.advancesBeatId ? { advancesBeatId: out.advancesBeatId } : {}),
        continuityDegraded: false,
      };
    }
    lastCandidate = out;
    lastProblems = verdict.violations.map(
      (v) => `contradicts [${v.factId}]: ${v.explanation}`,
    );
    feedback.push(
      `Your scene contradicts established facts:\n${lastProblems
        .map((p) => `- ${p}`)
        .join("\n")}\nRegenerate the complete output without these contradictions.`,
    );
  }

  // Degraded path: structurally valid but the checker still objects.
  // Accept rather than block play; log loudly for the eval set.
  if (lastCandidate) {
    opts.log?.(
      `continuity degraded accept for scene ${lastCandidate.scene.id}: ${lastProblems.join("; ")}`,
    );
    return {
      scene: lastCandidate.scene,
      ...(lastCandidate.advancesBeatId
        ? { advancesBeatId: lastCandidate.advancesBeatId }
        : {}),
      continuityDegraded: true,
    };
  }
  throw new WriterFailedError(
    `scene generation failed after ${DIRECTOR_CONFIG.maxRetries + 1} attempts: ${lastProblems.join("; ")}`,
  );
}
