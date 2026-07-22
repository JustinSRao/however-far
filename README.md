# Unwritten

A **top-down 2D pixel-art RPG created in real time, by AI, as you play it** — built on a
fixed, hand-authored story.

Two high-school sweethearts, next-door neighbors, meant for each other. One day, on the
walk home, the girl disappears. The player chooses a path: play as **her** — summoned to
a fantasy world for her dormant power, fighting to escape home — or as **him** — the only
person on Earth who remembers she ever existed. The story's skeleton
([docs/STORY.md](docs/STORY.md)) is fixed forever; *everything between its beats* — the
maps, characters, quests, encounters, dialogue, and art — is authored live by an AI
Director in response to how you play. The true ending is a cross-platform multiplayer
reunion between one player from each path.

> **Status:** mid-pivot (ADR-0009). The text-era prototype below is playable today; the
> Phaser RPG client, story skeleton integration, and Asset Studio are the current work
> (ROADMAP Phases 4–5). [PLAYTEST.md](PLAYTEST.md) covers the text-era prototype.

## The one rule that makes this work

> **The AI writes the game's *content*, never the game's *code*.**

At runtime the AI Director emits structured, schema-validated data (scenes, entities,
dialogue, choices, rules, art requests). A fixed, deterministic engine renders that data.
The game can therefore never "break" from a bad generation — invalid content is rejected
and regenerated, and the player only ever sees valid game states.

## Documentation map

| Doc | What it covers |
|---|---|
| [docs/VISION.md](docs/VISION.md) | The product vision, player experience, and non-negotiables |
| [docs/STORY.md](docs/STORY.md) | The fixed story skeleton — both paths, the Reunion, the rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design: engine, Director, canon, art pipeline, Asset Studio |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased plan from text prototype to the multiplayer Reunion |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records (why things are the way they are) |
| [PLAYTEST.md](PLAYTEST.md) | How to run the text-era prototype and what to look for |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI coding agents working on this repo |

## Repository layout

```
packages/
  schema/      Zod schemas — Scene DSL, profile, arc, canon, bundles (the contracts)
  engine/      Deterministic pure reducer over validated scenes (zero AI deps)
  content/     The Anchor — the only hand-authored scenes in the game
  director/    The AI Director: Profiler, Architect, Scene Writer, Checker, Canon
  library/     Persistence, universe bundle export/import, replay constraints
  art/         Pixel-art pipeline: provider seam, palette-lock post-processing, cache
apps/
  server/      HTTP API over the Director (holds the API key; the browser never does)
  web/         React client — the browser game
  play-cli/    Playable terminal client (new / resume / library / replay)
docs/          Vision, architecture, roadmap, decision records
.claude/       Skills and instructions for AI-assisted development
```

## Play it

```sh
npm install
cp .env.example .env                    # then put your OPENAI_API_KEY in it
```

`.env` is gitignored — the key never leaves your machine and is only ever read
server-side. The Director works against either OpenAI (default) or Anthropic; see
[ADR-0008](docs/DECISIONS.md).

In the browser — two terminals:

```sh
npm start -w @unwritten/server          # API on :3001 (the key lives here, not in the browser)
npm run dev -w @unwritten/web           # client on :5173, proxies /api to the server
```

Or in one terminal:

```sh
npm start -w @unwritten/play-cli                    # new playthrough
npm start -w @unwritten/play-cli -- --sessions      # list saves · --resume <id> to continue
npm start -w @unwritten/play-cli -- --library       # published universes · --replay <path>
```

Finish a game and you'll be offered to publish it to your local library, where it can be
replayed — same world and story arc, freshly generated moment-to-moment.

Full walkthrough, including what each step should look like: **[PLAYTEST.md](PLAYTEST.md)**.

## Development

```sh
npm install
npm run typecheck                    # all workspaces
npm test                             # all workspaces — no API key needed, the Director
                                     # is tested through a fake model client
npm run models -w @unwritten/director  # list models your key can actually reach
npm run eval -w @unwritten/play-cli    # live go/no-go demo (costs real tokens)
```
