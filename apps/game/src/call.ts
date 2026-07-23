import type { CrossingCall, PlaythroughExport, SoloPath } from "@howeverfar/schema";

/**
 * The Call (docs/REUNION.md) — how two players find each other.
 *
 * It is a mutual invitation wearing the story's clothes. Her side rings a bell
 * toward a name; his side writes a name back into a register that erased it.
 * Both are asking for the same two things, because both have to: a name, and
 * an address. And both sides must send — a call that only one person made
 * never becomes a world, which is the mechanism and also the point.
 *
 * The one thing here that does NOT wear costume is the key. The Reunion is
 * paid for, and dressing a purchase up as fiction would be a trick; the field
 * says what it is.
 */

const COPY: Record<SoloPath, { title: string; body: string; send: string }> = {
  her: {
    title: "The bell has a name in it.",
    body:
      "You have reached the way home, and it will not open for one pair of hands. But the bell that brought you here was never a summons — it was a call, and a call can be made in the other direction. So ring it, and put a name in it. If they are ringing for you at the same moment, the sound will finally have somewhere to land.",
    send: "ring it",
  },
  his: {
    title: "Write her back in.",
    body:
      "Everything that took her worked through records — a name struck off one list, then every list, until they all agreed with each other and not with you. So put one back. A name, and an address that has to acknowledge it. If she is writing yours down at the same moment, the two entries will contradict, and something will finally have to give.",
    send: "write it in",
  },
};

export interface CallDraft {
  self: { name: string; email: string };
  calling: { name: string; email: string };
  license: string;
}

const FIELDS = [
  { key: "selfName", label: "The name they know you by", type: "text" },
  { key: "selfEmail", label: "Where you can be reached", type: "email" },
  { key: "callingName", label: "Who you are reaching for", type: "text" },
  { key: "callingEmail", label: "Where they can be reached", type: "email" },
] as const;

/**
 * Put the Call form on the veil. Resolves with the draft when they send, or
 * undefined if they step back — nobody is made to do this.
 */
export function showCall(path: SoloPath, veil: HTMLElement): Promise<CallDraft | undefined> {
  const copy = COPY[path];
  return new Promise((resolve) => {
    veil.classList.add("open");
    veil.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "inner call";

    const title = document.createElement("h1");
    title.textContent = copy.title;
    const body = document.createElement("p");
    body.textContent = copy.body;
    inner.append(title, body);

    const form = document.createElement("form");
    form.className = "call-form";
    const inputs: Record<string, HTMLInputElement> = {};
    for (const field of FIELDS) {
      const row = document.createElement("label");
      row.className = "field";
      const caption = document.createElement("span");
      caption.textContent = field.label;
      const input = document.createElement("input");
      input.type = field.type;
      input.required = true;
      input.autocomplete = "off";
      input.spellcheck = false;
      inputs[field.key] = input;
      row.append(caption, input);
      form.appendChild(row);
    }

    const keyRow = document.createElement("label");
    keyRow.className = "field key-field";
    const keyCaption = document.createElement("span");
    keyCaption.textContent = "Your Reunion key";
    const keyNote = document.createElement("small");
    keyNote.textContent =
      "The Reunion is the paid chapter. Your key came with it, and it is tied to the address above.";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "HF1-····-····-····-····";
    keyInput.autocomplete = "off";
    keyInput.spellcheck = false;
    keyRow.append(keyCaption, keyInput, keyNote);
    form.appendChild(keyRow);

    const note = document.createElement("div");
    note.className = "hint";
    note.textContent =
      "Both of you have to send. Nobody gets pulled across who did not reach back.";

    const actions = document.createElement("div");
    actions.className = "call-actions";
    const send = document.createElement("button");
    send.type = "submit";
    send.textContent = copy.send;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "quiet";
    back.textContent = "not yet";
    actions.append(send, back);
    form.append(actions);
    inner.append(form, note);
    veil.appendChild(inner);
    // Keystrokes belong to the form while it is open, never to the game.
    form.addEventListener("keydown", (event) => event.stopPropagation());
    inputs["selfName"]?.focus();

    const finish = (value: CallDraft | undefined): void => {
      veil.innerHTML = "";
      resolve(value);
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finish({
        self: {
          name: inputs["selfName"]?.value.trim() ?? "",
          email: inputs["selfEmail"]?.value.trim() ?? "",
        },
        calling: {
          name: inputs["callingName"]?.value.trim() ?? "",
          email: inputs["callingEmail"]?.value.trim() ?? "",
        },
        license: keyInput.value.trim(),
      });
    });
    back.addEventListener("click", () => finish(undefined));
  });
}

export type CallResult =
  | { kind: "waiting" }
  | { kind: "paired"; reunionId: string; role: SoloPath }
  | { kind: "refused"; message: string };

/** Fetch this playthrough's portable form — what the Call carries across. */
export async function fetchExport(
  sessionId: string,
  playerName: string,
): Promise<PlaythroughExport> {
  const res = await fetch(`/api/world-sessions/${sessionId}/export`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerName }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "this playthrough could not be carried across");
  }
  return (await res.json()) as PlaythroughExport;
}

export async function placeCall(
  draft: CallDraft,
  path: SoloPath,
  playthrough: PlaythroughExport,
): Promise<CallResult> {
  const call: CrossingCall = {
    id: `call-${path}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    self: draft.self,
    calling: draft.calling,
    path,
    ...(draft.license ? { license: draft.license } : {}),
    playthrough,
  };
  const res = await fetch("/api/crossing/call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(call),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { kind: "refused", message: body.error ?? "the call did not carry" };
  }
  const outcome = (await res.json()) as { kind: string; reunionId?: string };
  if (outcome.kind === "paired" && outcome.reunionId) {
    return { kind: "paired", reunionId: outcome.reunionId, role: path };
  }
  return { kind: "waiting" };
}

/** Has the other side reached back yet? */
export async function pollCall(
  email: string,
): Promise<{ reunionId: string; role: SoloPath } | undefined> {
  try {
    const res = await fetch(`/api/crossing/status?email=${encodeURIComponent(email)}`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      paired: boolean;
      reunionId?: string;
      role?: SoloPath;
    };
    if (body.paired && body.reunionId && body.role) {
      return { reunionId: body.reunionId, role: body.role };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
