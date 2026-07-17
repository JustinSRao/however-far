import type { CanonFact } from "@unwritten/schema";
import { z } from "zod";
import { NewFact } from "@unwritten/schema";

type NewFactT = z.infer<typeof NewFact>;

/**
 * Append-only fact ledger (ADR-0004). Facts are never edited or deleted;
 * in-world change appends a superseding fact.
 */
export class CanonLedger {
  private readonly facts: CanonFact[];

  constructor(facts: readonly CanonFact[] = []) {
    this.facts = [...facts];
  }

  all(): readonly CanonFact[] {
    return this.facts;
  }

  /** Facts not superseded by a later fact. */
  active(): CanonFact[] {
    const superseded = new Set(
      this.facts.map((f) => f.supersedes).filter((s): s is string => !!s),
    );
    return this.facts.filter((f) => !superseded.has(f.id));
  }

  /** Assign ids + sceneId and append. Bad supersedes references are dropped, not fatal. */
  append(newFacts: readonly NewFactT[], sceneId: string): CanonFact[] {
    const known = new Set(this.facts.map((f) => f.id));
    const added: CanonFact[] = [];
    for (const nf of newFacts) {
      const id = `fact-${String(this.facts.length + 1).padStart(4, "0")}`;
      const fact: CanonFact = {
        id,
        statement: nf.statement,
        entities: nf.entities,
        sceneId,
        ...(nf.supersedes && known.has(nf.supersedes)
          ? { supersedes: nf.supersedes }
          : {}),
      };
      this.facts.push(fact);
      known.add(id);
      added.push(fact);
    }
    return added;
  }

  /**
   * Retrieval for the Scene Writer: active facts touching the given entities
   * first, then most recent facts to fill the budget. Superseding facts win
   * over superseded ones by construction (active()).
   */
  retrieve(entities: readonly string[], limit: number): CanonFact[] {
    const active = this.active();
    const wanted = new Set(entities);
    const matching = active.filter((f) => f.entities.some((e) => wanted.has(e)));
    const rest = active.filter((f) => !matching.includes(f)).reverse();
    const combined = [...matching, ...rest];
    return combined.slice(0, limit);
  }
}
