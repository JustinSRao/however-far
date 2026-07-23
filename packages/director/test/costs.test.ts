import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DIRECTOR_CONFIG } from "../src/config.js";
import {
  computeCostUsd,
  costLedgerPath,
  readCostLedger,
  recordUsage,
  roleNameOf,
} from "../src/costs.js";

let home: string;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "howeverfar-costs-test-"));
  process.env["HOWEVERFAR_HOME"] = home;
});

afterAll(() => {
  delete process.env["HOWEVERFAR_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("computeCostUsd", () => {
  it("prices gpt-5.5 calls ($5 in / $0.50 cached / $30 out per 1M)", () => {
    const cost = computeCostUsd("gpt-5.5", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(5 + 0.5 + 30, 6);
  });

  it("prices claude-haiku-4-5 with cache writes ($1 in / $1.25 write / $5 out)", () => {
    const cost = computeCostUsd("claude-haiku-4-5", {
      inputTokens: 2_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 1_000_000,
      outputTokens: 200_000,
    });
    expect(cost).toBeCloseTo(2 + 1.25 + 1, 6);
  });

  it("returns null for unknown models (tokens still ground truth)", () => {
    expect(
      computeCostUsd("some-future-model", {
        inputTokens: 10,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 10,
      }),
    ).toBeNull();
  });
});

describe("the ledger", () => {
  it("records every call and reads it back, computing cost at write time", () => {
    recordUsage({
      provider: "openai",
      model: "gpt-5.4-mini",
      role: "checker",
      kind: "text",
      inputTokens: 4000,
      cachedInputTokens: 8000,
      cacheWriteTokens: 0,
      outputTokens: 500,
    });
    recordUsage({
      provider: "openai",
      model: "unknown-model",
      kind: "text",
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 100,
    });

    const events = readCostLedger();
    expect(events).toHaveLength(2);
    expect(costLedgerPath()).toContain(home);

    const [first, second] = events;
    expect(first?.role).toBe("checker");
    expect(first?.costUsd).toBeCloseTo(
      (4000 * 0.75 + 8000 * 0.075 + 500 * 4.5) / 1_000_000,
      8,
    );
    expect(first?.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(second?.costUsd).toBeNull();
    expect(second?.inputTokens).toBe(100);
  });
});

describe("roleNameOf", () => {
  it("resolves DIRECTOR_CONFIG roles by identity, falls back to tier", () => {
    expect(roleNameOf(DIRECTOR_CONFIG.writer)).toBe("writer");
    expect(roleNameOf(DIRECTOR_CONFIG.checker)).toBe("checker");
    expect(roleNameOf({ ...DIRECTOR_CONFIG.writer })).toBe("strong");
  });
});
