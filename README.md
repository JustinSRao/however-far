# Unwritten — The Game That Doesn't Exist

A game that is **created in real time, by AI, as you play it**.

There is no pre-written story, no fixed genre, no content database. Every playthrough begins
with the same small hand-crafted opening (the **Anchor**), and everything after that is
generated live by an AI Director in response to what the player does, says, and chooses —
while staying coherent as one complete game with a beginning, middle, and end.

When a player finishes their game, their universe can be **exported to a public library**,
where anyone can play it for free: the overarching world and story arc stay fixed, but the
moment-to-moment events, dialogue, and character interactions are regenerated live for each
new player.

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
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design: engine, Director, canon, art pipeline, export |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased plan from text prototype to public game library |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records (why things are the way they are) |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI coding agents working on this repo |

## Repository layout

```
packages/
  schema/      Zod schemas for the Scene DSL — the contract between Director and engine
apps/          (future) server (Director) and client (renderer)
docs/          Vision, architecture, roadmap, decision records
.claude/       Skills and instructions for AI-assisted development
```

## Status

Early foundation. The Scene DSL schema package exists; the engine, Director, and client are
next — see [docs/ROADMAP.md](docs/ROADMAP.md).

## Development

```sh
npm install
npm run typecheck   # typecheck all workspace packages
```
