---
name: asset-studio
description: Use when creating, importing, validating, or cataloging game art — "make me a sprite/tileset/village", CC0 pack ingestion, sprite-as-data generation, gpt-image-2 assets, or work on the apps/asset-studio tool itself.
---

# Asset Studio — the one gate for all game art

Every asset enters the game through `apps/asset-studio` (ADR-0011, CLAUDE.md invariant
8). Three sources, one pipeline, one database — no exceptions, including "just this one
placeholder".

## When the user asks for art ("create a ___ sprite / texture / village")

You are the operator. The flow:

1. **Clarify before generating.** Ask what the user actually wants (AskUserQuestion or
   plain questions): subject details, which path/style bible it belongs to (her fantasy
   world / his real world), size class, variants, animation frames, and for compound
   requests ("a village") the composition — how many buildings, which types, humans or
   empty, etc.
2. **Pick the cheapest adequate source:**
   - Tiles, props, base characters → **CC0 library** first (recolor/recombine existing
     catalog entries before importing new packs).
   - Small bespoke sprites/icons → **sprite-as-data** (emit a palette-indexed grid
     yourself — you are a capable pixel artist at 16–32px when working in indexed
     palette JSON).
   - Hero assets (key art, portraits, unique monsters) → **gpt-image-2** (costs real
     money from the owner's OpenAI budget — mention it when you choose this).
3. **Run the gate:** normalize through `processArt` (grid → palette quantize → outline)
   and validate — dimensions, palette compliance, transparency where required, frame
   consistency for animations, license metadata for imports.
4. **Catalog it** (kind, tags, path/style, source, license) and show the user a preview
   (send the PNG file(s)).
5. Commit and push, like any other verified unit of work.

## Tool rules (for work on apps/asset-studio itself)

- **CLI-first, agent-operable:** every operation must work non-interactively with exit
  codes and `--json` output. The human web UI (`npm run studio`, port 5175 — owner
  directive: the Studio must be directly usable without an agent) is a layer over the
  same gate, never a separate pipeline; new gate features land in `packages/art` +
  `checks.ts` first, then surface in both the CLI and the UI.
- Validation and normalization live in `packages/art` (pure, tested); the Studio app is
  orchestration + IO. Don't duplicate pipeline logic in the app.
- The asset database is content-addressed; the catalog is the queryable index. An asset
  without catalog metadata (source, license, tags) is a validation failure.
- CC0 is not "no bookkeeping": record pack, author, URL, and license per imported asset.
- Never bypass `processArt` — a provider or importer that pre-processes its own output
  breaks the one-place-enforces-the-look guarantee.

## Style bibles

Per-path, authored at development time, locked (her fantasy world / his real world).
All validation is against the target path's bible: palette ≤ 32 colors, grid size,
outline rule. If an asset should exist in both worlds, it is two catalog entries, one
per bible.
