# Plan: Victor→Forge Write-Back Contract

**Version**: 1.0  
**Date**: 2026-04-06  
**Status**: DRAFT  
**Chain**: Victor as Forge's Executor  
**Risk Grade**: L2 (new integration contract between two existing modules)

---

## Problem Statement

Victor's heartbeat derives tasks from its own lifecycle context (`inferLifecycleStage`), but never reads Forge's task queue. When Victor completes work, that completion is recorded only in Victor's ledger — Forge's phases stay frozen until a human manually calls `/api/forge/update-task`.

The Forge owns the plan. Victor should be its hands. The missing piece is a governed write-back loop:

1. Victor reads Forge's queue → picks the next eligible task
2. Victor executes the task
3. Victor writes completion back to Forge via existing APIs
4. Forge auto-promotes phases when all tasks are done

---

## Architectural Principle

Forge is the planner (what needs doing). Victor is the executor (doing it and proving it was done). Neither oversteps. The contract is:

- **Forge** exposes tasks via `/api/forge/status` and accepts completions via `/api/forge/update-task`
- **Victor** reads the queue, claims work, executes, reports back with evidence
- **Evidence layer** records every claim and completion for governance traceability

---

## Phase 1: Forge Queue Reader + Task Claim

### Affected Files

- `victor/src/heartbeat/forge-queue.ts` — NEW: Forge queue reader and task selector
- `victor/tests/forge-queue.test.ts` — NEW: Tests for queue reading and selection

### Changes

**`forge-queue.ts`** — A module that:

1. Reads `/api/forge/status` (or directly from `PATHS.builderPhases` on filesystem for local execution)
2. Extracts the active phase and its pending/queued tasks
3. Selects the highest-priority eligible task (by `priority` field, then by order)
4. Returns a `ForgeTask` or `null` if nothing is eligible

```typescript
interface ForgeTask {
  taskId: string;
  phaseId: string;
  title: string;
  description: string;
  acceptance: string[];
  priority: number;
}

interface ForgeQueueResult {
  task: ForgeTask | null;
  activePhase: { phaseId: string; name: string; objective: string } | null;
  queueDepth: number;
}
```

**Key functions**:

- `readForgeQueue(phasesPath: string): ForgeQueueResult` — Reads phases.json, finds active phase, returns next eligible task
- `selectNextTask(tasks: RawTask[]): ForgeTask | null` — Priority sort, filter for `pending`/`planned` status, return top pick
- `isTaskEligible(task: RawTask): boolean` — Status is `pending` or `planned`, not blocked

### Unit Tests

- `readForgeQueue` returns the active phase's first pending task
- `readForgeQueue` returns `null` when all tasks are `done`
- `selectNextTask` picks highest priority task
- `selectNextTask` skips `done`, `active`, and `blocked` tasks
- `isTaskEligible` returns true for `pending`, false for `done`/`active`/`blocked`

---

## Phase 2: Victor Write-Back + Evidence Emission

### Affected Files

- `victor/src/heartbeat/forge-writeback.ts` — NEW: Write-back contract for task completion
- `victor/tests/forge-writeback.test.ts` — NEW: Tests for write-back

### Changes

**`forge-writeback.ts`** — A module that:

1. Claims a task by updating its status to `active` via `/api/forge/update-task`
2. After execution, marks the task `done` via the same endpoint
3. Records evidence of completion via `/api/forge/record-evidence`
4. Returns a structured completion receipt

```typescript
interface CompletionReceipt {
  taskId: string;
  phaseId: string;
  status: "done" | "blocked";
  evidenceId: string;
  timestamp: string;
  provenanceHash: string;
}

interface WriteBackConfig {
  forgeApiBase: string;
  forgeApiKey: string;
  agentId: string;
}
```

**Key functions**:

- `claimTask(config: WriteBackConfig, taskId: string): Promise<boolean>` — POST to `/api/forge/update-task` with `{ taskId, newStatus: "active" }`
- `completeTask(config: WriteBackConfig, taskId: string, evidence: TaskEvidence): Promise<CompletionReceipt>` — POST to `/api/forge/update-task` with `done`, then POST evidence to `/api/forge/record-evidence`
- `blockTask(config: WriteBackConfig, taskId: string, reason: string): Promise<CompletionReceipt>` — POST to `/api/forge/update-task` with `blocked`
- `buildTaskEvidence(taskId: string, phaseId: string, result: ExecutionResult): TaskEvidence` — Constructs evidence payload from execution output

```typescript
interface TaskEvidence {
  sessionId: string;
  kind: "CapabilityReceipt";
  payload: {
    taskId: string;
    phaseId: string;
    action: "task-completion";
    actor: "victor";
    testsPassed?: number;
    filesChanged?: string[];
    acceptanceMet: string[];
  };
}
```

**Auth**: Reads Forge API key from `forge/.secrets/api_key` (already exists). For local filesystem writes, bypasses HTTP and writes directly to `phases.json` + `ledger.jsonl`.

### Unit Tests

- `claimTask` sends correct payload and returns true on 200
- `completeTask` updates status to `done` and records evidence
- `completeTask` returns a receipt with provenanceHash
- `blockTask` updates status to `blocked` with reason
- `buildTaskEvidence` constructs correct evidence shape
- Write-back fails gracefully on network error (returns error, doesn't throw)

---

## Phase 3: Heartbeat Integration — Forge-First Task Source

### Affected Files

- `victor/src/heartbeat/mod.ts` — MODIFY: Add Forge queue as primary task source
- `victor/tests/heartbeat.test.ts` — MODIFY: Add tests for Forge-first derivation

### Changes

**`mod.ts` modifications**:

1. Import `readForgeQueue` and `claimTask` from new modules
2. Modify `deriveTasksFromContext` to check Forge queue FIRST, before lifecycle derivation
3. When a Forge task is found, wrap it as a `Task` with `source: "forge:queue"`
4. When no Forge task is found, fall back to existing lifecycle derivation
5. Add `forgeQueuePath` to `AgentContext` interface (optional, defaults to builder-console phases path)

**Modified flow in `deriveTasksFromContext`**:

```
1. Read Forge queue → if eligible task found → return it as primary task
2. If no Forge task → fall through to existing lifecycle derivation
3. Blocker tasks still append alongside either source
```

**New `AgentContext` field**:

```typescript
interface AgentContext {
  // ... existing fields ...
  forgeQueuePath?: string;  // Path to builder-console/path/phases.json
}
```

**Task wrapping** — Forge tasks get mapped to the existing `Task` interface:

```typescript
{
  id: forgeTask.taskId,
  title: forgeTask.title,
  description: forgeTask.description,
  urgency: forgeTask.priority <= 2 ? "high" : forgeTask.priority <= 5 ? "medium" : "low",
  source: `forge:queue:${forgeTask.phaseId}`,
}
```

### Unit Tests

- `deriveTasksFromContext` returns Forge task when queue has pending work
- `deriveTasksFromContext` falls back to lifecycle when Forge queue is empty
- `deriveTasksFromContext` includes blocker tasks alongside Forge task
- Forge task maps to correct `Task` shape with `source: "forge:queue:*"`
- `heartbeat` with Forge task returns `AUTO_DERIVED` status
- Missing `forgeQueuePath` gracefully skips Forge queue (no crash)

---

## Phase 4: Phase Auto-Completion in Forge API

### Affected Files

- `forge/src/api/phase-completion.ts` — NEW: Phase auto-completion logic
- `forge/tests/phase-completion.test.ts` — NEW: Tests

### Changes

**`phase-completion.ts`** — Called by `/api/forge/update-task` after every task status change:

1. After a task is marked `done`, check if ALL tasks in the parent phase are `done`
2. If yes, update the phase `status` to `complete` and `updatedAt` to now
3. Find the next phase by ordinal and set it to `active` (if it exists and is `planned`)
4. Append a ledger entry for the phase completion: `{ action: "complete-phase", phaseId }`

```typescript
function checkPhaseCompletion(phases: Phase[], phaseId: string): PhaseTransition | null
function promoteNextPhase(phases: Phase[], completedOrdinal: number): string | null
```

**Integration point**: The existing `/api/forge/update-task` zo.space route calls these functions after updating task status. This is a code_edit to the existing route — add 5-10 lines after the task write.

### Unit Tests

- `checkPhaseCompletion` returns transition when all tasks done
- `checkPhaseCompletion` returns null when tasks remain
- `promoteNextPhase` activates next planned phase
- `promoteNextPhase` returns null when no next phase exists
- Phase completion appends ledger entry with correct action
- Mixed task statuses (done + pending) do not trigger completion

---

## Migration Steps

| # | Action | Risk |
|---|--------|------|
| 1 | Create `victor/src/heartbeat/forge-queue.ts` + tests | Low |
| 2 | Create `victor/src/heartbeat/forge-writeback.ts` + tests | Low |
| 3 | Modify `victor/src/heartbeat/mod.ts` to read Forge queue first | Medium |
| 4 | Create `forge/src/api/phase-completion.ts` + tests | Low |
| 5 | Wire phase-completion into `/api/forge/update-task` route | Medium |
| 6 | Run all tests (existing + new) | — |
| 7 | Verify via API: complete a task → phase auto-promotes | — |
| 8 | Update META_LEDGER + push to GitHub | — |

---

## What This Plan Does NOT Include

- Changing the Forge API auth mechanism (existing bearer token is sufficient)
- Modifying the evidence layer's governance gate (existing gate on `update-task` is sufficient)
- Creating new zo.space routes (all existing routes are reused)
- Modifying Victor's cadence or tier (execution context unchanged)
- UI changes (dashboard reflects data changes automatically via existing API reads)
