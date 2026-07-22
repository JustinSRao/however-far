import { WorldDirector, type ModelClient } from "@unwritten/director";
import { loadWorldSession, saveWorldSession } from "@unwritten/library";
import type { AreaSessionSave } from "@unwritten/schema";
import { ModelUnavailableError, NotFoundError } from "./sessionManager.js";

export interface WorldSessionManagerOptions {
  /** Undefined when the server has no model API key configured. */
  model?: ModelClient | undefined;
  log?: (msg: string) => void;
}

/**
 * Owns one live WorldDirector per active RPG session (Area DSL v1), hydrated
 * from disk on demand — the area-era twin of SessionManager. The prologue
 * runs with zero model calls, so a session can be created and played to the
 * crossing even without a key; the crossing itself needs the model.
 */
export class WorldSessionManager {
  private readonly model: ModelClient | undefined;
  private readonly log: (msg: string) => void;
  private readonly directors = new Map<string, WorldDirector>();

  constructor(opts: WorldSessionManagerOptions) {
    this.model = opts.model;
    this.log = opts.log ?? (() => {});
  }

  get available(): boolean {
    return this.model !== undefined;
  }

  private requireModel(): ModelClient {
    if (!this.model) throw new ModelUnavailableError();
    return this.model;
  }

  private hydrate(session: AreaSessionSave): WorldDirector {
    const director = new WorldDirector(
      { model: this.requireModel(), log: this.log },
      session,
    );
    this.directors.set(session.id, director);
    return director;
  }

  createNew(): WorldDirector {
    const director = new WorldDirector({ model: this.requireModel(), log: this.log });
    this.directors.set(director.getSession().id, director);
    saveWorldSession(director.getSession());
    return director;
  }

  get(id: string): WorldDirector {
    const existing = this.directors.get(id);
    if (existing) return existing;
    return this.hydrate(this.loadFromDisk(id));
  }

  snapshot(id: string): AreaSessionSave {
    const existing = this.directors.get(id);
    if (existing) return existing.getSession();
    return this.loadFromDisk(id);
  }

  persist(director: WorldDirector): void {
    saveWorldSession(director.getSession());
  }

  private loadFromDisk(id: string): AreaSessionSave {
    try {
      return loadWorldSession(id);
    } catch {
      throw new NotFoundError(`world session "${id}" not found`);
    }
  }
}
