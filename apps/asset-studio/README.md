# Asset Studio

The one gate every asset passes on its way into the game (ADR-0011, CLAUDE.md
invariant 8). CLI-first and agent-operable: non-interactive, exit codes, `--json`
output — Claude Code / Codex drive it conversationally ("create a village tileset"
→ clarifying questions → generate/import → validate → catalog). See the
`asset-studio` skill for the operator playbook.

## Commands (Phase 5 scaffold — validate/normalize are live)

```sh
# Run the mandatory pipeline (pixelize → palette quantize → outline) on raw art:
npm start -w @unwritten/asset-studio -- normalize raw/*.png \
  --style styles/her-world.draft.json --out normalized/

# Check gate conformance (grid, palette, transparency, coverage):
npm start -w @unwritten/asset-studio -- validate normalized/*.png \
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
