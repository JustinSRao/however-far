import { ReunionDirector, type ModelClient } from "@howeverfar/director";
import {
  listCalls,
  listReunions,
  loadReunion,
  removeCall,
  saveCall,
  saveReunion,
} from "@howeverfar/library";
import {
  callsAnswer,
  sameAddress,
  type CrossingCall,
  type ReunionSessionSave,
} from "@howeverfar/schema";
import {
  checkEntitlement,
  entitlementFromEnv,
  type EntitlementConfig,
} from "@howeverfar/entitlement";
import { ModelUnavailableError, NotFoundError } from "./sessionManager.js";

/**
 * Pairing and shared-world ownership for the Reunion (Phase 7).
 *
 * The pairing rule is the fiction's rule: two calls that answer each other.
 * Neither player can pull the other in, because a call only becomes a world
 * when the other one has also reached across — see docs/REUNION.md, and
 * `callsAnswer` in the schema for what "answer" means exactly.
 */

export class NotEntitledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotEntitledError";
  }
}

export class CallRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallRejectedError";
  }
}

export type CallOutcome =
  | { kind: "waiting"; call: CrossingCall }
  | { kind: "paired"; reunionId: string };

export interface ReunionManagerOptions {
  model?: ModelClient | undefined;
  entitlement?: EntitlementConfig;
  log?: (msg: string) => void;
}

export class ReunionManager {
  private readonly model: ModelClient | undefined;
  private readonly entitlement: EntitlementConfig;
  private readonly log: (msg: string) => void;
  private readonly directors = new Map<string, ReunionDirector>();
  /**
   * One turn at a time per world. Two players pressing at the same instant
   * must not both read the same state and both write it — the shared dice
   * counter and once-only interactions both depend on serialization.
   */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(opts: ReunionManagerOptions) {
    this.model = opts.model;
    this.entitlement = opts.entitlement ?? entitlementFromEnv();
    this.log = opts.log ?? (() => {});
  }

  get available(): boolean {
    return this.model !== undefined;
  }

  private requireModel(): ModelClient {
    if (!this.model) throw new ModelUnavailableError();
    return this.model;
  }

  /**
   * Place a call. If the other side is already waiting, this opens the world;
   * otherwise the call waits for them.
   */
  async call(call: CrossingCall): Promise<CallOutcome> {
    if (sameAddress(call.self.email, call.calling.email)) {
      throw new CallRejectedError("you cannot cross toward yourself");
    }
    if (call.playthrough.path !== call.path) {
      throw new CallRejectedError("the playthrough offered is from the other side");
    }
    const verdict = checkEntitlement(this.entitlement, call.self.email, call.license);
    if (!verdict.ok) throw new NotEntitledError(verdict.reason);

    const waiting = listCalls();
    const answer = waiting.find((other) => callsAnswer(call, other));

    if (!answer) {
      // Replace any earlier call from this address: a player who finished a
      // second playthrough, or fixed a typo in their partner's address, means
      // the newer one.
      for (const stale of waiting) {
        if (sameAddress(stale.self.email, call.self.email)) removeCall(stale.id);
      }
      saveCall(call);
      this.log(`call from ${call.self.email} is waiting for ${call.calling.email}`);
      return { kind: "waiting", call };
    }

    // The other side is checked too: the finale is something two people
    // bought, and letting the caller carry their partner would make this a
    // single purchase for two seats (ADR-0024).
    const partnerVerdict = checkEntitlement(
      this.entitlement,
      answer.self.email,
      answer.license,
    );
    if (!partnerVerdict.ok) {
      throw new NotEntitledError(
        `${answer.self.name} reached back, but their key did not hold: ${partnerVerdict.reason}`,
      );
    }

    const her = call.path === "her" ? call : answer;
    const his = call.path === "his" ? call : answer;
    this.log(`the calls answer: ${her.self.name} and ${his.self.name} — opening the world`);

    const director = await ReunionDirector.open(
      { model: this.requireModel(), log: this.log },
      her.playthrough,
      his.playthrough,
      { her: her.self, his: his.self },
    );
    const session = director.getSession();
    this.directors.set(session.id, director);
    saveReunion(session);
    removeCall(answer.id);
    return { kind: "paired", reunionId: session.id };
  }

  /**
   * Has this address been answered yet? What the side that called first
   * polls. Matched on address, never on name — names are not unique and the
   * whole pairing rule is built on addresses.
   */
  status(
    email: string,
  ): { paired: false } | { paired: true; reunionId: string; role: "her" | "his" } {
    for (const info of listReunions()) {
      const session = this.snapshot(info.id);
      if (sameAddress(session.contacts.her.email, email)) {
        return { paired: true, reunionId: info.id, role: "her" };
      }
      if (sameAddress(session.contacts.his.email, email)) {
        return { paired: true, reunionId: info.id, role: "his" };
      }
    }
    return { paired: false };
  }

  get(id: string): ReunionDirector {
    const existing = this.directors.get(id);
    if (existing) return existing;
    const director = new ReunionDirector(
      { model: this.requireModel(), log: this.log },
      this.loadFromDisk(id),
    );
    this.directors.set(id, director);
    return director;
  }

  snapshot(id: string): ReunionSessionSave {
    const existing = this.directors.get(id);
    if (existing) return existing.getSession();
    return this.loadFromDisk(id);
  }

  persist(director: ReunionDirector): void {
    saveReunion(director.getSession());
  }

  /**
   * Run `work` after everything already queued for this world. Turns from the
   * two players interleave in arrival order and never overlap.
   */
  serialize<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    // Keep the chain alive after a failed turn; the rejection still reaches
    // the caller through `next`.
    this.queues.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  private loadFromDisk(id: string): ReunionSessionSave {
    try {
      return loadReunion(id);
    } catch {
      throw new NotFoundError(`reunion "${id}" not found`);
    }
  }
}
