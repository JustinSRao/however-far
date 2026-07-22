import { describe, expect, it } from "vitest";
import type { StyleBible } from "@unwritten/schema";
import { createImage, hexToRgba, setPixel, type RawImage } from "@unwritten/art";
import { validateAsset, validateFrameSet } from "./checks.js";

const style: StyleBible = {
  paletteName: "test",
  colors: ["#000000", "#ffffff", "#ff0000", "#00ff00"],
  gridSize: 16,
  outline: "none",
  perspective: "top-down",
  keywords: [],
};

function filled(width: number, height: number, hex: string): RawImage {
  const img = createImage(width, height);
  const c = hexToRgba(hex);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(img, x, y, c);
  return img;
}

/** A 16x16 sprite: red 8x8 subject centered on transparency. */
function spriteFixture(subjectHex = "#ff0000"): RawImage {
  const img = createImage(16, 16);
  const c = hexToRgba(subjectHex);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) setPixel(img, x, y, c);
  return img;
}

describe("validateAsset", () => {
  it("passes a conforming tile", () => {
    expect(validateAsset(filled(16, 16, "#00ff00"), style, "tile")).toEqual([]);
  });

  it("rejects a tile that is not gridSize-square", () => {
    const findings = validateAsset(filled(16, 8, "#00ff00"), style, "tile");
    expect(findings.some((f) => f.check === "grid" && f.level === "error")).toBe(true);
  });

  it("passes a conforming sprite", () => {
    expect(validateAsset(spriteFixture(), style, "sprite")).toEqual([]);
  });

  it("rejects off-palette colors on visible pixels", () => {
    const findings = validateAsset(spriteFixture("#123456"), style, "sprite");
    expect(findings.some((f) => f.check === "palette" && f.level === "error")).toBe(true);
  });

  it("rejects a sprite with no transparency", () => {
    const findings = validateAsset(filled(16, 16, "#ff0000"), style, "sprite");
    expect(findings.some((f) => f.check === "transparency" && f.level === "error")).toBe(true);
  });

  it("rejects wrong grid dimension for sprites", () => {
    const img = createImage(32, 32);
    setPixel(img, 16, 16, hexToRgba("#ff0000"));
    const findings = validateAsset(img, style, "sprite");
    expect(findings.some((f) => f.check === "grid" && f.level === "error")).toBe(true);
  });
});

describe("validateFrameSet", () => {
  it("passes matching valid frames", () => {
    expect(validateFrameSet([spriteFixture(), spriteFixture()], style, "sprite")).toEqual([]);
  });

  it("rejects mismatched frame dimensions", () => {
    const small = createImage(8, 16);
    setPixel(small, 4, 4, hexToRgba("#ff0000"));
    const findings = validateFrameSet([spriteFixture(), small], style, "sprite");
    expect(findings.some((f) => f.check === "frames" && f.level === "error")).toBe(true);
  });

  it("rejects an empty set", () => {
    expect(validateFrameSet([], style, "sprite")[0]?.check).toBe("frames");
  });
});
