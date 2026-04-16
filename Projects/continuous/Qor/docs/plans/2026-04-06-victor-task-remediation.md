# Plan: Victor Task Remediation & Full P0–P2 Sweep

**Version**: 1.0
**Date**: 2026-04-06
**Status**: DRAFT
**Chain**: Victor operational remediation
**Risk Grade**: L2 (data mutation + heartbeat behavior changes)

---

## Root Cause Analysis

Victor has completed **zero** Forge tasks since the write-back contract was sealed. Three interlocking failures:

1. **No active phase** — All 35 phases in `builder-console/path/phases.json` are either `complete` (19) or `planned` (16). The `readForgeQueue()` function only reads tasks from phases with status `active` or `in-progress`. With 0 active phases, Victor's queue is always empty.

2. **Phase promotion gap** — `phase-completion.ts` promotes the *next* planned phase when the *current* phase completes. But the promotion chain broke at the boundary between the last completed phase and the first planned phase. No mechanism exists to bootstrap the first planned phase to `active`.

3. **Heartbeat state missing** — `/tmp/victor-heartbeat/` is empty. The heartbeat agent (Kimi K2.5, 10m cadence) IS running, but its state files are ephemeral (`/tmp/`) and lost on reboot. Without state, `consecutiveSuccesses` tracking is gone.

---

## Phase 1: Unblock the Pipeline (P0 — Immediate)

### 1A. Activate the next planned phase

**Affected files:**
- `.qore/projects/builder-console/path/phases.json` — Set first planned phase to `active`
- `forge/src/api/forge-queue.ts` — Add `planned` fallback when no `active` phase exists

**Changes:**

**Data fix** — Set `phase_packaging_ingress_plane` (ordinal 20, first planned) to `status: "active"`. This is a one-time bootstrap.

**Code fix** — Modify `readForgeQueue()` to fall back to the first `planned` phase when no `active` phase is found. This prevents the gap from recurring:

```typescript
// Current (line 50-52):
const active = raw.phases.find(
  (p) => p.status === "active" || p.status === "in-progress"
);

// New:
const active = raw.phases.find(
  (p) => p.status === "active" || p.status === "in-progress"
) ?? raw.phases
  .filter((p) => p.status === "planned")
  .sort((a, b) => (a.ordinal ?? 99) - (b.ordinal ?? 99))[0] ?? null;
```

If the fallback fires, it auto-promotes that phase to `active` in memory and writes back, so subsequent reads see a proper active phase.

### 1B. Fix failing Forge test

**Affected files:**
- `forge/tests/build-log.test.ts` — Update `KNOWN_ACTIONS` allowlist

**Changes:**

The ledger contains 6 action types: `create`, `update`, `complete-task`, `claim`, `create-phase`, `update-risk`. The test only allows 4. Add the missing two:

```typescript
// Current:
const KNOWN_ACTIONS = ["create", "update", "complete-task", "claim"];

// New:
const KNOWN_ACTIONS = ["create", "update", "complete-task", "claim", "create-phase", "update-risk"];
```

### Unit Tests

- `readForgeQueue()` with 0 active + N planned phases returns the first planned phase
- `readForgeQueue()` with 1 active phase still returns the active (no regression)
- `build-log.test.ts` passes (all 10 tests, 0 fail)
- After data fix: `readForgeQueue(phasesPath)` returns a non-null task

---

## Phase 2: Restore Data Integrity (P1)

### 2A. Fix `activePhase` null in `/api/forge/status`

**Affected files:**
- zo.space route `/api/forge/status` — Fix active phase selector

**Changes:**

The API reads phases but uses a different selector than `forge-queue.ts`. Apply the same fallback logic: if no `active`/`in-progress` phase, fall back to the first `planned` phase sorted by ordinal.

### 2B. Restore `consecutiveSuccesses` tracking

**Affected files:**
- `victor/src/heartbeat/mod.ts` — Add success counter to heartbeat result
- `.qore/projects/victor-resident/path/phases.json` — Add `consecutiveSuccesses` field to Victor's state

**Changes:**

The heartbeat writes state to `/tmp/victor-heartbeat/victor.json` — but this is ephemeral. Add a persistent counter to Victor's phase data in `.qore/projects/victor-resident/`:

```typescript
// New file: victor/src/heartbeat/state-persistence.ts
export interface HeartbeatPersistentState {
  consecutiveSuccesses: number;
  lastTickTimestamp: string;
  lastTickStatus: string;
  totalTicks: number;
}
```

Read from `.qore/projects/victor-resident/heartbeat-state.json` at tick start, write at tick end. Falls back to `{consecutiveSuccesses: 0}` if missing.

### 2C. Populate `forge/state.json` with runtime state

**Affected files:**
- `forge/state.json` — Add dynamic fields
- zo.space route `/api/forge/status` — Read and merge `state.json`

**Changes:**

Update `forge/state.json` schema to include:

```json
{
  "entity": "forge",
  "version": "1.0.1",
  "lastUpdated": "<dynamic>",
  "status": "active",
  "activePhaseId": "<derived from phases.json>",
  "consecutiveCompletions": 0,
  "lastTaskCompleted": null,
  "dataSources": { ... }
}
```

The `/api/forge/status` route reads this and merges with live phase data.

### 2D. Victor Phase 15 completion — `task_victor_memory_operator_views`

**Affected files:**
- `victor/src/kernel/memory/memory-operator-views.ts` — NEW: Operator view rendering
- `victor/tests/memory-operator-views.test.ts` — NEW: Tests

**Changes:**

This is the last task in Phase 15 (Memory Operator Surface). The three siblings are complete:
- `memory-facade.ts` (facade)
- `memory-traversal-forget.ts` (traversal + forgetting)
- `memory-file-ingestion.ts` (file ingestion)

`memory-operator-views` provides formatted views for operators:
- `renderMemoryOverview()` — Summary stats (total nodes, edges, tiers, saturation)
- `renderNodeDetail(nodeId)` — Single node with edges, provenance, decay state
- `renderSearchResults(query)` — Formatted recall results with relevance scores
- `renderAuditTrail(nodeId)` — Operation history for a specific node

Each returns a structured `OperatorView` object (not HTML — data shape for UI consumption).

### Unit Tests

- `/api/forge/status` returns non-null `activePhase` with name and phaseId
- `consecutiveSuccesses` persists across simulated tick cycles
- `forge/state.json` is readable and valid JSON after update
- `memory-operator-views`: 4+ tests covering each render function
- Phase 15 all 4/4 tasks marked `done` after completion

---

## Phase 3: Backlog Completion (P2)

### 3A. Delete `/victor-shell` route

**Affected files:**
- zo.space route `/victor-shell` — DELETE
- All `/qor/*` routes — Remove any remaining `/victor-shell` links

**Changes:**

Grep all routes for `victor-shell` references, remove them, then delete the route. This was approved in the shell migration plan but deferred pending user confirmation.

### 3B. Expand constellation mindmap

**Affected files:**
- zo.space route `/qor/forge/constellation` — Expand node derivation
- `forge/src/mindmap/derive.ts` — Add deeper concept extraction

**Changes:**

Current: 6 concept nodes (one per top-level entity).
Target: Full architecture derivation from `AGENTS.md` + phase data. Each entity gets child concept nodes reflecting its architectural components (e.g., Victor → Heartbeat, Memory, Evaluation, Quarantine, Governance).

### 3C. End-to-end Forge write-back integration test

**Affected files:**
- `victor/tests/forge-writeback-e2e.test.ts` — NEW

**Changes:**

Simulates a full cycle:
1. Read Forge queue → get eligible task
2. Claim task via write-back API
3. Complete task via write-back API
4. Verify phase auto-completion fires if all tasks done
5. Verify evidence is recorded

Requires a test fixture with a phases.json containing one active phase with one pending task.

### 3D. Continuum full bundle evidence materialization

**Affected files:**
- `continuum/src/service/evidence-bundle.ts` — NEW
- `continuum/tests/evidence-bundle.test.ts` — NEW

**Changes:**

Currently Continuum runs in `lite` evidence mode. Full bundle mode materializes:
- All evidence entries for a session
- Completeness check against evidence policy
- Confidence score computation
- Bundle serialization for governance gate consumption

### Unit Tests

- Integration test: Victor reads → claims → completes → evidence recorded (5 assertions)
- Constellation: Node count > 15 after full derivation
- Evidence bundle: `materialize()` returns complete bundle with all required fields

---

## Migration Steps

| # | Action | Phase | Risk |
|---|--------|-------|------|
| 1 | Activate first planned phase in phases.json | P1-1A | Low |
| 2 | Add planned-fallback to `readForgeQueue()` | P1-1A | Low |
| 3 | Update `KNOWN_ACTIONS` in build-log test | P1-1B | Low |
| 4 | Fix `/api/forge/status` activePhase selector | P2-2A | Low |
| 5 | Create `heartbeat-state.ts` persistence | P2-2B | Medium |
| 6 | Update `forge/state.json` schema | P2-2C | Low |
| 7 | Implement `memory-operator-views.ts` + tests | P2-2D | Medium |
| 8 | Delete `/victor-shell` route | P3-3A | Low |
| 9 | Expand constellation derivation | P3-3B | Medium |
| 10 | Write e2e write-back test | P3-3C | Low |
| 11 | Implement full evidence bundle | P3-3D | Medium |
| 12 | Verify heartbeat agent picks up Forge task | P1 | — |
| 13 | Update META_LEDGER + substantiate | — | — |
