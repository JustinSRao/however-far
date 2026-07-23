# Asset Studio

The one gate every asset passes on its way into the game (ADR-0011, CLAUDE.md
invariant 8). Two ways in, one pipeline:

- **Agent-operable CLI** — non-interactive, exit codes, `--json` output; Claude
  Code / Codex drive it conversationally ("create a village tileset" → clarifying
  questions → generate/import → validate → catalog). See the `asset-studio` skill.
- **Human-usable web UI** — the same gate behind a drag-and-drop page:

```sh
npm run studio -w @howeverfar/asset-studio     # http://localhost:5175
```

Pick a style bible (palette shown as swatches) and an asset kind, drop PNGs, and
each one runs the gate: normalize (pixelize → palette lock → outline) → validate
(grid, palette compliance, transparency, coverage). You get before/after previews
on a transparency checkerboard, PASS/FAIL findings, and a download of the
normalized PNG. A "validate only" toggle checks already-normalized assets without
reprocessing them.

## Commands (Phase 5 scaffold — validate/normalize are live)

```sh
# Run the mandatory pipeline (pixelize → palette quantize → outline) on raw art:
npm start -w @howeverfar/asset-studio -- normalize raw/*.png \
  --style styles/her-world.draft.json --out normalized/

# Check gate conformance (grid, palette, transparency, coverage):
npm start -w @howeverfar/asset-studio -- validate normalized/*.png \
  --style styles/her-world.draft.json --kind sprite --json
```

Exit codes: `0` pass, `1` error-level findings, `2` usage/IO problem.

Planned (see ROADMAP Phase 5): `import` (CC0 packs with license bookkeeping),
`preview` (contact-sheet PNG), `catalog` (the queryable asset database in
`packages/library`), sprite-as-data rendering, and the `gpt-image-2` provider.

## Style bibles

`styles/*.draft.json` are the per-path style bibles (her fantasy world / his real
world). **Drafts** — palettes are placeholders (her-world uses the free Sweetie-16
palette as a starting point) until the owner locks them at the start of art
production; locking is an ADR. All validation is against the target path's bible.
