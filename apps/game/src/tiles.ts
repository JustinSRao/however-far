import Phaser from "phaser";
import type { TileDef } from "@howeverfar/schema";
import { TILE } from "./PlayScene.js";

/**
 * Pixel-art ground without a fixed tileset.
 *
 * The World Writer chooses every tile's colour to fit an area's mood (and the
 * Reunion's seam palette), and areas are generated at runtime — so a bought
 * tileset would either throw that colour away or only cover the handful of
 * tags we thought to map. Instead each tile becomes a small generated texture:
 * a material pattern (grass blades, planks, grout, brick…) drawn in shades of
 * the tile's OWN colour. The pattern gives it pixel detail; the colour keeps
 * the Director's intent. Textures are cached by material+colour, so a whole
 * map costs a few canvases, not one per cell.
 */

export type Material =
  | "grass"
  | "water"
  | "wood"
  | "sand"
  | "dirt"
  | "brick"
  | "stone"
  | "hedge"
  | "generic";

/** artTag / name keyword → material. First match wins; order matters. */
const RULES: ReadonlyArray<readonly [RegExp, Material]> = [
  [/water|river|sea|tide|pond|lake|brine|surf|wave|moat|canal/, "water"],
  [/grass|lawn|meadow|field|fen|moss|garden|verge|pasture|clover/, "grass"],
  [/hedge|bush|foliage|tree|forest|leaf|shrub|thicket|vine|brush/, "hedge"],
  [/wood|plank|deck|board|dock|timber|floorboard|parquet/, "wood"],
  [/sand|beach|shore|desert|dune/, "sand"],
  [/brick|wall|rampart|castle|barrier|fence|chain|gate|pillar|column|stonewall/, "brick"],
  [/dirt|path|road|trail|gravel|earth|mud|track|lane|cobble/, "dirt"],
  [/stone|tile|floor|pavement|marble|flag|slab|concrete|granite|plaza|shrine/, "stone"],
];

export function materialFor(tile: TileDef): Material {
  const hay = `${tile.artTag ?? ""} ${tile.name}`.toLowerCase();
  for (const [re, mat] of RULES) if (re.test(hay)) return mat;
  // No keyword: a wall-ish (unwalkable) tile reads best as masonry, ground as
  // plain textured earth.
  return tile.walkable ? "generic" : "brick";
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}
function parse(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
/** Lighten (amt>0) or darken (amt<0) toward white/black, amt in -1..1. */
function shade({ r, g, b }: Rgb, amt: number): string {
  const mix = (c: number) =>
    Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** Deterministic PRNG so a given material+colour always draws identically. */
function makeRng(seedStr: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function draw(ctx: Ctx, material: Material, color: string, S: number): void {
  const base = parse(color);
  const rng = makeRng(`${material}:${color}`);
  const px = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };

  // Ground colour first.
  px(0, 0, S, S, color);

  switch (material) {
    case "grass": {
      for (let i = 0; i < 120; i++) {
        const x = Math.floor(rng() * S);
        const y = Math.floor(rng() * S);
        const up = rng();
        px(x, y, 1, 1 + Math.floor(rng() * 2), shade(base, up < 0.5 ? -0.22 : 0.16));
      }
      break;
    }
    case "hedge": {
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rng() * S);
        const y = Math.floor(rng() * S);
        const s = 2 + Math.floor(rng() * 3);
        px(x, y, s, s, shade(base, rng() < 0.5 ? -0.28 : 0.2));
      }
      break;
    }
    case "water": {
      for (let y = 2; y < S; y += 4) {
        const off = Math.floor(rng() * 4);
        for (let x = 0; x < S; x += 2) {
          const wob = Math.sin((x + off) * 0.6) > 0 ? 0 : 1;
          px(x, y + wob, 2, 1, shade(base, rng() < 0.5 ? 0.22 : -0.1));
        }
      }
      break;
    }
    case "wood": {
      const plank = 12;
      for (let y = 0; y < S; y += plank) {
        px(0, y, S, plank - 1, shade(base, (rng() - 0.5) * 0.14));
        px(0, y + plank - 1, S, 1, shade(base, -0.4)); // seam
        for (let g = 0; g < 6; g++) {
          const gx = Math.floor(rng() * S);
          const gy = y + 2 + Math.floor(rng() * (plank - 4));
          px(gx, gy, 3 + Math.floor(rng() * 6), 1, shade(base, -0.16));
        }
      }
      break;
    }
    case "sand": {
      for (let i = 0; i < 90; i++) {
        px(Math.floor(rng() * S), Math.floor(rng() * S), 1, 1, shade(base, rng() < 0.5 ? -0.12 : 0.14));
      }
      break;
    }
    case "dirt": {
      for (let i = 0; i < 70; i++) {
        px(Math.floor(rng() * S), Math.floor(rng() * S), 1, 1, shade(base, rng() < 0.5 ? -0.2 : 0.12));
      }
      for (let i = 0; i < 6; i++) {
        px(Math.floor(rng() * S), Math.floor(rng() * S), 2, 2, shade(base, -0.28));
      }
      break;
    }
    case "brick": {
      const bw = 16;
      const bh = 8;
      px(0, 0, S, S, shade(base, -0.45)); // mortar
      for (let row = 0, y = 0; y < S; y += bh, row++) {
        const off = row % 2 ? -bw / 2 : 0;
        for (let x = off; x < S; x += bw) {
          px(x + 1, y + 1, bw - 2, bh - 2, shade(base, (rng() - 0.5) * 0.14));
          px(x + 1, y + 1, bw - 2, 1, shade(base, 0.18)); // top highlight
        }
      }
      break;
    }
    case "stone": {
      const b = 16;
      px(0, 0, S, S, shade(base, -0.35)); // grout
      for (let y = 0; y < S; y += b) {
        for (let x = 0; x < S; x += b) {
          px(x + 1, y + 1, b - 2, b - 2, shade(base, (rng() - 0.5) * 0.18));
          px(x + 1, y + 1, b - 2, 1, shade(base, 0.14));
        }
      }
      break;
    }
    case "generic": {
      for (let i = 0; i < 40; i++) {
        px(Math.floor(rng() * S), Math.floor(rng() * S), 1, 1, shade(base, rng() < 0.5 ? -0.1 : 0.1));
      }
      break;
    }
  }

  // A soft top-left highlight / bottom-right shade gives every tile a hint of
  // depth so the grid does not read as dead flat. Walls get a stronger bevel.
  const bevel = material === "brick" ? 0.22 : 0.1;
  ctx.globalAlpha = bevel;
  px(0, 0, S, 1, "#ffffff");
  px(0, 0, 1, S, "#ffffff");
  px(0, S - 1, S, 1, "#000000");
  px(S - 1, 0, 1, S, "#000000");
  ctx.globalAlpha = 1;
}

/** Get (or lazily create) the texture key for a tile, then use with add.image. */
export function ensureTileTexture(scene: Phaser.Scene, tile: TileDef): string {
  const material = materialFor(tile);
  const key = `tile:${material}:${tile.color}`;
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, TILE, TILE);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return key;
  draw(ctx, material, tile.color, TILE);
  canvas.refresh();
  return key;
}
