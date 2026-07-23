import { describe, expect, it } from "vitest";
import { createImage, getPixel, isBlank, setPixel, sliceSheet } from "../src/index.js";

/** A 4x4 sheet of four 2x2 cells, each filled with its own index in the red channel. */
function sheet() {
  const img = createImage(4, 4);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const value = row * 2 + col + 1;
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          setPixel(img, col * 2 + x, row * 2 + y, { r: value, g: 0, b: 0, a: 255 });
        }
      }
    }
  }
  return img;
}

describe("sliceSheet", () => {
  it("cuts a packed sheet in reading order", () => {
    const cells = sliceSheet(sheet(), { cellWidth: 2, cellHeight: 2 });
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(cells.map((c) => getPixel(c.image, 0, 0).r)).toEqual([1, 2, 3, 4]);
    expect(cells[3]).toMatchObject({ col: 1, row: 1 });
  });

  it("honors spacing and margin", () => {
    // 1px margin, 1px between cells: two 2x2 cells need 1+2+1+2 = 6 px.
    const spaced = createImage(6, 3);
    setPixel(spaced, 1, 1, { r: 9, g: 0, b: 0, a: 255 });
    setPixel(spaced, 4, 1, { r: 8, g: 0, b: 0, a: 255 });
    const cells = sliceSheet(spaced, { cellWidth: 2, cellHeight: 2, spacing: 1, margin: 1 });
    expect(cells).toHaveLength(2);
    expect(getPixel(cells[0]!.image, 0, 0).r).toBe(9);
    expect(getPixel(cells[1]!.image, 0, 0).r).toBe(8);
  });

  it("ignores a partial trailing cell rather than reading out of bounds", () => {
    const cells = sliceSheet(createImage(5, 2), { cellWidth: 2, cellHeight: 2 });
    expect(cells).toHaveLength(2); // the leftover 1px column is dropped
  });

  it("rejects cells that cannot fit", () => {
    expect(() => sliceSheet(createImage(4, 4), { cellWidth: 8, cellHeight: 8 })).toThrow(RangeError);
  });
});

describe("isBlank", () => {
  it("detects empty grid cells", () => {
    expect(isBlank(createImage(3, 3))).toBe(true);
    const one = createImage(3, 3);
    setPixel(one, 1, 1, { r: 0, g: 0, b: 0, a: 1 });
    expect(isBlank(one)).toBe(false);
  });
});
