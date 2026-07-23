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
     catalog entries before importing new packs). **CC0 only** — owner directive. Read
     the pack's bundled `License.txt` before ingesting anything; a page saying "free"
     is not a license. Anything share-alike or attribution-required is out of scope.
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

## The commands you drive

Run from `apps/asset-studio` (`npm start -w @howeverfar/asset-studio -- <command>`).
Every one takes `--json` and exits 0 pass / 1 findings / 2 usage.

| Command | What it does |
|---|---|
| `validate <png...> --style --kind [--frames]` | Check gate-readiness; `--frames` validates one animation as a set |
| `slice <sheet.png...> --cell <n\|WxH> --out` | Cut a packed spritesheet into cells (`--spacing`, `--margin`); how most free packs ship |
| `normalize <png...> --style --out` | Run `processArt` only, write the gated PNGs |
| `import <png...> --style --kind --path --source` | Normalize + validate + land in the database. `--frames` makes the inputs one animation (`--frame-ms`) |
| `sprite <spec.json...> --style --kind --path [--import]` | Render sprite-as-data grids through the gate |
| `generate --subject --mood --style --kind --path --yes` | gpt-image-2. **Spends money**, refuses without `--yes` |
| `variant <name> --name <new> [--map] [--style --path]` | Recolor and/or restyle a cataloged asset into a new entry |
| `catalog [--kind --path --tag --name --source]` | Query the database |
| `preview [<name>...] [--all] --out [--scale]` | Upscaled PNGs for human eyes |
| `credits` | The shipping attribution list, built from the catalog |

Add `--db <dir>` to work against a scratch database instead of
`HOWEVERFAR_HOME/assets` — do that when experimenting, so you never pollute the
owner's real catalog.

**Writing sprite-as-data.** One string per row, `.` transparent, base-32 digits
indexing the spec's own palette (`0`–`9` then `a`–`v`). Keep the palette inside the
target style bible's colors — the gate will snap strays, but a snapped color is a
color you didn't choose. Texture from modular arithmetic (`(x*5+y*11)%17`) produces
visible diagonal banding; use an integer hash of `(x, y)` when you want organic
noise. Committed specs live in `apps/asset-studio/sprites/<path>-world/<kind>s/` and
`npm run seed` rebuilds the database from them.

**Always look at what you made.** Run `preview` and read the PNG back before telling
the user it is done — validation proves it is legal, not that it looks like anything.

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
  **Blobs** dedup by content hash — that is the point. **Catalog records** are filed by
  logical identity (`path.kind.name`), because the same pixels legitimately appear as
  two entries (one asset in both worlds), and hashing the record file would let the
  second put destroy the first.
- CC0 is not "no bookkeeping": record pack, author, URL, and license per imported asset.
  A `variant` keeps its parent's `source` and records `derivedFrom`, so attribution
  chains instead of being overwritten — never "re-source" a derived asset as your own.
- Never bypass `processArt` — a provider or importer that pre-processes its own output
  breaks the one-place-enforces-the-look guarantee. The `gpt-image-2` provider returns
  raw pixels (chroma-keyed, not post-processed) for exactly this reason.
- **Every paid call lands in the cost ledger** (ADR-0018): `generate` is the only
  command that spends, it records before any failure path returns, and the per-image
  price in `IMAGE_PRICING` is flagged UNVERIFIED — image counts are the ground truth.

## Style bibles

Per-path, authored at development time, locked (her fantasy world / his real world).
All validation is against the target path's bible: palette ≤ 32 colors, grid size,
outline rule. If an asset should exist in both worlds, it is two catalog entries, one
per bible.

**`keywords` is the world's constant visual identity, not its mood.** Every generated
image gets the whole keyword list, so a keyword pins that trait on *all* art forever.
Per-asset feeling belongs in `ArtRequest.mood`, which the prompt carries separately.
This matters because neither path sits at one emotional end: STORY.md's tone
discipline is "Path A may get dark, but it is an adventure; Path B may have warmth,
but it is a drama." A bible that says "storybook" or "melancholy" quietly overrides
that for every asset — which is exactly the drift that had to be corrected once
already. Keep bibles to setting, palette register, rendering style; let mood swing.
