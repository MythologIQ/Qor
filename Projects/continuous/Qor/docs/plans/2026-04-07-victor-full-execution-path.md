# Plan: Victor Full Execution Path and Decision Tree

**Version**: 1.0  
**Date**: 2026-04-07  
**Status**: DRAFT  
**Chain**: Victor governed execution completion  
**Risk Grade**: L2 (heartbeat behavior + governed writes + state persistence)

---

## Substantiation Gate Result

`/qor-substantiate` for `docs/plans/2026-04-06-victor-task-remediation.md` is **ABORTED**.

Reason: **Reality != Promise**.

The audit gate exists and PASSes, but the remediation blueprint still names artifacts that do not yet exist:

- `victor/src/heartbeat/state-persistence.ts`
- `victor/src/kernel/memory/memory-operator-views.ts`
- `victor/tests/memory-operator-views.test.ts`
- `victor/tests/forge-writeback-e2e.test.ts`
- `continuum/src/service/evidence-bundle.ts`
- `continuum/tests/evidence-bundle.test.ts`

Therefore this session must **plan forward**, not falsely seal.

---

## Problem Statement

Victor can now:

1. Read Forge queue state
2. Bootstrap the first planned phase to active
3. Surface queued Forge work
4. Write task status back to Forge
5. Trigger phase auto-completion when a task is marked `done`

But Victor still does **not** have a complete governed execution path.

The current implementation stops at **task derivation**. It does not yet define the full runtime tree:

- how a task is claimed before execution
- how execution is selected by task kind
- how evidence is assembled from the result
- how blocked/error outcomes branch
- how heartbeat state persists across reboot
- how operator-facing APIs expose each branch deterministically

Current reality: Victor can say what he should do next. He still cannot reliably and durably prove that he did it.

---

## Current Execution Path

### What Exists

**Heartbeat derivation**

- `victor/src/heartbeat/mod.ts`
- `victor/src/heartbeat/forge-queue.ts`
- `victor/src/heartbeat/forge-writeback.ts`

**Forge completion path**

- `forge/src/api/update-task.ts`
- `forge/src/api/phase-completion.ts`
- live route `https://frostwulf.zo.space/api/forge/status`
- live route `https://frostwulf.zo.space/api/forge/update-task`

### Actual Runtime Flow Today

```text
heartbeat(ctx)
  -> handleEmptyQueue(ctx)
    -> deriveAutonomy(ctx)
    -> deriveTasksFromContext(ctx)
      -> readForgeQueue(...) first
      -> fallback to lifecycle task if queue empty
      -> append blocker task if blockers exist
    -> return AUTO_DERIVED | QUARANTINE | USER_PROMPT
```

### Missing Runtime Branches

The following branches are still absent from the heartbeat core:

1. `AUTO_DERIVED` task is not claimed before work starts
2. No execution dispatcher exists for task types
3. No result classification exists: `completed | blocked | failed | quarantined`
4. No evidence bundle is assembled from execution output
5. `completeTask()` is not called by the heartbeat path
6. Persistent heartbeat state is still missing
7. `/api/victor/project-state` does not expose a full execution trace tree

---

## Architectural Principle

Victor should execute through a deterministic pipeline:

**select → claim → execute → evaluate result → emit evidence → write back → persist state → expose operator view**

Each step must be explicit, typed, and inspectable.

Victor should never jump from “task exists” to “task done” without receipts.

---

## Target Execution Path

```text
Heartbeat Tick
  -> Load persistent heartbeat state
  -> Read Forge queue
  -> If Forge task exists:
       -> claim task
       -> build execution intent
       -> run execution dispatcher
       -> classify result
       -> emit evidence
       -> write status back to Forge
       -> persist heartbeat state
       -> return EXECUTED
  -> Else:
       -> derive lifecycle fallback task
       -> if derived:
            -> persist derivation event
            -> return AUTO_DERIVED
       -> else:
            -> quarantine
            -> persist failure branch
            -> return QUARANTINE
```

---

## Victor Decision Tree

### Level 1: Tick Entry

```text
tick starts
  -> persistent state readable?
     yes -> continue
     no  -> initialize zero state and continue
```

### Level 2: Work Source

```text
Forge queue has eligible task?
  yes -> Forge-first branch
  no  -> Lifecycle branch
```

### Level 3: Forge-First Branch

```text
claimTask() succeeds?
  yes -> execute claimed task
  no  -> quarantine with reason: claim_failed
```

### Level 4: Execution Branch

```text
task source kind recognized?
  yes -> dispatch executor
  no  -> block task with reason: unknown_task_kind
```

### Level 5: Result Branch

```text
execution result
  completed   -> build evidence -> completeTask()
  blocked     -> build evidence -> blockTask()
  failed      -> quarantine + persist failure
  quarantined -> quarantine + persist decision
```

### Level 6: Persistence Branch

```text
state write succeeds?
  yes -> expose updated status
  no  -> keep execution result, log persistence degradation
```

---

## Phase 1: Heartbeat State Persistence

### Affected Files

- `victor/src/heartbeat/state-persistence.ts` — NEW
- `victor/src/heartbeat/runtime.ts` — NEW
- `victor/src/heartbeat/mod.ts` — MODIFY (thin wrapper only)
- `victor/tests/heartbeat.test.ts` — MODIFY

### Changes

Create a persistent state module for heartbeat continuity.

```typescript
interface HeartbeatPersistentState {
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  consecutiveBlocked: number;
  totalTicks: number;
  lastTickTimestamp: string | null;
  lastTickStatus: "completed" | "blocked" | "failed" | "quarantined" | null;
  lastClaimedTaskId: string | null;
  lastCompletedTaskId: string | null;
}
```

Storage path:

```text
.qore/projects/victor-resident/heartbeat-state.json
```

Rules:

- missing file initializes zero-state
- every tick writes state at end of branch
- `/tmp/victor-heartbeat/*` remains cache, not authority
- heartbeat orchestration moves out of `mod.ts` into `runtime.ts` to preserve Section 4 file limits

### Unit Tests

- missing state file initializes defaults
- success increments `consecutiveSuccesses`
- blocked resets success streak and increments blocked streak
- failed increments failure streak
- persisted state reloads across simulated ticks

---

## Phase 2: Execution Dispatcher

### Affected Files

- `victor/src/heartbeat/execution-dispatch.ts` — NEW
- `victor/src/heartbeat/runtime.ts` — MODIFY
- `victor/tests/execution-dispatch.test.ts` — NEW

### Changes

Define the execution substrate Victor actually uses after claiming work.

```typescript
interface ExecutionIntent {
  taskId: string;
  phaseId: string;
  source: string;
  title: string;
  description: string;
  urgency: "low" | "medium" | "high";
}

interface ExecutionResult {
  status: "completed" | "blocked" | "failed" | "quarantined";
  summary: string;
  testsPassed?: number;
  filesChanged?: string[];
  acceptanceMet?: string[];
  reason?: string;
}
```

Dispatcher responsibilities:

1. map task source to execution handler
2. return typed result
3. never silently swallow failure

Initial handlers:

- `forge:queue:*` → governed task execution adapter
- `lifecycle:*` → lifecycle command adapter
- `blockers` → non-executable, returns `blocked`

### Unit Tests

- forge task dispatches to forge executor
- lifecycle task dispatches to lifecycle executor
- blocker task returns blocked result
- unknown source returns quarantined result

---

## Phase 3: Write-Back Integration in Heartbeat

### Affected Files

- `victor/src/heartbeat/runtime.ts` — MODIFY
- `victor/src/heartbeat/mod.ts` — MODIFY (delegates only)
- `victor/src/heartbeat/forge-writeback.ts` — MODIFY
- `victor/tests/heartbeat.test.ts` — MODIFY
- `victor/tests/forge-writeback-e2e.test.ts` — NEW

### Changes

Right now `forge-writeback.ts` exists but is not wired into the heartbeat branch.

Integrate:

1. `readForgeQueue()`
2. `claimTask()`
3. execution dispatch
4. `buildTaskEvidence()`
5. `completeTask()` or `blockTask()`
6. persistent state update

`mod.ts` remains a thin exported surface:

- `heartbeat(ctx)` delegates to `runHeartbeatTick(ctx)`
- pure helpers stay in `mod.ts`
- side-effectful orchestration lives in `runtime.ts`

New heartbeat statuses:

```typescript
type HeartbeatResult["status"] =
  | "EXECUTED"
  | "AUTO_DERIVED"
  | "QUARANTINE"
  | "USER_PROMPT";
```

Branch rules:

- Forge task completed end-to-end → `EXECUTED`
- lifecycle-only derivation with no execution → `AUTO_DERIVED`
- claim failure / dispatch failure / writeback failure → `QUARANTINE`

### Unit Tests

- Forge task claim + complete returns `EXECUTED`
- failed claim returns `QUARANTINE`
- blocked execution calls `blockTask()`
- lifecycle branch still returns `AUTO_DERIVED`

### Integration Test

Fixture:

- one active Forge phase
- one pending task

Assertions:

1. queue returns task
2. claim marks task active
3. completion marks task done
4. evidence route receives payload
5. phase auto-promotes when final task completes

---

## Phase 4: Evidence and Operator Surface Completion

### Affected Files

- `victor/src/kernel/memory/memory-operator-views.ts` — NEW
- `victor/tests/memory-operator-views.test.ts` — NEW
- `continuum/src/service/evidence-bundle.ts` — NEW
- `continuum/src/service/server.ts` — MODIFY
- `continuum/tests/evidence-bundle.test.ts` — NEW
- live route `https://frostwulf.zo.space/api/victor/project-state` — MODIFY

### Changes

Complete the evidence-to-operator path.

#### 4A. Memory operator views

Structured operator outputs:

- `renderMemoryOverview()`
- `renderNodeDetail(nodeId)`
- `renderSearchResults(query)`
- `renderAuditTrail(nodeId)`

#### 4B. Full evidence bundle materialization

Continuum should materialize complete evidence bundles for governance review:

- entries
- completeness
- confidence
- provenance hash

Build-path connection:

- `continuum/src/service/server.ts` adds `POST /api/continuum/evidence-bundle`
- that route imports `materializeEvidenceBundle()` from `continuum/src/service/evidence-bundle.ts`
- this prevents `evidence-bundle.ts` from being an orphan

#### 4C. Victor status API expansion

`/api/victor/project-state` should expose execution branches explicitly:

```typescript
execution: {
  lastBranch: "forge" | "lifecycle" | "quarantine" | "user-prompt";
  lastClaimedTaskId: string | null;
  lastCompletedTaskId: string | null;
  lastExecutionStatus: string | null;
  streaks: {
    success: number;
    blocked: number;
    failed: number;
  };
  totalTicks: number;
  lastTickTimestamp: string | null;
}
```

### Unit Tests

- operator view functions return stable shapes
- evidence bundle materializes required fields
- project-state exposes execution branch and streaks

---

## Phase 5: Final Victor Decision Tree Hardening

### Affected Files

- `victor/src/heartbeat/runtime.ts`
- `victor/src/heartbeat/mod.ts`
- `victor/tests/heartbeat.test.ts`
- `docs/META_LEDGER.md`
- `docs/SYSTEM_STATE.md`

### Changes

Harden explicit decision branches for:

- no queue work
- no claim
- no executor
- execution blocked
- execution failed
- evidence emission failed
- write-back failed
- persistence failed

Every branch must:

1. assign deterministic status
2. persist state if possible
3. surface operator-visible reason

Razor guard:

- `victor/src/heartbeat/mod.ts` must stay under 250 lines by exporting types/pure helpers only
- `victor/src/heartbeat/runtime.ts` and `victor/src/heartbeat/execution-dispatch.ts` absorb orchestration complexity

### Unit Tests

- every branch returns deterministic result
- no branch throws uncaught errors
- failure paths still generate inspectable output

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create `state-persistence.ts` and wire it into heartbeat | Medium |
| 2 | Create execution dispatcher | Medium |
| 3 | Integrate claim → execute → evidence → write-back in `mod.ts` | Medium |
| 4 | Add `forge-writeback-e2e.test.ts` | Low |
| 5 | Implement `memory-operator-views.ts` + tests | Medium |
| 6 | Implement continuum evidence bundle + tests | Medium |
| 7 | Expand `/api/victor/project-state` with execution branch data | Low |
| 8 | Run full Victor + Forge + Continuum test sweep | — |
| 9 | Re-run `/qor-substantiate` on the remediation blueprint | — |

---

## Acceptance Criteria

- Victor claims Forge work before execution
- Victor executes through a typed dispatcher
- completion and blocked branches both emit evidence
- Forge phase auto-completion is triggered from the real heartbeat path
- heartbeat streaks persist across reboot
- `/api/victor/project-state` exposes execution branch state
- missing-branch failures return deterministic quarantine, not silent drop
- previously missing remediation artifacts all exist
- `/qor-substantiate` can PASS without Reality/Promise drift

---

## What This Plan Does NOT Include

- changing Forge auth model
- changing zo.space route topology
- changing Victor cadence or tier policy
- redesigning frontend pages beyond status exposure
