import { describe, expect, it } from "vitest";
import { createImage, getPixel, parseColorMapping, recolor, setPixel } from "../src/index.js";

const A = { r: 0x1a, g: 0x1c, b: 0x2c, a: 255 };
const B = { r: 0xff, g: 0xcd, b: 0x75, a: 255 };

function twoColorImage() {
  const img = createImage(2, 1);
  setPixel(img, 0, 0, A);
  setPixel(img, 1, 0, B);
  return img;
}

describe("recolor", () => {
  it("swaps mapped colors and leaves the rest alone", () => {
    const out = recolor(twoColorImage(), new Map([["#1a1c2c", "#41a6f6"]]));
    expect(getPixel(out, 0, 0)).toEqual({ r: 0x41, g: 0xa6, b: 0xf6, a: 255 });
    expect(getPixel(out, 1, 0)).toEqual(B);
  });

  it("preserves alpha and skips transparent pixels", () => {
    const img = createImage(2, 1);
    setPixel(img, 0, 0, { ...A, a: 128 });
    const out = recolor(img, new Map([["#1a1c2c", "#ffffff"]]));
    expect(getPixel(out, 0, 0)).toEqual({ r: 255, g: 255, b: 255, a: 128 });
    expect(getPixel(out, 1, 0).a).toBe(0);
  });

  it("is case-insensitive on the mapping keys", () => {
    const out = recolor(twoColorImage(), new Map([["#1A1C2C", "#000000"]]));
    expect(getPixel(out, 0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
});

describe("parseColorMapping", () => {
  it("parses a comma-separated mapping", () => {
    expect(parseColorMapping("#1a1c2c=#333c57, #ffcd75=#41a6f6")).toEqual(
      new Map([
        ["#1a1c2c", "#333c57"],
        ["#ffcd75", "#41a6f6"],
      ]),
    );
  });

  it("rejects malformed pairs and empty mappings", () => {
    expect(() => parseColorMapping("#1a1c2c")).toThrow(/expected/);
    expect(() => parseColorMapping("#nothex=#333c57")).toThrow();
    expect(() => parseColorMapping("")).toThrow(/empty/);
  });
});
