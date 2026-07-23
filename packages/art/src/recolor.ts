import { createImage, getPixel, hexToRgba, rgbaToHex, setPixel, type RawImage } from "./image.js";

/**
 * Palette swaps — the cheap half of ADR-0011's "recolor/recombine variants".
 * One curated CC0 tileset becomes a dozen believable ones without another
 * download or another API call.
 *
 * Both functions are pure and deterministic, and neither is the gate:
 * `processArt` still runs afterwards, so a recolor that strays outside the
 * target style's palette gets snapped back and a validation error is
 * impossible to sneak past.
 */

/** Map specific colors to others; `#rrggbb` keys, case-insensitive. Unlisted colors pass through. */
export function recolor(img: RawImage, mapping: ReadonlyMap<string, string>): RawImage {
  const lookup = new Map<string, ReturnType<typeof hexToRgba>>();
  for (const [from, to] of mapping) {
    lookup.set(from.toLowerCase(), hexToRgba(to));
  }

  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = getPixel(img, x, y);
      if (p.a === 0) continue;
      const replacement = lookup.get(rgbaToHex(p).toLowerCase());
      if (replacement) setPixel(out, x, y, { ...replacement, a: p.a });
    }
  }
  return out;
}

/** Parse a CLI mapping string: "#1a1c2c=#333c57,#ffcd75=#41a6f6". */
export function parseColorMapping(spec: string): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const pair of spec.split(",")) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;
    const [from, to] = trimmed.split("=");
    if (!from || !to) throw new Error(`bad color mapping "${trimmed}" — expected #rrggbb=#rrggbb`);
    hexToRgba(from); // validates both sides, throws on malformed input
    hexToRgba(to);
    mapping.set(from.toLowerCase(), to.toLowerCase());
  }
  if (mapping.size === 0) throw new Error("empty color mapping");
  return mapping;
}
