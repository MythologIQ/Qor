# Plan: QOR Shared Task Lifecycle Contract

## Open Questions

- Keep Phase 2 page updates limited to `/qor/victor` and `/qor/forge`. Sub-routes remain unchanged in this plan.

## Phase 1: Shared Contract Module

### Affected Files

- `qor/contracts/task-lifecycle.ts` - add canonical lifecycle types and pure transition guards
- `forge/src/api/update-task.ts` - consume shared transition guards for write validation
- `forge/src/api/phase-completion.ts` - treat terminal lifecycle states as completion truth only
- `victor/src/heartbeat/forge-queue.ts` - consume shared planned-task contract without local status heuristics
- `victor/src/heartbeat/forge-writeback.ts` - submit transitions using shared lifecycle state names

### Changes

- Create `qor/contracts/task-lifecycle.ts` as the single source of truth for:
  - `TaskLifecycleState`
  - `PlannedTask`
  - `ClaimedTask`
  - `ExecutionReceiptRef`
  - `EvidenceBundleRef`
  - `TaskTransition`
- Keep the contract module pure:
  - types only
  - transition guards only
  - no file I/O
  - no route logic
  - no ledger writes
  - no read-model shaping
- Define legal transitions:
  - `planned -> claimed`
  - `claimed -> done`
  - `claimed -> blocked`
- Move lifecycle validation out of `forge/src/projects/manager.ts`.
- Make Forge write endpoints validate `fromState` and `toState` against shared guards before mutation.
- Make Victor write-back emit shared lifecycle state names instead of local raw status assumptions.

### Unit Tests

- `forge/tests/manager.test.ts` - no lifecycle validation remains duplicated in manager helpers
- `forge/tests/phase-completion.test.ts` - only shared terminal lifecycle states complete a phase
- `victor/tests/forge-queue.test.ts` - queue reader accepts shared planned-task state only
- `victor/tests/forge-writeback.test.ts` - write-back payloads use shared `fromState` and `toState` values
- new contract test near `qor/contracts/task-lifecycle.ts` - legal transitions pass, illegal transitions fail

## Phase 2: API and Page Visibility Without Hub Expansion

### Affected Files

- `forge/src/api/status.ts` - expose lifecycle lineage from shared contract state
- zo.space route `/api/victor/project-state` - surface lifecycle summary without adding logic to `victor/src/kernel/memory/hub.ts`
- zo.space route `/qor/victor` - render execution lineage from `victor.execution`
- zo.space route `/qor/forge` - render queued and claimed task lineage from Forge status

### Changes

- Keep `victor/src/kernel/memory/hub.ts` unchanged.
- Add lifecycle summary shaping at the route layer or a new dedicated non-hub adapter, not inside `hub.ts`.
- Expand Forge status payload with contract-backed lineage fields:
  - `state`
  - `claimedBy`
  - `claimedAt`
  - `lastReceiptId`
  - `lastEvidenceBundleId`
  - `transitionCount`
- Expand Victor project-state payload with execution-facing lineage only:
  - `lastBranch`
  - `lastClaimedTaskId`
  - `lastCompletedTaskId`
  - `lastExecutionStatus`
  - `streaks`
  - `lastTickTimestamp`
- Update `/qor/victor` to render the execution lineage block from the existing `victor.execution` surface.
- Update `/qor/forge` to render queued, claimed, and recently completed tasks from Forge status payload.

### Unit Tests

- `forge/tests/status.test.ts` - status payload includes shared lifecycle lineage fields
- `victor/tests/heartbeat.test.ts` - Victor route payload keeps execution lineage nested under `victor.execution`
- route verification for `/api/victor/project-state` - execution lineage present without hub-shape regression
- page verification for `/qor/victor` - branch, task id, execution status, and streaks render
- page verification for `/qor/forge` - task cards render lifecycle state and claim lineage

## Phase 3: Forge Planner Refinement on the Shared Spine

### Affected Files

- `forge/src/api/status.ts` - expose planner-ready queue slices derived from shared lifecycle state
- `forge/src/projects/manager.ts` - derive planner readiness without owning lifecycle contract definitions
- `forge/src/mindmap/derive.ts` - attach planner groupings to lifecycle-backed tasks
- `victor/src/heartbeat/forge-queue.ts` - select planner-ready tasks from Forge status instead of raw status scanning

### Changes

- Define planner readiness from shared lifecycle truth:
  - only `planned` tasks are claimable
  - `claimed` tasks are visible but not queue-eligible
  - `blocked` tasks require explicit operator intervention
  - `done` tasks are terminal
- Add planner-ready fields to Forge status:
  - `claimable`
  - `blockedBy`
  - `ready`
  - `requeueEligible`
- Group queue output by planner concept or workstream without redefining lifecycle semantics.
- Make Victor queue selection prefer Forge status planner slices over direct phase-file interpretation.

### Unit Tests

- `forge/tests/manager.test.ts` - planner-ready slices exclude claimed, blocked, and done tasks
- `forge/tests/status.test.ts` - grouped queue slices remain stable across mixed lifecycle states
- `forge/tests/derive.test.ts` - planner concept groups attach to lifecycle-backed tasks without mutating contract state
- `victor/tests/forge-queue.test.ts` - Victor selects from planner-ready status slices instead of raw task status scanning
