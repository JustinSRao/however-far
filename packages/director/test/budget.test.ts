import { describe, expect, it } from "vitest";
import { costCounter, recordUsage } from "../src/costs.js";

/**
 * The budget's contract (ADR-0018/0013): optional spend gets cut, required
 * spend never does. A player standing at a door must still get their area.
 */
describe("costCounter", () => {
  it("accumulates spend so a caller can attribute a span of work", () => {
    const before = costCounter();
    recordUsage({
      provider: "openai",
      model: "gpt-5.5",
      kind: "text",
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
    const after = costCounter();
    expect(after.calls).toBe(before.calls + 1);
    expect(after.usd - before.usd).toBeCloseTo(5, 6);
  });

  it("counts unpriced models as zero rather than dropping the call", () => {
    const before = costCounter();
    recordUsage({
      provider: "openai",
      model: "some-unlisted-model",
      kind: "text",
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1000,
    });
    const after = costCounter();
    expect(after.calls).toBe(before.calls + 1);
    expect(after.usd).toBeCloseTo(before.usd, 6);
  });
});
