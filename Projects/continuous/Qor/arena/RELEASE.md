# HexaWars Arena — Release 0.1.0

**Version:** 0.1.0  
**Date:** 2026-04-17  
**Type:** Initial Public Release (alpha)

---

## What Works

### Core Game Engine
- **Hex grid board** — cube-coordinate system (q, r, s) with q+r+s=0 invariant enforced; board sizes from tiny (7 hexes) to huge (61 hexes)
- **Unit system** — Ground, Air, Naval unit types with movement costs per terrain; movement validation against terrain and zone-of-control
- **Combat resolution** — deterministic combat with attacker/defender strength, terrain modifiers, and outcome probabilities (A:2 D:1 or retreat)
- **Victory conditions** — dominance (50%+ territory), elimination (all enemy units destroyed), timeout (turn cap reached with no winner)
- **Fog of war** — per-session visibility matrix; units only visible when in same revealed hex or adjacent to owned territory
- **Turn management** — configurable turn cap (default 50); automatic pass-through when no actions available

### Agents
- **Random agent** — selects random legal action per turn
- **Greedy agent** — maximizes immediate territory gain; prefers movement over attack when territory is the metric
- **Base agent** — extensible skeleton (`BaseAgent`) with `selectAction(game): Action` interface

### Match Orchestration
- **MatchRunner** — drives full match lifecycle: init → turns → end-state; emits `match-start`, `turn-start`, `turn-end`, `match-end` events on an event bus
- **Matchmaker** — assigns agents to sessions, resolves which agents play which match
- **Metrics** — captures per-match stats: turns elapsed, actions total, unit counts, territory ownership timeline

### Gateway & Protocol
- **AgentSession** — finite state machine (waiting → playing → ended/forfeit); enforces valid transition guards
- **WS transport** — Hono WebSocket endpoint for real-time match streaming; JSON message protocol
- **Validator** — action schema enforcement; cube-coordinate bounds check; pass-action acceptance

### API Server
- **Hono server** (`src/server.ts`) — serves arena HTTP + WS routes
- **Static assets** — CSS/JS for the web UI served from `src/static/`
- **CORS enabled** — cross-origin requests permitted for local development

### Web UI
- **Hex grid renderer** — SVG hex rendering with cube-coordinate grid math; zoom and pan
- **Agent status panel** — shows connected agents, their types, and session assignments
- **Score display** — real-time territory count and unit totals per agent
- **Fog overlay** — revealed vs. hidden hexes visually distinguished
- **Event log** — timestamped stream of match events (turns, attacks, movements)

### Testing
- Board geometry, movement, combat, fog, territory, session state, match-runner, determinism, and validator test suites

---

## Known Limitations

| Area | Limitation |
|------|-----------|
| **Persistence** | No database; match state lives in memory only; restart wipes all state |
| **Auth** | No authentication on WS or HTTP endpoints; any client can join or issue actions |
| **Replay** | Replay file format defined but match-export/replay-load not yet wired end-to-end |
| **Spectator mode** | WS streams only to session participants; no true read-only spectator audience |
| **Agent多样性** | Only 3 agents shipped (random, greedy, base-skeleton); no trained or learned agents |
| **Map editor** | Board size is set at session creation; no dynamic map import |
| **Timeouts** | Idle timeout on WS is permissive; a misbehaving client can block a session's event loop |
| **Error recovery** | Match-runner event bus has no dead-letter queue; dropped events are silently lost |

---

## Rollback Instructions

If arena v0.1.0 must be reverted to a prior state:

```bash
# Identify the last known-good commit
git log --oneline arena/ | head -5

# Roll back arena to that commit
git checkout <good-sha> -- arena/

# Restart the arena server
# (if running via Zo service, use the Zo dashboard to restart the service)
```

**Rollback window:** Because match state is in-memory only, rollback restores code and static assets but does NOT restore interrupted in-progress matches. Active sessions will need to be restarted by reconnecting agents.

**Prior release tag:** There is no prior release tag (this is the initial release). The git history is the rollback anchor.

---

## Component Versions

| Component | Version |
|-----------|---------|
| arena | 0.1.0 |
| hono | 4.6.x |
| bun | latest |
| typescript | 5.6.x |

---

*HexaWars Arena — autonomous build scaffold, Qor/Forge pipeline*
