import { Director, NO_KEY_MESSAGE, type ModelClient } from "@unwritten/director";
import {
  loadSession,
  newReplaySession,
  readBundle,
  saveSession,
} from "@unwritten/library";
import type { SessionSave } from "@unwritten/schema";

/** Thrown when a session or bundle referenced by id/path cannot be found. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown when the Director is needed but no Claude API key is configured. */
export class ModelUnavailableError extends Error {
  constructor() {
    super(NO_KEY_MESSAGE);
    this.name = "ModelUnavailableError";
  }
}

export interface SessionManagerOptions {
  /** Undefined when the server has no Claude API key configured. */
  model?: ModelClient | undefined;
  log?: (msg: string) => void;
}

/**
 * Owns one live Director per active session, hydrated from disk (via
 * @unwritten/library) on demand. Read-only lookups (snapshot) never require a
 * model client; taking a further turn does.
 */
export class SessionManager {
  private readonly model: ModelClient | undefined;
  private readonly log: (msg: string) => void;
  private readonly directors = new Map<string, Director>();

  constructor(opts: SessionManagerOptions) {
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

  private hydrate(session: SessionSave): Director {
    const director = new Director(
      { model: this.requireModel(), log: this.log },
      session,
    );
    this.directors.set(session.id, director);
    return director;
  }

  createNew(): Director {
    const director = new Director({ model: this.requireModel(), log: this.log });
    this.directors.set(director.getSession().id, director);
    saveSession(director.getSession());
    return director;
  }

  createReplay(bundlePath: string): Director {
    let bundle;
    try {
      bundle = readBundle(bundlePath);
    } catch {
      throw new NotFoundError(`bundle not found at "${bundlePath}"`);
    }
    const director = this.hydrate(newReplaySession(bundle));
    saveSession(director.getSession());
    return director;
  }

  /** Get (or hydrate) the live Director for a session id — needed to take a turn. */
  get(id: string): Director {
    const existing = this.directors.get(id);
    if (existing) return existing;
    return this.hydrate(this.loadFromDisk(id));
  }

  /** Read-only snapshot of a session's saved state. Never requires a model client. */
  snapshot(id: string): SessionSave {
    const existing = this.directors.get(id);
    if (existing) return existing.getSession();
    return this.loadFromDisk(id);
  }

  persist(director: Director): void {
    saveSession(director.getSession());
  }

  private loadFromDisk(id: string): SessionSave {
    try {
      return loadSession(id);
    } catch {
      throw new NotFoundError(`session "${id}" not found`);
    }
  }
}
