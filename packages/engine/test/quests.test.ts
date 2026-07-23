import { describe, expect, it } from "vitest";
import { AreaSpec } from "@howeverfar/schema";
import {
  activeQuests,
  applyAreaEffects,
  findQuest,
  initialAreaState,
  openObjectives,
  validateAreaIntegrity,
} from "../src/index.js";

function area(overrides: Record<string, unknown> = {}): AreaSpec {
  return AreaSpec.parse({
    dslVersion: 1,
    id: "market",
    name: "Market",
    description: "Stalls and shouting.",
    path: "her",
    width: 4,
    height: 4,
    tiles: [{ id: "stone", name: "stone", walkable: true, color: "#97a1b3" }],
    ground: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    playerSpawn: { x: 0, y: 0 },
    entities: [],
    portals: [
      { id: "out", pos: { x: 3, y: 3 }, label: "out", transition: { type: "generate", hint: "on" } },
    ],
    quests: [
      {
        id: "find-the-bell",
        title: "The Bell in the Well",
        summary: "Someone heard it ringing three nights running.",
        objectives: [
          { id: "ask-around", text: "Ask who heard it" },
          { id: "look-in-well", text: "Look into the well" },
        ],
        reward: [{ op: "adjustAttribute", attribute: "wits", delta: 1 }],
      },
    ],
    ...overrides,
  });
}

const start = { op: "questStart", questId: "find-the-bell" } as const;
const obj = (id: string) =>
  ({ op: "questObjective", questId: "find-the-bell", objectiveId: id }) as const;

describe("quest lifecycle", () => {
  it("starts a declared quest into the log", () => {
    const a = area();
    const state = applyAreaEffects(initialAreaState(a), [start], a);
    const entry = findQuest(state, "find-the-bell");
    expect(entry?.status).toBe("active");
    expect(entry?.def.title).toBe("The Bell in the Well");
    expect(activeQuests(state)).toHaveLength(1);
    expect(openObjectives(entry!)).toHaveLength(2);
  });

  it("re-offering a quest never resets progress", () => {
    const a = area();
    let state = applyAreaEffects(initialAreaState(a), [start, obj("ask-around")], a);
    state = applyAreaEffects(state, [start], a);
    expect(findQuest(state, "find-the-bell")?.completedObjectiveIds).toEqual(["ask-around"]);
    expect(state.quests).toHaveLength(1);
  });

  it("auto-completes and pays the reward when the last objective lands", () => {
    const a = area();
    let state = applyAreaEffects(initialAreaState(a), [start, obj("ask-around")], a);
    expect(findQuest(state, "find-the-bell")?.status).toBe("active");
    expect(state.sheet.attributes.wits).toBe(1);

    state = applyAreaEffects(state, [obj("look-in-well")], a);
    expect(findQuest(state, "find-the-bell")?.status).toBe("complete");
    expect(state.sheet.attributes.wits).toBe(2); // reward applied exactly once
    expect(activeQuests(state)).toHaveLength(0);
  });

  it("ignores a repeated objective, so the reward cannot be farmed", () => {
    const a = area();
    let state = applyAreaEffects(
      initialAreaState(a),
      [start, obj("ask-around"), obj("look-in-well")],
      a,
    );
    state = applyAreaEffects(state, [obj("look-in-well"), obj("ask-around")], a);
    expect(state.sheet.attributes.wits).toBe(2);
  });

  it("resolving early stops further progress", () => {
    const a = area();
    let state = applyAreaEffects(initialAreaState(a), [start], a);
    state = applyAreaEffects(
      state,
      [{ op: "questResolve", questId: "find-the-bell", status: "failed" }],
      a,
    );
    expect(findQuest(state, "find-the-bell")?.status).toBe("failed");
    state = applyAreaEffects(state, [obj("ask-around")], a);
    expect(findQuest(state, "find-the-bell")?.completedObjectiveIds).toEqual([]);
    expect(state.sheet.attributes.wits).toBe(1); // failed quests pay nothing
  });

  it("advances a quest from an area that did not declare it", () => {
    const declaring = area();
    const elsewhere = area({ id: "road", quests: [] });
    let state = applyAreaEffects(initialAreaState(declaring), [start], declaring);
    state = applyAreaEffects(state, [obj("ask-around")], elsewhere);
    expect(findQuest(state, "find-the-bell")?.completedObjectiveIds).toEqual(["ask-around"]);
  });

  it("ignores an unknown quest rather than crashing play", () => {
    const a = area();
    const state = applyAreaEffects(
      initialAreaState(a),
      [{ op: "questStart", questId: "no-such-quest" }],
      a,
    );
    expect(state.quests).toHaveLength(0);
  });

  it("terminates when a reward loops back to its own quest", () => {
    const looping = area({
      quests: [
        {
          id: "ouroboros",
          title: "Ouroboros",
          summary: "A reward that re-completes itself.",
          objectives: [{ id: "only", text: "Close the loop" }],
          reward: [{ op: "questResolve", questId: "ouroboros", status: "complete" }],
        },
      ],
    });
    const state = applyAreaEffects(
      initialAreaState(looping),
      [
        { op: "questStart", questId: "ouroboros" },
        { op: "questObjective", questId: "ouroboros", objectiveId: "only" },
      ],
      looping,
    );
    expect(findQuest(state, "ouroboros")?.status).toBe("complete");
  });
});

describe("quest integrity validation", () => {
  it("accepts a well-formed area", () => {
    expect(validateAreaIntegrity(area())).toEqual([]);
  });

  it("catches starting a quest the area does not declare", () => {
    const a = area({ onEnterEffects: [{ op: "questStart", questId: "ghost-quest" }] });
    expect(validateAreaIntegrity(a).join(" ")).toMatch(/does not declare/);
  });

  it("catches an objective that does not exist", () => {
    const a = area({
      onEnterEffects: [
        { op: "questObjective", questId: "find-the-bell", objectiveId: "nope" },
      ],
    });
    expect(validateAreaIntegrity(a).join(" ")).toMatch(/no objective "nope"/);
  });

  it("catches duplicate quest and objective ids", () => {
    const a = area({
      quests: [
        {
          id: "dup",
          title: "A",
          summary: "s",
          objectives: [
            { id: "same", text: "one" },
            { id: "same", text: "two" },
          ],
        },
        { id: "dup", title: "B", summary: "s", objectives: [{ id: "x", text: "y" }] },
      ],
    });
    const problems = validateAreaIntegrity(a).join(" ");
    expect(problems).toMatch(/duplicate quest id "dup"/);
    expect(problems).toMatch(/duplicate objective id "same"/);
  });

  it("finds a bad quest reference hidden inside a check branch", () => {
    const a = area({
      entities: [
        {
          id: "crier",
          name: "Crier",
          description: "Loud.",
          role: "character",
          pos: { x: 1, y: 0 },
          interaction: {
            verb: "talk",
            lines: [{ speakerId: "crier", text: "Hear ye." }],
            choices: [
              {
                id: "press",
                label: "Press him",
                check: {
                  attribute: "wits",
                  difficulty: 4,
                  success: {
                    text: "He talks.",
                    effects: [{ op: "questStart", questId: "unregistered" }],
                  },
                  failure: { text: "He does not.", effects: [] },
                },
              },
            ],
          },
        },
      ],
    });
    expect(validateAreaIntegrity(a).join(" ")).toMatch(/unregistered/);
  });
});
