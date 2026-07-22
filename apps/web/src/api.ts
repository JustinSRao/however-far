import type { ArtRequest, PlayerAction, SceneSpec, SessionSave } from "@unwritten/schema";

/**
 * Typed client for apps/server's HTTP API. This is the only place the web
 * app talks to the network — the browser never calls the Claude API
 * directly (CLAUDE.md invariant 6); the server owns that.
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export type CreateSessionRequest =
  | { mode: "new" }
  | { mode: "replay"; bundlePath: string }
  | { mode: "resume"; id: string };

export interface CreateSessionResponse {
  sessionId: string;
  scene: SceneSpec;
  phase: SessionSave["phase"];
}

export type TurnResult =
  | { kind: "scene"; scene: SceneSpec }
  | { kind: "anchorAck"; text: string }
  | { kind: "ended"; summary: string };

export interface SessionInfo {
  id: string;
  phase: SessionSave["phase"];
  updatedAt: string;
  scenesPlayed: number;
}

export interface BundleInfo {
  path: string;
  title: string;
  description: string;
  createdAt: string;
  creator?: string;
}

export interface PublishMeta {
  title: string;
  description: string;
  creator?: string;
}

export function createSession(req: CreateSessionRequest): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function sendAction(sessionId: string, action: PlayerAction): Promise<TurnResult> {
  return request<TurnResult>(`/api/sessions/${encodeURIComponent(sessionId)}/action`, {
    method: "POST",
    body: JSON.stringify(action),
  });
}

/**
 * URL of the rendered asset for one ArtRequest in one universe. Art is
 * session-scoped because the StyleBible that governs it is: the same request
 * in two universes is two different images. Used as an <img src>, so the
 * browser cache does the work — the server marks these immutable.
 */
export function artUrl(sessionId: string, request: ArtRequest): string {
  const params = new URLSearchParams({
    kind: request.kind,
    subject: request.subject,
    mood: request.mood,
    sizeClass: request.sizeClass,
  });
  return `/api/sessions/${encodeURIComponent(sessionId)}/art?${params.toString()}`;
}

export function fetchSessions(): Promise<SessionInfo[]> {
  return request<SessionInfo[]>("/api/sessions");
}

export function fetchLibrary(): Promise<BundleInfo[]> {
  return request<BundleInfo[]>("/api/library");
}

export function publishSession(
  sessionId: string,
  meta: PublishMeta,
): Promise<{ path: string }> {
  return request<{ path: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
    body: JSON.stringify(meta),
  });
}
