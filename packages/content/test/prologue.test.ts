import { describe, expect, it } from "vitest";
import { validateAreaIntegrity } from "@unwritten/engine";
import {
  PATH_CHOICE_PORTALS,
  PROLOGUE_CANON,
  PROLOGUE_ENTRY_ID,
  getPrologueArea,
  getPrologueAreas,
  isPrologueArea,
} from "../src/index.js";

describe("the Prologue", () => {
  it("every area passes engine integrity validation", () => {
    for (const area of getPrologueAreas()) {
      expect(validateAreaIntegrity(area), area.id).toEqual([]);
    }
  });

  it("entry area exists and is the street", () => {
    expect(isPrologueArea(PROLOGUE_ENTRY_ID)).toBe(true);
    expect(getPrologueArea(PROLOGUE_ENTRY_ID)?.id).toBe("prologue-street");
  });

  it("all areas are on the shared path (the prologue precedes the choice)", () => {
    for (const area of getPrologueAreas()) {
      expect(area.path, area.id).toBe("shared");
    }
  });

  it("every 'area' transition points at another prologue area", () => {
    for (const area of getPrologueAreas()) {
      const transitions = [
        ...area.portals.map((p) => p.transition),
        ...area.entities.flatMap((e) => e.interaction?.choices.map((c) => c.transition) ?? []),
      ];
      for (const t of transitions) {
        if (t?.type === "area") {
          expect(isPrologueArea(t.areaId), `${area.id} -> ${t.areaId}`).toBe(true);
        }
      }
    }
  });

  it("the crossing offers exactly the two path-choice portals, both 'generate'", () => {
    const crossing = getPrologueArea("prologue-crossing");
    expect(crossing).toBeDefined();
    const ids = crossing!.portals.map((p) => p.id).sort();
    expect(ids).toEqual(["choose-her-path", "choose-his-path"]);
    for (const portal of crossing!.portals) {
      expect(portal.transition.type).toBe("generate");
      expect(PATH_CHOICE_PORTALS[portal.id]).toBeDefined();
    }
    expect(PATH_CHOICE_PORTALS["choose-her-path"]).toBe("her");
    expect(PATH_CHOICE_PORTALS["choose-his-path"]).toBe("his");
  });

  it("the prologue is walkable start to finish (street -> crossing)", () => {
    const order = [
      "prologue-street",
      "prologue-walk-home",
      "prologue-underpass",
      "prologue-vanishing",
      "prologue-crossing",
    ];
    for (let i = 0; i < order.length - 1; i++) {
      const area = getPrologueArea(order[i]!)!;
      const next = order[i + 1]!;
      const leads = area.portals.some(
        (p) => p.transition.type === "area" && p.transition.areaId === next,
      );
      expect(leads, `${order[i]} should lead to ${next}`).toBe(
        i < order.length - 2 ? true : leads, // crossing is reached from vanishing; last hop checked below
      );
    }
    const vanishing = getPrologueArea("prologue-vanishing")!;
    expect(
      vanishing.portals.some(
        (p) => p.transition.type === "area" && p.transition.areaId === "prologue-crossing",
      ),
    ).toBe(true);
  });

  it("Suzune appears before the vanishing and never after", () => {
    const withSuzune = ["prologue-street", "prologue-walk-home", "prologue-underpass"];
    const withoutSuzune = ["prologue-vanishing", "prologue-crossing"];
    for (const id of withSuzune) {
      expect(
        getPrologueArea(id)!.entities.some((e) => e.id === "suzune"),
        id,
      ).toBe(true);
    }
    for (const id of withoutSuzune) {
      expect(
        getPrologueArea(id)!.entities.some((e) => e.id === "suzune"),
        id,
      ).toBe(false);
    }
  });

  it("canon seeds are within schema limits", () => {
    for (const fact of PROLOGUE_CANON) {
      expect(fact.statement.length).toBeLessThanOrEqual(300);
      expect(fact.entities.length).toBeLessThanOrEqual(8);
    }
  });
});
