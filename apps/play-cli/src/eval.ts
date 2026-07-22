import type { PlayerAction } from "@unwritten/schema";
import {
  createModelClient,
  Director,
  NO_KEY_MESSAGE,
  resolveProvider,
  type ModelClient,
} from "@unwritten/director";

/**
 * The go/no-go demo (ROADMAP Phase 1): run contrasting scripted play styles
 * through the Anchor against the LIVE API and show that each becomes a
 * different game. Needs a provider key (see .env.example). Costs real tokens —
 * roughly 6 model calls per style. Run: npm run eval
 */

interface Style {
  name: string;
  actions: PlayerAction[];
}

const STYLES: Style[] = [
  {
    name: "the fighter (aggressive, armed, blunt)",
    actions: [
      { type: "choice", choiceId: "demand-answers" },
      { type: "choice", choiceId: "keep-bread" },
      { type: "freeText", text: "grab the knife from the box before anyone can stop me" },
      { type: "choice", choiceId: "take-knife" },
    ],
  },
  {
    name: "the detective (cautious, probing, curious)",
    actions: [
      { type: "choice", choiceId: "watch-quietly" },
      { type: "choice", choiceId: "press-smoke" },
      { type: "freeText", text: "examine the wax seal and the handwriting on the letter without touching anything" },
      { type: "choice", choiceId: "take-key" },
    ],
  },
  {
    name: "the heart (social, generous, personal)",
    actions: [
      { type: "choice", choiceId: "join-fire" },
      { type: "choice", choiceId: "share-bread" },
      { type: "freeText", text: "ask Marlow if they have anyone waiting for them somewhere" },
      { type: "choice", choiceId: "take-letter" },
    ],
  },
];

async function runStyle(style: Style, model: ModelClient): Promise<void> {
  console.log(`\n${"═".repeat(72)}\n▶ ${style.name}\n${"═".repeat(72)}`);
  const director = new Director({
    model,
    log: (m) => console.log(`  [director] ${m}`),
  });
  for (const action of style.actions) {
    const result = await director.handleAction(action);
    if (result.kind === "anchorAck") continue;
    if (result.kind === "ended") break;
  }
  const s = director.getSession();
  console.log(`\n  GENRE: ${s.profile?.genre.primary} (confidence ${s.profile?.genre.confidence})`);
  console.log(`  TONE:  ${s.profile?.tone}`);
  console.log(`  ARC:   ${s.arc?.premise}`);
  console.log(`  ENDING PLANNED: ${s.arc?.plannedEnding.tone} — ${s.arc?.plannedEnding.summary}`);
  const first = s.scenes[s.state.currentSceneId];
  console.log(`\n  FIRST GENERATED SCENE — "${first?.title}"\n`);
  console.log(
    (first?.narration ?? "")
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  );
}

async function main(): Promise<void> {
  const model = createModelClient();
  if (!model) {
    console.error(`${NO_KEY_MESSAGE} This eval hits the live API.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Go/no-go eval via ${resolveProvider()}: same Anchor, three play styles.\n` +
      "Success = three visibly different games.",
  );
  for (const style of STYLES) {
    await runStyle(style, model);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
