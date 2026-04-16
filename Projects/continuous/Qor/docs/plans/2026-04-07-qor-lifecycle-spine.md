# Plan: QOR Lifecycle Spine and Operator Visibility

## Open Questions

- Limit Phase 2 page updates to `/qor/victor` and `/qor/forge` only. Sub-routes stay on existing read models for this plan.

## Phase 1: Deterministic Lifecycle Spine

### Affected Files

- `forge/src/projects/manager.ts` - add canonical lifecycle types and transition helpers
- `forge/src/api/update-task.ts` - enforce lifecycle transitions against Forge-owned task state
- `forge/src/api/record-evidence.ts` - bind evidence records to task transition lineage
- `forge/src/api/phase-completion.ts` - complete phases from canonical lifecycle state only
- `victor/src/heartbeat/forge-queue.ts` - consume canonical planned-task shape
- `victor/src/heartbeat/forge-writeback.ts` - submit claimed and completed transitions with explicit receipt references
- `victor/src/heartbeat/runtime.ts` - persist Forge task claims and completions as transition outcomes

### Changes

- Introduce one Forge-owned lifecycle contract:
  - `PlannedTask`
  - `ClaimedTask`
  - `ExecutionReceipt`
  - `EvidenceBundleRef`
- Add pure transition validators:
  - `planned -> claimed`
  - `claimed -> done`
  - `claimed -> blocked`
- Make `update-task.ts` accept transition intent instead of raw status mutation:
  - `taskId`
  - `fromState`
  - `toState`
  - `agentId`
  - `receiptRef?`
  - `evidence`
- Keep Forge as source of truth:
  - claimed task metadata lives on Forge task records
  - Victor never becomes canonical owner of task state
- Add receipt linkage fields on task records:
  - `claimedBy`
  - `claimedAt`
  - `lastReceiptId`
  - `lastEvidenceBundleId`
  - `transitionCount`
- Make `record-evidence.ts` append lineage metadata without mutating task state:
  - `taskId`
  - `phaseId`
  - `receiptId`
  - `bundleId?`
- Refactor `phase-completion.ts` to treat only terminal lifecycle states as complete evidence for phase promotion.

### Unit Tests

- `forge/tests/manager.test.ts` - legal transition matrix accepts only valid lifecycle moves
- `forge/tests/phase-completion.test.ts` - phase completion ignores claimed tasks and only advances on terminal states
- `victor/tests/forge-queue.test.ts` - queue reader returns only `planned` lifecycle tasks and skips claimed/done/blocked items
- `victor/tests/forge-writeback.test.ts` - claim/complete/block payloads include `fromState`, `toState`, and receipt linkage
- `victor/tests/forge-writeback-e2e.test.ts` - full claim -> complete path persists canonical lifecycle updates in Forge

## Phase 2: Operator Visibility on APIs and Pages

### Affected Files

- `forge/src/api/status.ts` - expose lifecycle lineage in Forge read model
- `victor/src/kernel/memory/hub.ts` - extend Victor hub payload with execution lineage summary
- zo.space route `/api/victor/project-state` - surface lifecycle lineage from Forge-owned task state and Victor execution state
- zo.space route `/qor/victor` - render execution lineage block from `victor.execution`
- zo.space route `/qor/forge` - render active and queued tasks with lifecycle details

### Changes

- Expand Forge status payload with deterministic lifecycle fields:
  - `state`
  - `claimedBy`
  - `claimedAt`
  - `lastReceiptId`
  - `lastEvidenceBundleId`
  - `transitionSummary`
- Expand Victor status payload with execution-facing lineage:
  - `currentForgeTaskId`
  - `lastClaimedTaskId`
  - `lastCompletedTaskId`
  - `lastExecutionStatus`
  - `streaks`
  - `lastTickTimestamp`
- Add read-model adapters in `hub.ts` instead of duplicating lifecycle parsing in route code.
- Update `/qor/victor` to show:
  - current branch
  - current or last Forge task
  - last execution status
  - streak summary
  - last tick timestamp
- Update `/qor/forge` to show:
  - queued tasks
  - claimed task owner
  - receipt/evidence linkage
  - phase progress derived from lifecycle state
- Keep page rendering read-only. No inline mutations in this phase.

### Unit Tests

- `forge/tests/status.test.ts` - status payload includes lifecycle lineage fields for planned, claimed, done, and blocked tasks
- `victor/tests/heartbeat.test.ts` - Victor read model exposes execution lineage without flattening stale compatibility aliases
- route verification for `/api/victor/project-state` - `victor.execution` and Forge task lineage are both present
- page verification for `/qor/victor` - execution block renders branch, task id, and streaks
- page verification for `/qor/forge` - queued and claimed task cards render lifecycle metadata

## Phase 3: Forge Planner Refinement on Top of the Spine

### Affected Files

- `forge/src/projects/manager.ts` - derive planner readiness from lifecycle truth
- `forge/src/api/status.ts` - expose planner-ready queue slices
- `forge/src/mindmap/derive.ts` - attach planner concepts to lifecycle-backed task groups
- `victor/src/heartbeat/forge-queue.ts` - select only planner-ready tasks from Forge status

### Changes

- Replace raw status sorting with planner-ready selection rules:
  - only unclaimed planned tasks are queue-eligible
  - blocked tasks require explicit unblock action before re-entry
  - claimed tasks time out or requeue only through explicit Forge transition logic
- Add planner-side readiness fields:
  - `ready`
  - `blockedBy`
  - `claimable`
  - `requeueEligible`
- Group queued tasks by concept or workstream in Forge status so planner structure is visible without reading raw phase JSON.
- Update queue selection in Victor to consume planner-ready slices instead of directly re-deriving eligibility from raw task status.

### Unit Tests

- `forge/tests/manager.test.ts` - planner-ready queue excludes claimed and blocked tasks
- `forge/tests/status.test.ts` - grouped queue slices remain stable across mixed lifecycle states
- `forge/tests/derive.test.ts` - mindmap derivation attaches tasks to concept groups without reading mutable execution state
- `victor/tests/forge-queue.test.ts` - Victor selection prefers planner-ready queue data over raw task scanning
