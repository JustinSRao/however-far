import { computeCostUsd, costLedgerPath, readCostLedger, type UsageEvent } from "../src/costs.js";

/**
 * Cost report over the ledger (ADR-0018) — the raw material for the game's
 * cost mockup. Run: npm run costs -w @howeverfar/director [-- --json]
 */

const events = readCostLedger();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summarize(events), null, 2));
  process.exit(0);
}

if (events.length === 0) {
  console.log(`No recorded API calls yet (ledger: ${costLedgerPath()}).`);
  process.exit(0);
}

const s = summarize(events);
const usd = (n: number) => `$${n.toFixed(4)}`;

console.log(`cost ledger — ${costLedgerPath()}\n`);
console.log(
  `total: ${s.calls} calls · ${usd(s.recordedUsd)} recorded (${usd(s.recomputedUsd)} at current prices)` +
    (s.unpricedCalls > 0 ? ` · ${s.unpricedCalls} calls with no price entry` : ""),
);
console.log(
  `tokens: ${s.tokens.input.toLocaleString()} input · ${s.tokens.cachedInput.toLocaleString()} cached-read · ${s.tokens.cacheWrite.toLocaleString()} cache-write · ${s.tokens.output.toLocaleString()} output\n`,
);

table("by model", s.byModel);
table("by role", s.byRole);
table("by day", s.byDay);

function table(title: string, rows: Record<string, { calls: number; usd: number }>): void {
  console.log(title);
  const entries = Object.entries(rows).sort((a, b) => b[1].usd - a[1].usd);
  for (const [key, v] of entries) {
    console.log(`  ${key.padEnd(24)} ${String(v.calls).padStart(5)} calls  ${usd(v.usd).padStart(10)}`);
  }
  console.log("");
}

function summarize(all: UsageEvent[]) {
  const acc = {
    calls: all.length,
    recordedUsd: 0,
    recomputedUsd: 0,
    unpricedCalls: 0,
    tokens: { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 },
    byModel: {} as Record<string, { calls: number; usd: number }>,
    byRole: {} as Record<string, { calls: number; usd: number }>,
    byDay: {} as Record<string, { calls: number; usd: number }>,
  };
  for (const e of all) {
    const recomputed = computeCostUsd(e.model, e) ?? e.costUsd ?? 0;
    acc.recordedUsd += e.costUsd ?? 0;
    acc.recomputedUsd += recomputed;
    if (e.costUsd == null) acc.unpricedCalls++;
    acc.tokens.input += e.inputTokens;
    acc.tokens.cachedInput += e.cachedInputTokens;
    acc.tokens.cacheWrite += e.cacheWriteTokens;
    acc.tokens.output += e.outputTokens;
    bump(acc.byModel, e.model, recomputed);
    bump(acc.byRole, e.role ?? "(unknown)", recomputed);
    bump(acc.byDay, e.ts.slice(0, 10), recomputed);
  }
  return acc;
}

function bump(
  rows: Record<string, { calls: number; usd: number }>,
  key: string,
  usdValue: number,
): void {
  const row = (rows[key] ??= { calls: 0, usd: 0 });
  row.calls++;
  row.usd += usdValue;
}
