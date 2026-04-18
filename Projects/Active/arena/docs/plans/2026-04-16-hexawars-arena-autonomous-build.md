# Plan: HexaWars Arena — Autonomous 48-Hour Build

**Plan ID**: `hexawars-arena-v1`
**Created**: 2026-04-16T02:30:00-04:00
**Planner**: Claude Opus 4.6 (one-shot, no review gate — user override)
**Execution Window**: 2026-04-16T09:00:00-04:00 → 2026-04-18T09:00:00-04:00 (48h)
**Governance**: QorLogic S.H.I.E.L.D. cycle, advisory gates, META_LEDGER sealed

## Intent

Ship a playable HexaWars MVP — a single-game governed AI arena — in 48 hours via three-tier autonomous execution. One game (HexaWars), one gateway (BYOA contract), one spectator view, one deployable service. Every step is pre-planned with explicit decisions; no in-tick improvisation.

## Stack

| Tier | Model | Cadence | Ticks | Role |
|---|---|---|---|---|
| Builder | `vercel:minimax/minimax-m2.7` | 30 min | 96 | Execute pre-planned atomic tasks from `.continuum/queues/builder/` |
| Sentinel | `vercel:minimax/minimax-m2.7` | 15 min | 192 | Parametric health/drift checks |
| Review | `byok:f85af18a-f587-4762-a498-213eb3b0f0f7` (Codex GPT 5.4) | 2 hr | 24 | Audit last 4 builder ticks + 8 sentinel readings; inject remediation |

## Scope Boundaries

**In scope:**
- HexaWars game engine (hex grid, fog of war, deterministic combat, turn loop, victory conditions)
- Agent Action Contract + WebSocket gateway (internal BYOA)
- Two reference agents (random + greedy heuristic)
- Match orchestrator, event bus, metrics
- Spectator web UI (board, fog overlay, event log, score, agent status)
- Arena user service registered + deployed
- Page route on zo.space at `/arena/hexawars`
- Ledger-sealed release with Merkle proof

**Out of scope (explicitly deferred):**
- Bid Brawl, Synth Raid
- External BYOA (unauthenticated agents over public internet)
- Match replay database (in-memory only for v1)
- Leaderboards, agent analytics panel beyond basic metrics
- Mobile UI
- Social/competitive features

## Architecture

### Arena Service

```
arena/ (user service on port 4200)
├── src/
│   ├── server.ts                   # Bun + Hono, WebSocket upgrade
│   ├── router.ts                   # API dispatcher
│   ├── engine/
│   │   ├── coords.ts               # Cube hex coordinates
│   │   ├── board.ts                # Board state, init, mutations
│   │   ├── units.ts                # Unit types, placement, movement
│   │   ├── combat.ts               # Deterministic combat resolver
│   │   ├── fog.ts                  # Line-of-sight visibility
│   │   ├── turns.ts                # Turn state machine
│   │   ├── victory.ts              # Win condition check
│   │   └── match.ts                # Match lifecycle
│   ├── gateway/
│   │   ├── contract.ts             # Agent Action Contract types
│   │   ├── validator.ts            # Action validation
│   │   ├── session.ts              # Agent connection state
│   │   ├── ws.ts                   # WebSocket protocol
│   │   ├── timeout.ts              # Enforcement
│   │   └── budget.ts               # Token/time accounting
│   ├── agents/
│   │   ├── base.ts                 # Reference agent interface
│   │   ├── random.ts               # Uniform random policy
│   │   ├── greedy.ts               # Greedy expansion heuristic
│   │   └── runner.ts               # Agent→gateway connector
│   ├── orchestrator/
│   │   ├── matchmaker.ts           # Queue and pair agents
│   │   ├── events.ts               # Pub/sub bus
│   │   └── metrics.ts              # Match metrics
│   └── public/
│       ├── arena.html              # Spectator shell
│       ├── arena.css               # Styling
│       └── arena.js                # Board renderer, WS client
└── tests/
    ├── engine/*.test.ts            # Per-module unit tests
    ├── fairness/*.test.ts          # Symmetric-visibility, budget parity
    ├── determinism/*.test.ts       # Replay-identical hashes
    └── e2e.test.ts                 # Full match random vs greedy
```

### Zo.space Page Route

- `/arena/hexawars` — public React page, fetches match state and streams WS events from the arena service.

### Queue Layout

```
.continuum/queues/
├── manifest.yaml                   # Hash-chained queue index
├── builder/
│   ├── 001.yaml ... 096.yaml       # 96 atomic tasks
├── sentinel/
│   ├── template-T1-space-errors.yaml
│   ├── template-T2-continuum-health.yaml
│   ├── template-T3-neo4j-health.yaml
│   ├── template-T4-ledger-integrity.yaml
│   ├── template-T5-shadow-genome.yaml
│   ├── template-T6-git-drift.yaml
│   ├── template-T7-service-health.yaml
│   ├── template-T8-disk-memory.yaml
│   └── schedule.yaml               # Maps tick index → template
├── review/
│   └── template.yaml               # Parameterized by window
└── state/
    ├── builder-pointer.txt         # Next task index
    ├── sentinel-pointer.txt
    ├── review-pointer.txt
    └── status.jsonl                # Per-tick status log
```

## Phase Breakdown (96 Builder Tasks)

| Phase | Tasks | Focus |
|---|---|---|
| A. Foundation | 1–6 | Service scaffold, types, plan seal |
| B. Engine Core | 7–28 | Hex coords, board, units, combat, fog, turns, victory, determinism |
| C. Gateway | 29–40 | Action contract, validator, WS, sessions, timeouts, budgets |
| D. Reference Agents | 41–46 | Random, greedy, runner |
| E. Orchestrator | 47–54 | Matchmaker, events, metrics |
| F. Spectator UI | 55–68 | Board render, fog overlay, event log, score, WS client |
| G. Deploy | 69–74 | Service registration, zo.space page, smoke tests |
| H. Seal | 75–80 | Ledger entries, Merkle proof, substantiate, validate |
| I. Buffer/Stretch | 81–96 | Remediation slots + polish (animations, metrics panel) |

## Acceptance Tests (Release Gate)

A release is **substantiated** only if ALL pass:

1. `bun test` green across all engine, fairness, determinism, and gateway test suites.
2. Arena service responds `200` on `GET /health` and `GET /api/arena/status`.
3. `/arena/hexawars` page loads on `https://frostwulf.zo.space/arena/hexawars`.
4. End-to-end match: random vs greedy runs to completion in <60s, both agents make ≥10 moves, victory condition fires, final state has exactly one winner (or draw with symmetric territory).
5. Determinism: same seed + same action sequence produces byte-identical match hash across 3 replays.
6. Fairness: both players have equal initial visibility, equal starting units, equal turn budgets.
7. Ledger has sealed entries for plan, each phase completion, and final substantiate.
8. Merkle root published to META_LEDGER.md.

## Failure Handling

**Per-task:**
- Success: append ledger entry, mark task done, advance pointer.
- Failure: append shadow genome entry with severity 1–3. Skip dependent tasks. SMS escalation if severity ≥3.

**Per-phase:**
- If >50% of tasks in a phase fail, block subsequent phases until review tier injects remediation.

**Kill switch:**
- `touch /home/workspace/.continuum/queues/state/HALT` — all three agents read this at tick start and abort.

## Security / Sandbox Posture

- Arena service binds to `127.0.0.1:4200` (internal) or public via `register_user_service` with rate limits.
- Reference agents are internal — no external model calls from within the arena process.
- Agent actions validated against the contract schema; malformed actions return `invalid_action` and count toward budget.
- No direct filesystem writes from agent code paths. Engine is pure.

## Resolved Decisions (Pre-approved, no re-litigation)

| Decision | Value |
|---|---|
| Runtime | Bun |
| HTTP framework | Hono |
| Hex coordinate system | Cube coordinates (q, r, s where q+r+s=0) |
| Board size v1 | 9×9 hex grid |
| Fog of war algorithm | Line-of-sight, radius 3, blocked by mountain/forest |
| Combat resolution | Deterministic (no RNG): attacker_strength vs defender_strength + terrain bonus; ties favor defender |
| Turn model | Simultaneous resolution (both agents submit, engine resolves) |
| Turn time budget | 5 seconds per action |
| Match length cap | 50 turns |
| Victory conditions | (1) opponent eliminated, (2) 60% territory control for 3 consecutive turns, (3) turn cap → highest territory wins, tie → draw |
| Starting config | Each agent 3 units placed mirror-symmetric |
| Agent contract transport | WebSocket |
| Action schema | `{action: "move"|"attack"|"pass", from?: Coord, to?: Coord, confidence: number, metadata?: object}` |
| Test runner | `bun test` |
| Deployment | User service, port 4200, public HTTP mode |
| Ledger | Append-only to `docs/META_LEDGER.md`, Merkle-sealed at phase boundaries |
| UI framework | Vanilla React served via static page on zo.space (consistent with existing pattern) |
| Board render | SVG with cube→pixel projection |

## Ledger Seal

Initial plan hash will be appended to `docs/META_LEDGER.md` immediately after plan completion. Per-task ledger entries appended in the builder's success path. Final substantiate entry sealed by review tier at tick ~48.

---

**Status**: DRAFTED, EXECUTING
