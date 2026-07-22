import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { SceneSpec, SessionSave } from "@unwritten/schema";
import {
  createModelClient,
  Director,
  NO_KEY_MESSAGE,
  type TurnResult,
} from "@unwritten/director";
import {
  exportBundle,
  listBundles,
  listSessions,
  loadSession,
  newReplaySession,
  readBundle,
  saveSession,
  writeBundle,
} from "@unwritten/library";

/**
 * The text loop — the whole vision minus graphics. Usage:
 *   npm start                    new playthrough
 *   npm start -- --resume <id>   resume a saved session
 *   npm start -- --sessions      list saved sessions
 *   npm start -- --library       list published universes
 *   npm start -- --replay <path> play a published universe bundle
 */

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const italic = (s: string) => `\x1b[3m${s}\x1b[0m`;

function wrap(text: string, width = 78): string {
  return text
    .split("\n")
    .map((para) => {
      const words = para.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        if (line.length + w.length + 1 > width) {
          lines.push(line);
          line = w;
        } else {
          line = line ? `${line} ${w}` : w;
        }
      }
      if (line) lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}

function renderScene(scene: SceneSpec): void {
  console.log(`\n${"─".repeat(78)}`);
  console.log(bold(`  ${scene.title}`) + dim(`  ·  ${scene.location.name}`));
  console.log(`${"─".repeat(78)}\n`);
  console.log(wrap(scene.narration));
  for (const line of scene.dialogue) {
    const speaker =
      line.speakerId === "narrator"
        ? ""
        : `${scene.entities.find((e) => e.id === line.speakerId)?.name ?? line.speakerId} — `;
    console.log(`\n${wrap(`${speaker}“${line.text}”`)}`);
  }
  console.log("");
  scene.choices.forEach((c, i) => {
    console.log(`  ${bold(String(i + 1))}. ${c.label}`);
  });
  if (scene.freeText.enabled) {
    console.log(
      dim(`  …or type anything: ${scene.freeText.placeholder ?? "do something else"}`),
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === "--sessions") {
    for (const s of listSessions()) {
      console.log(`${s.id}  ${dim(`${s.phase} · ${s.scenesPlayed} scenes · ${s.updatedAt}`)}`);
    }
    return;
  }
  if (args[0] === "--library") {
    const bundles = listBundles();
    if (bundles.length === 0) console.log(dim("The library is empty — finish a game to publish one."));
    for (const b of bundles) {
      console.log(`${bold(b.title)}${b.creator ? dim(` by ${b.creator}`) : ""}`);
      console.log(`  ${wrap(b.description, 74).split("\n").join("\n  ")}`);
      console.log(dim(`  replay: npm start -- --replay "${b.path}"`));
    }
    return;
  }

  const model = createModelClient();
  if (!model) {
    console.error(NO_KEY_MESSAGE);
    process.exitCode = 1;
    return;
  }

  let session: SessionSave | undefined;
  if (args[0] === "--resume" && args[1]) {
    session = loadSession(args[1]);
    console.log(dim(`resuming ${session.id} (${session.phase})`));
  } else if (args[0] === "--replay" && args[1]) {
    const bundle = readBundle(args[1]);
    session = newReplaySession(bundle);
    console.log(dim(`replaying "${bundle.manifest.title}" — the story is fixed; your path through it is not.`));
  }

  const director = new Director(
    { model, log: (m) => console.log(dim(`  [director] ${m}`)) },
    session,
  );

  const rl = createInterface({ input: stdin, output: stdout });
  let scene = director.currentScene();
  renderScene(scene);

  for (;;) {
    const answer = (await rl.question(`\n${bold(">")} `)).trim();
    if (!answer) continue;
    if (answer === "/quit") {
      saveSession(director.getSession());
      console.log(dim(`saved as "${director.getSession().id}" — resume with --resume`));
      break;
    }

    const choiceIndex = Number.parseInt(answer, 10);
    const action =
      Number.isInteger(choiceIndex) &&
      choiceIndex >= 1 &&
      choiceIndex <= scene.choices.length
        ? ({ type: "choice", choiceId: scene.choices[choiceIndex - 1]!.id } as const)
        : ({ type: "freeText", text: answer.slice(0, 500) } as const);

    let result: TurnResult;
    try {
      const willGenerate =
        action.type === "freeText" ||
        scene.choices.find((c) => c.id === (action.type === "choice" ? action.choiceId : ""))
          ?.transition.type !== "scene";
      if (willGenerate && director.getSession().phase !== "anchor") {
        console.log(dim("\n  …the world is being written…"));
      }
      result = await director.handleAction(action);
    } catch (err) {
      console.error(dim(`  something slipped in the machinery (${String(err)}) — try again.`));
      continue;
    }

    saveSession(director.getSession());

    if (result.kind === "anchorAck") {
      console.log(`\n${italic(wrap(result.text))}`);
      continue;
    }
    if (result.kind === "ended") {
      console.log(`\n${"═".repeat(78)}\n`);
      console.log(wrap(result.summary));
      console.log(`\n${bold("The story is over.")} ${dim("It never existed until you played it.")}\n`);
      const publish = (await rl.question("Publish this universe to your library? (y/N) ")).trim();
      if (publish.toLowerCase().startsWith("y")) {
        const title = (await rl.question("Title: ")).trim() || "An Untitled Road";
        const description =
          (await rl.question("Description: ")).trim() || "A road that remembered someone.";
        const bundle = exportBundle(director.getSession(), { title, description });
        const path = writeBundle(bundle);
        console.log(dim(`published: ${path}`));
        console.log(dim(`others can play it with: npm start -- --replay "${path}"`));
      }
      break;
    }

    scene = result.scene;
    renderScene(scene);
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
