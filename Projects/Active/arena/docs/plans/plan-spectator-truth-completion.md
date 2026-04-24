# Plan: Spectator Truth Completion

**Plan ID**: plan-spectator-truth-v1
**Author**: Victor (via /qor-plan)
**Date**: 2026-04-24
**Status**: DRAFT → AUDIT
**Scope**: Canonical live projection producer + MatchRuntime accessor
**Blocks**: demo replay fidelity, spectator-ws real-time push, UI board rendering

---

## Problem

`projectLiveSpectatorMatch()` in `src/projection/public-match.ts` invents most of the public state:

- `board: []` — empty cells
- `units: []` — empty units
- `territories: { A: 0, B: 0 }` — zero territories
- `agents[].modelId: "unknown"` — unknown models
- `agents[].totalMs/totalActions/invalidCount: 0` — zero metrics
- `pressure: 0` — flat pressure

The UI cannot render anything useful from this. The demo replay works only because `demo-replay.js` hardcodes the data client-side.

## Root Cause

There is no runtime path from `MatchState` (which has real board/units/territories) to `PublicProjectionInput`. The match-runner owns live `MatchState` but never publishes it to the projection layer.

## Solution

1. Add `getSpectatorSnapshot()` accessor to match-runner
2. Create `src/projection/live-match.ts` — runtime-to-public adapter
3. Wire spectator-ws through the adapter
4. Verify demo replay still works unchanged

---

## Phase 1: MatchRuntime Spectator Accessor

### 1.1 Add snapshot method to match-runner

**File**: `src/orchestrator/match-runner.ts`

Add a new export:

```typescript
export interface SpectatorSnapshot {
  matchId: string;
  state: MatchState;
  budgetA: AgentRoundBudget;
  budgetB: AgentRoundBudget;
  round: number;
  agents: {
    A: { operator: string; modelId: string; totalMs: number; totalActions: number; invalidCount: number };
    B: { operator: string; modelId: string; totalMs: number; totalActions: number; invalidCount: number };
  };
  events: EngineEvent[];
}
```

The `runMatch()` function already has all of this in local scope. Refactor:

- Extract a `MatchRuntime` class that holds `state`, `budgetA`, `budgetB`, `round`, `agents`, `events` as instance fields
- `getSpectatorSnapshot(): SpectatorSnapshot` returns a frozen copy
- Keep `runMatch()` as a thin wrapper that creates a `MatchRuntime` and calls `run()` on it

### 1.2 Register active runtimes

**File**: `src/orchestrator/match-runner.ts`

Add a `Map<string, MatchRuntime>` registry:

```typescript
const activeRuntimes = new Map<string, MatchRuntime>();

export function getActiveRuntime(matchId: string): MatchRuntime | undefined {
  return activeRuntimes.get(matchId);
}
```

`runMatch()` registers on creation, deregisters on completion.

### 1.3 Tests

- `src/orchestrator/match-runner.test.ts`
- Test: `getSpectatorSnapshot()` returns correct shape after round 0
- Test: snapshot reflects state after 3 rounds
- Test: registry returns undefined for unknown matchId
- Test: registry deregisters after match ends

---

## Phase 2: Live Projection Adapter

### 2.1 Create `src/projection/live-match.ts`

**File**: `src/projection/live-match.ts`

```typescript
import type { SpectatorSnapshot } from "../orchestrator/match-runner.ts";
import type { PublicProjectionInput, PublicAgentSnapshot, PublicBoardCell, PublicBoardUnit } from "../shared/public-match.ts";
import type { EngineEvent, HexCell } from "../shared/types.ts";

export function adaptSpectatorSnapshot(snapshot: SpectatorSnapshot): PublicProjectionInput {
  // Map HexCell[] → PublicBoardCell[]
  // Map Unit[] → PublicBoardUnit[]
  // Compute territories from visible cells
  // Compute pressure from territory delta
  // Build agent snapshots from snapshot.agents
  // Build feed from snapshot.events
  // Extract headline/featured from latest event
  return { ... };
}
```

Key mappings:
- `HexCell` → `PublicBoardCell`: `{ q, r, s, terrain, controlledBy: cell.control ?? null }`
- `Unit` → `PublicBoardUnit`: `{ id, side: owner, q, r, s, hp, strength, type, facing }`
- Territories: count cells where `controlledBy === "A"` / `"B"`
- Pressure: `|territories.A - territories.B| / totalCells * 100`

### 2.2 Tests

- `src/projection/live-match.test.ts`
- Test: empty board produces zero territories
- Test: 10 A cells, 5 B cells produces correct shares
- Test: unit mapping preserves all fields
- Test: feed entries from engine events have correct kinds

---

## Phase 3: Wire Spectator WebSocket

### 3.1 Update `src/gateway/spectator-ws.ts`

**Change**: `buildSpectatorFrameSequence` and the WS handler.

**Current flow**:
```
getMatch(db) → projectLiveSpectatorMatch() → buildSpectatorFrames()
```

**New flow**:
```
if activeRuntime exists:
  runtime.getSpectatorSnapshot() → adaptSpectatorSnapshot() → projectPublicMatch() → buildSpectatorFrames()
else:
  // fallback for completed/replay matches
  getMatch(db) → projectLiveSpectatorMatch() (existing path)
```

This preserves backward compatibility: completed matches still use the DB path. Active matches use the runtime path.

### 3.2 Tests

- `src/gateway/spectator-ws.test.ts`
- Test: active match returns populated board/units
- Test: completed match falls back to DB path
- Test: unknown matchId returns null

---

## Phase 4: Verify Demo Replay Unchanged

### 4.1 Smoke test

- Start arena with `ARENA_SEED_DEMO=1`
- Open `arena.html?demo=1`
- Confirm demo replay plays identically to before
- The demo uses `demo-replay.js` which bypasses spectator-ws entirely, so it should be unaffected

### 4.2 Integration test

- Run `bun test` — all existing tests pass
- Run new tests — all pass

---

## Files Changed

| File | Change |
|------|--------|
| `src/orchestrator/match-runner.ts` | Extract `MatchRuntime` class, add registry + accessor |
| `src/projection/live-match.ts` | **NEW** — runtime-to-public adapter |
| `src/gateway/spectator-ws.ts` | Wire active-runtime path |
| `src/orchestrator/match-runner.test.ts` | **NEW** — runtime + accessor tests |
| `src/projection/live-match.test.ts` | **NEW** — adapter tests |
| `src/gateway/spectator-ws.test.ts` | **NEW** — WS integration tests |

## Files NOT Changed

- `src/projection/public-match.ts` — stays pure DTO/projection
- `src/shared/public-match.ts` — types unchanged
- `src/shared/types.ts` — unchanged
- `src/engine/*` — all engine files unchanged
- `src/public/*` — all client-side files unchanged
- `demo-replay.js` — unchanged

---

## Razor Budget

| Item | Lines (est.) |
|------|-------------|
| MatchRuntime refactor | ~80 |
| live-match.ts adapter | ~60 |
| spectator-ws wiring | ~20 |
| Tests (3 files) | ~150 |
| **Total** | **~310** |

## Risk

- **Low**: MatchRuntime refactor is extract-class, not rewrite
- **Low**: Adapter is a pure function with no side effects
- **Medium**: spectator-ws now has two code paths (active vs completed) — but the fallback preserves existing behavior
- **None**: Demo replay is completely unaffected

---

## Acceptance Criteria

1. `getActiveRuntime(matchId)` returns a `MatchRuntime` for any in-progress match
2. `getSpectatorSnapshot()` returns a `SpectatorSnapshot` with real board, units, territories, and agent data
3. `adaptSpectatorSnapshot()` produces a valid `PublicProjectionInput` with non-zero board/units/territories
4. Spectator WS for an active match sends populated projections
5. Spectator WS for a completed match still works (fallback path)
6. All existing tests pass
7. Demo replay plays identically
