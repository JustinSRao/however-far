import { validateAreaIntegrity } from "@unwritten/engine";
import { createModelClient, loadEnv } from "../src/createModelClient.js";
import { WorldDirector } from "../src/worldDirector.js";

/**
 * Phase 4 go/no-go demo (live API — costs real tokens):
 * a scripted playthrough of the prologue's key beats, then through the
 * chosen door at the crossing. Passes when the crossing commits the path
 * (profile + seeded canon + arc) and the World Writer delivers a valid,
 * integrity-clean first generated area.
 *
 *   npm run eval:world -w @unwritten/director            # her path (default)
 *   npm run eval:world -w @unwritten/director -- his     # his path
 */

const path = process.argv[2] === "his" ? ("his" as const) : ("her" as const);

loadEnv();
const model = createModelClient();
if (!model) {
  console.error("No model API key configured — set one in .env first.");
  process.exit(1);
}

const log = (msg: string) => console.log(`  [director] ${msg}`);

/** Teleport the session (test-style) so the scripted actions are legal. */
function at(
  director: WorldDirector,
  areaId: string,
  x: number,
  y: number,
): WorldDirector {
  const save = director.getSession();
  save.state.currentAreaId = areaId;
  save.state.pos = { x, y };
  if (!save.state.visitedAreaIds.includes(areaId)) {
    save.state.visitedAreaIds.push(areaId);
  }
  return new WorldDirector({ model: model!, log }, save);
}

async function main(): Promise<void> {
  console.log(`world eval — path: ${path}\n`);
  let director = new WorldDirector({ model: model!, log });

  // Scripted prologue beats (the Profiler's raw material).
  console.log("· street: greeting the cat, taking her hand");
  director = at(director, "prologue-street", 6, 3);
  await director.handleAction({ type: "interact", entityId: "maru" });
  await director.handleAction({
    type: "convoChoice",
    entityId: "suzune",
    choiceId: "take-her-hand",
  });

  console.log("· river road: the promise");
  director = at(director, "prologue-walk-home", 2, 2);
  await director.handleAction({
    type: "convoChoice",
    entityId: "suzune",
    choiceId: "promise-find-her",
  });

  console.log("· underpass: holding on");
  director = at(director, "prologue-underpass", 3, 2);
  await director.handleAction({
    type: "convoChoice",
    entityId: "suzune",
    choiceId: "grab-her-hand",
  });

  console.log("· the far end: her ribbon");
  director = at(director, "prologue-vanishing", 4, 2);
  await director.handleAction({ type: "interact", entityId: "her-ribbon" });

  console.log(`· the crossing: choosing ${path === "her" ? "the door of moonlight" : "the door of rain"}\n`);
  const doorPos = path === "her" ? { x: 1, y: 3 } : { x: 7, y: 3 };
  director = at(director, "prologue-crossing", doorPos.x, doorPos.y);
  const started = Date.now();
  const result = await director.handleAction({
    type: "portal",
    portalId: path === "her" ? "choose-her-path" : "choose-his-path",
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.kind !== "area") {
    console.error(`FAIL: expected a generated area, got "${result.kind}"`);
    process.exit(1);
  }

  const session = director.getSession();
  const problems = validateAreaIntegrity(result.area);
  const named = result.area.entities.filter((e) => e.role === "character");

  console.log(`crossing took ${seconds}s\n`);
  console.log(`profile: ${session.profile?.genre.primary} · tone: ${session.profile?.tone}`);
  console.log(`arc premise: ${session.arc?.premise}`);
  console.log(
    `planned threshold (${session.arc?.plannedEnding.tone}): ${session.arc?.plannedEnding.summary}`,
  );
  console.log(`\nfirst area: "${result.area.name}" (${result.area.id})`);
  console.log(
    `  ${result.area.width}x${result.area.height}, ${result.area.tiles.length} tile defs, ${result.area.entities.length} entities, ${result.area.portals.length} portals`,
  );
  console.log(`  ${result.area.description}`);
  for (const e of named) {
    console.log(`  character: ${e.name}${e.nameMeaning ? ` — ${e.nameMeaning}` : " (no nameMeaning!)"}`);
  }
  console.log(`\ncanon facts: ${session.canon.length}`);
  console.log(`integrity: ${problems.length === 0 ? "clean" : problems.join("; ")}`);

  const namingOk = named.every((e) => !!e.nameMeaning);
  if (problems.length === 0 && session.phase === "generated" && namingOk) {
    console.log("\nPASS — the prologue reads the player, the door opens onto a written world.");
  } else {
    console.error("\nFAIL — see above.");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(String(err));
  process.exit(1);
});
