import { z } from "zod";
import { HexColor, StoryPath } from "./area.js";
import { Slug } from "./scene.js";

/**
 * Asset database records (ADR-0011, Phase 5).
 *
 * Every image that enters the game passes the Asset Studio gate and lands in
 * the content-addressed asset database with one of these catalog records.
 * An asset without catalog metadata (source, license, tags) is a validation
 * failure — CC0 is not "no bookkeeping".
 */
export const ASSET_RECORD_VERSION = 1;

/** What the asset is for; determines which gate checks apply (checks.ts). */
export const AssetKind = z.enum(["tile", "sprite", "portrait", "item"]);
export type AssetKind = z.infer<typeof AssetKind>;

/** SHA-256 content hash of a gated PNG — an asset's identity in the DB. */
export const AssetHash = z.string().regex(/^[0-9a-f]{64}$/, "must be a sha256 hex digest");
export type AssetHash = z.infer<typeof AssetHash>;

/**
 * Where the pixels came from. The three sources of ADR-0011 plus hand-drawn
 * one-offs; imports carry full attribution even when the license doesn't
 * require it.
 */
export const AssetSource = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cc0"),
    pack: z.string().min(1).max(120),
    author: z.string().min(1).max(120),
    url: z.string().min(1).max(300),
    license: z.string().min(1).max(60),
  }),
  z.object({
    type: z.literal("sprite-data"),
    /** Who emitted the grid: a model name, or "hand" for agent/human-authored. */
    emittedBy: z.string().min(1).max(60),
  }),
  z.object({ type: z.literal("generated"), model: z.string().min(1).max(60) }),
  z.object({ type: z.literal("hand"), author: z.string().min(1).max(120).optional() }),
]);
export type AssetSource = z.infer<typeof AssetSource>;

export const AssetRecord = z.object({
  recordVersion: z.literal(ASSET_RECORD_VERSION),
  /** Content hash of the first frame's PNG bytes (post-gate). */
  id: AssetHash,
  /** Catalog handle: what areas bind to via artTag, unique per (path, kind). */
  name: Slug,
  kind: AssetKind,
  /** Which path's style bible gated this asset (two worlds = two entries). */
  path: StoryPath,
  /** The style bible's paletteName at gate time. */
  styleName: z.string().min(1).max(60),
  width: z.number().int().min(1).max(64),
  height: z.number().int().min(1).max(64),
  tags: z.array(z.string().min(1).max(40)).max(16).default([]),
  /**
   * Ordered content hashes of the frame PNGs; length 1 for static art,
   * more for animations (walk cycles, effects) validated as a set.
   */
  frames: z.array(AssetHash).min(1).max(64),
  /** Playback speed for multi-frame assets. */
  frameMs: z.number().int().min(20).max(2000).optional(),
  source: AssetSource,
  /**
   * The asset this one was recolored/restyled from. The `source` is carried
   * over unchanged rather than replaced: a recolored Kenney tile is still
   * Kenney's CC0 work and must keep its attribution, so provenance chains
   * instead of being overwritten.
   */
  derivedFrom: AssetHash.optional(),
  createdAt: z.string().datetime(),
});
export type AssetRecord = z.infer<typeof AssetRecord>;

/**
 * Sprite-as-data (ADR-0011 source #2): a palette-indexed pixel grid small
 * enough for a model to emit as JSON, rendered to PNG deterministically by
 * `packages/art`. Bespoke sprites at the price of tokens already being paid.
 *
 * Grid encoding: one string per row, top to bottom, one character per pixel.
 * "." is transparent; palette indices are base-32 digits ("0"–"9" then
 * "a"–"v"), so index 10 is "a" — matching the ≤32-color palette limit.
 */
export const SPRITE_DATA_VERSION = 1;

const ROW_CHARS = /^[.0-9a-v]+$/;

export const SpriteData = z
  .object({
    version: z.literal(SPRITE_DATA_VERSION),
    name: Slug,
    /** Colors the grid indexes into. Must stay within the target style bible. */
    palette: z.array(HexColor).min(1).max(32),
    rows: z.array(z.string().regex(ROW_CHARS, 'pixels are "." or base-32 palette indices')).min(1).max(64),
  })
  .superRefine((sprite, ctx) => {
    const width = sprite.rows[0]?.length ?? 0;
    if (width > 64) {
      ctx.addIssue({ code: "custom", path: ["rows"], message: "rows wider than 64 pixels" });
    }
    sprite.rows.forEach((row, y) => {
      if (row.length !== width) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", y],
          message: `row ${y} is ${row.length} px wide, expected ${width} (all rows must match)`,
        });
      }
      for (const ch of row) {
        if (ch === ".") continue;
        const index = parseInt(ch, 32);
        if (index >= sprite.palette.length) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", y],
            message: `row ${y} uses palette index ${index} but the palette has ${sprite.palette.length} color(s)`,
          });
          break;
        }
      }
    });
  });
export type SpriteData = z.infer<typeof SpriteData>;
