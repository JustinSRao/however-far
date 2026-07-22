import type { StyleBible } from "@unwritten/schema";
import { getPixel, rgbaToHex, type RawImage } from "@unwritten/art";

/**
 * What the asset is for. Determines which checks apply:
 * - "tile": must be exactly gridSize × gridSize (tiles butt against each other).
 * - "sprite" | "portrait" | "item": an isolated subject on transparency —
 *   must have a transparent background and a sane opaque-coverage ratio.
 */
export type AssetKind = "tile" | "sprite" | "portrait" | "item";

export const ASSET_KINDS: readonly AssetKind[] = ["tile", "sprite", "portrait", "item"];

export interface Finding {
  level: "error" | "warn";
  check: string;
  message: string;
}

/** Fraction of visible pixels below/above which an isolated subject is suspicious. */
const MIN_OPAQUE_COVERAGE = 0.05;
const MAX_OPAQUE_COVERAGE = 0.95;

/**
 * Validate a (post-`processArt`) asset against a style bible. A raw candidate
 * straight from a provider is expected to FAIL these checks — normalize first,
 * validate after; the gate is on what enters the database, not on what models
 * produce.
 */
export function validateAsset(img: RawImage, style: StyleBible, kind: AssetKind): Finding[] {
  const findings: Finding[] = [];

  // Grid conformance: the larger dimension must equal the style's grid size
  // (that is exactly what `pixelize` guarantees); tiles must be square.
  if (kind === "tile") {
    if (img.width !== style.gridSize || img.height !== style.gridSize) {
      findings.push({
        level: "error",
        check: "grid",
        message: `tile must be exactly ${style.gridSize}x${style.gridSize}, got ${img.width}x${img.height}`,
      });
    }
  } else if (Math.max(img.width, img.height) !== style.gridSize) {
    findings.push({
      level: "error",
      check: "grid",
      message: `larger dimension must equal gridSize ${style.gridSize}, got ${img.width}x${img.height}`,
    });
  }

  // Palette compliance: every visible pixel is one of the bible's colors.
  const palette = new Set(style.colors.map((c) => c.toLowerCase()));
  const offenders = new Set<string>();
  let opaqueCount = 0;
  let transparentCount = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = getPixel(img, x, y);
      if (p.a === 0) {
        transparentCount++;
        continue;
      }
      opaqueCount++;
      const hex = rgbaToHex(p).toLowerCase();
      if (!palette.has(hex)) offenders.add(hex);
    }
  }
  if (offenders.size > 0) {
    const sample = [...offenders].slice(0, 5).join(", ");
    findings.push({
      level: "error",
      check: "palette",
      message: `${offenders.size} color(s) outside the "${style.paletteName}" palette (e.g. ${sample})`,
    });
  }

  // Transparency: subjects must be isolated; tiles must not leak holes.
  const total = img.width * img.height;
  if (kind === "tile") {
    if (transparentCount > 0 && transparentCount < total * 0.02) {
      findings.push({
        level: "warn",
        check: "transparency",
        message: `tile has ${transparentCount} stray transparent pixel(s) — intended?`,
      });
    }
  } else {
    if (transparentCount === 0) {
      findings.push({
        level: "error",
        check: "transparency",
        message: `${kind} has no transparent background — subject must be isolated (chroma-key before the gate)`,
      });
    }
    const coverage = opaqueCount / total;
    if (coverage < MIN_OPAQUE_COVERAGE) {
      findings.push({
        level: "warn",
        check: "coverage",
        message: `subject covers only ${(coverage * 100).toFixed(1)}% of the canvas — likely empty or lost in post-processing`,
      });
    } else if (coverage > MAX_OPAQUE_COVERAGE) {
      findings.push({
        level: "warn",
        check: "coverage",
        message: `subject covers ${(coverage * 100).toFixed(1)}% of the canvas — background probably not keyed out`,
      });
    }
  }

  return findings;
}

/**
 * Validate an animation as a set: every frame individually valid, and all
 * frames the same dimensions (a walk cycle that changes size flickers).
 */
export function validateFrameSet(
  frames: readonly RawImage[],
  style: StyleBible,
  kind: AssetKind
): Finding[] {
  const findings: Finding[] = [];
  if (frames.length === 0) {
    return [{ level: "error", check: "frames", message: "no frames given" }];
  }
  const first = frames[0] as RawImage;
  frames.forEach((f, i) => {
    if (f.width !== first.width || f.height !== first.height) {
      findings.push({
        level: "error",
        check: "frames",
        message: `frame ${i} is ${f.width}x${f.height}, expected ${first.width}x${first.height} (all frames must match)`,
      });
    }
    for (const finding of validateAsset(f, style, kind)) {
      findings.push({ ...finding, message: `frame ${i}: ${finding.message}` });
    }
  });
  return findings;
}
