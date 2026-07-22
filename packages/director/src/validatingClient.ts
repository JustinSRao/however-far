import { ZodError } from "zod";
import { DIRECTOR_CONFIG } from "./config.js";
import type { ModelClient, StructuredRequest } from "./modelClient.js";

/**
 * Bounded regeneration-with-feedback for *every* generation call site, which
 * CLAUDE.md requires but only `writeScene` used to implement. The Architect,
 * Profiler, Stylist and extractor all called the model once and let a schema
 * violation escape as an exception — a gap that stayed invisible until strict
 * structured outputs started dropping constraint keywords.
 *
 * Wraps any ModelClient, so it protects both providers. Only schema failures
 * are retried: those are what feedback can fix. Transport, auth and rate-limit
 * errors are rethrown immediately rather than burned on pointless attempts.
 *
 * This composes with `writeScene`'s own loop rather than duplicating it — this
 * layer makes output *schema-valid*, that one makes it *story-valid*
 * (structural integrity and continuity against canon).
 */
export class ValidatingModelClient implements ModelClient {
  private readonly inner: ModelClient;
  private readonly maxRetries: number;
  private readonly log: (msg: string) => void;

  constructor(
    inner: ModelClient,
    opts: { maxRetries?: number; log?: (msg: string) => void } = {},
  ) {
    this.inner = inner;
    this.maxRetries = opts.maxRetries ?? DIRECTOR_CONFIG.maxRetries;
    this.log = opts.log ?? (() => {});
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    const feedback = [...(req.feedback ?? [])];
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.inner.generateStructured({ ...req, feedback });
      } catch (err) {
        if (!(err instanceof ZodError)) throw err;
        lastError = err;
        const problems = describeIssues(err);
        this.log(
          `output failed schema validation (attempt ${attempt + 1}/${this.maxRetries + 1}): ${problems}`,
        );
        feedback.push(
          `Your previous output did not satisfy the schema:\n${problems}\n` +
            `Return the complete output again with these corrected.`,
        );
      }
    }
    throw lastError;
  }
}

/** Zod issues as instructions the model can act on, not a stack trace. */
function describeIssues(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}
