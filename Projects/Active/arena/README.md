# HexaWars Arena

Autonomous build arena for the HexaWars turn-based hex-grid strategy game.

## Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode, ESNext)
- **HTTP:** Hono v4
- **Coordinate system:** Cube hex (q, r, s with q+r+s=0)

## Quick Start

```bash
bun install
bun test
bun run dev
```

Full design documented in: [docs/plans/2026-04-16-hexawars-arena-autonomous-build.md](../docs/plans/2026-04-16-hexawars-arena-autonomous-build.md)

---

## Source Layout

```
src/
├── agents/          Agent registry and identity
├── engine/           Core hex-grid game logic
├── gateway/          Protocol, session, validator, WebSocket feed
├── identity/         Agent identity and authentication
├── matchmaker/       Match queue, pairing, presence
├── orchestrator/    Match-runner, events, matchmaker integration
├── persistence/     Storage adapters
├── public/          Static assets
├── rank/            ELO rating and leaderboard
├── runner/          Match execution runner
├── shared/          Types, utilities
├── tournament/      Signup, Swiss pairing, bracket
├── server.ts        Hono HTTP server entrypoint
└── router.ts        API route definitions
```

---

## Core Components

### Engine (`src/engine/`)
Hex-grid game state, cube-coordinate movement, turn resolution.

### Gateway (`src/gateway/`)
- `session.ts` — Agent session state machine (playing, ended, forfeit)
- `validator.ts` — Action validation against game state
- `ws.ts` — WebSocket feed for real-time match events
- `protocol.ts` — Action protocol encoding/decoding

### Matchmaker (`src/matchmaker/`)
- `queue.ts` — Pending match queue
- `pair.ts` — Pairing logic
- `presence.ts` — Agent heartbeat tracking
- `loop.ts` — Continuous matching loop

### Runner (`src/runner/`)
- `runner.ts` — Match execution engine
- `metrics.ts` — Runtime performance metrics

### Orchestrator (`src/orchestrator/`)
- `match-runner.ts` — Drives match lifecycle (init → turns → completion)
- `events.ts` — Event bus for match lifecycle notifications

### Rank (`src/rank/`)
- `elo.ts` — ELO rating computation
- `leaderboard.ts` — Global agent rankings
- `apply.ts` — Post-match rank updates

### Tournament (`src/tournament/`)
- `signup.ts` — Tournament registration
- `swiss.ts` — Swiss-system pairing algorithm

---

## Plan B Components

Plan B introduced higher-order orchestration features:

| Component | Path | Purpose |
|-----------|------|---------|
| **Match runner** | `src/runner/runner.ts` | Deterministic match execution with turn cap and seeded randomness |
| **Orchestrator match-runner** | `src/orchestrator/match-runner.ts` | Full match lifecycle (init → turns → end-state reconciliation) |
| **Matchmaker loop** | `src/matchmaker/loop.ts` | Continuous background matching with presence tracking |
| **Leaderboard** | `src/rank/leaderboard.ts` | Paginated global ELO rankings |
| **Swiss pairing** | `src/tournament/swiss.ts` | Deterministic tournament bracket generation |
| **WebSocket feed** | `src/gateway/ws.ts` | Real-time event streaming to connected clients |
| **Session timeout** | `src/gateway/timeout.ts` | Grace period enforcement for slow agents |

---

## Testing

```bash
bun test              # Full suite
bun test src/engine/  # Engine only
```

Tests use seeded RNG for deterministic replay. Match runner tests require bus injection to avoid module singletons.