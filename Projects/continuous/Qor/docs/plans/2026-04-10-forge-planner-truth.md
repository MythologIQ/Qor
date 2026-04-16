# Plan: Forge Planner Truth

## Open Questions

- `blocked` tasks are quarantined and revisitable; they do not count as queue-eligible work and do not by themselves freeze the planner surface.
- `/api/forge/status` stays high-level at the top level and exposes nested drill-down structures beneath normalized planner views.

## Phase 1: Planner State Correctness

### Affected Files

- `.qore/projects/builder-console/path/phases.json` - normalize the current active/planned boundary
- `forge/src/api/status.ts` - centralize active-phase and queue selection
- `forge/src/projects/task-promotion.ts` - make next-task and next-phase selection deterministic
- `forge/src/api/phase-completion.ts` - complete phase only from normalized task state
- `forge/src/api/update-task.ts` - route task mutations through shared planner-state helpers
- `forge/src/api/create-phase.ts` - create phases in normalized planner shape
- `forge/tests/status.test.ts` - cover active-phase and queue derivation
- `forge/tests/task-promotion.test.ts` - cover deterministic promotion rules
- `forge/tests/phase-completion.test.ts` - cover completion and next-phase activation

### Changes

- Define one normalized planner model for `Phase`, `Task`, and planner status values in `forge/src/projects/task-promotion.ts`.
- Add a shared selector set:
  - `findActivePhase(phases)`
  - `findFallbackPlannedPhase(phases)`
  - `listEligibleTasks(phase)`
  - `selectNextEligibleTask(tasks)`
- Make `findActivePhase` prefer `active` and `in-progress`, then fall back to the lowest-ordinal `planned` phase.
- Make `/api/forge/status` consume those selectors instead of maintaining its own active-phase logic.
- Make `update-task.ts` mutate tasks through one planner-state update path:
  - locate phase and task
  - apply status transition
  - recompute phase completion
  - promote next phase if needed
- Make `create-phase.ts` append new phases in canonical shape with explicit ordinal, status, empty task list, and timestamps.
- Normalize nested task eligibility so only `pending` and `planned` are queue-eligible.
- Treat `blocked` tasks as quarantined planner artifacts:
  - excluded from queue selection
  - surfaced separately in planner detail
  - not auto-completing a phase
  - not collapsing the planner into a globally blocked state
- Remove duplicate status-selection logic from any Forge API helper that currently derives active phase independently.
- Apply the one-time data correction in `phases.json` so the first queued planned phase becomes the current active planner context.

### Unit Tests

- `forge/tests/status.test.ts` - active phase is selected from `active` when present
- `forge/tests/status.test.ts` - first planned phase becomes planner context when no active phase exists
- `forge/tests/status.test.ts` - queue selection excludes `done`, `active`, and `blocked`
- `forge/tests/task-promotion.test.ts` - lowest ordinal planned phase is promoted next
- `forge/tests/task-promotion.test.ts` - promotion does not skip a valid active phase
- `forge/tests/phase-completion.test.ts` - phase completes only when all tasks are `done` or `complete`
- `forge/tests/phase-completion.test.ts` - mixed task states do not complete a phase
- `forge/tests/phase-completion.test.ts` - task mutation promotes exactly one next planned phase

## Phase 2: Planner Traceability

### Affected Files

- `forge/src/governance/ledger.ts` - append canonical planner mutation entries
- `forge/src/api/update-task.ts` - emit task mutation ledger records
- `forge/src/api/create-phase.ts` - emit phase creation ledger records
- `forge/src/api/update-risk.ts` - emit risk mutation ledger records in the same planner contract
- `forge/src/api/record-evidence.ts` - bind evidence receipts to planner mutations
- `forge/src/api/phase-completion.ts` - emit phase-completion and promotion ledger entries
- `.qore/projects/builder-console/ledger.jsonl` - authoritative planner mutation stream
- `forge/tests/build-log.test.ts` - validate the expanded action set and entry shape
- `forge/tests/manager.test.ts` - validate project-level trace records if manager helpers are used

### Changes

- Define one canonical Forge ledger entry shape for planner mutations:
  - `action`
  - `artifactId`
  - `phaseId`
  - `projectId`
  - `actorId`
  - `timestamp`
  - `payload`
  - `governanceDecisionId`
  - `evidenceEntryId`
- Make every write surface append a ledger record through `forge/src/governance/ledger.ts` instead of formatting ad hoc route-local entries.
- Make `update-task.ts` emit distinct actions for:
  - `claim-task`
  - `complete-task`
  - `block-task`
  - `reopen-task`
- Make `phase-completion.ts` emit:
  - `complete-phase`
  - `promote-phase`
- Make `record-evidence.ts` return the persisted evidence entry id in a route-stable shape consumable by planner mutations.
- Require planner write routes to attach the evidence id they used, even when the evidence mode is lite.
- Keep planner state mutation and ledger append adjacent in code but separate in helpers so state rules and trace rules do not braid together.
- Update the known action allowlist in `forge/tests/build-log.test.ts` to match the canonical planner action set.

### Unit Tests

- `forge/tests/build-log.test.ts` - every planner action is accepted by the canonical allowlist
- `forge/tests/build-log.test.ts` - task mutations include `phaseId`, `artifactId`, and `timestamp`
- `forge/tests/build-log.test.ts` - phase completion emits both completion and promotion records when promotion occurs
- `forge/tests/status.test.ts` - status response includes the latest ledger-derived mutation summary
- `forge/tests/manager.test.ts` - project-level planner writes append ledger entries through shared helpers

## Phase 3: Planner Views Contract

### Affected Files

- `forge/src/api/status.ts` - return normalized planner views for all Forge consumers
- `forge/src/mindmap/derive.ts` - bind concept metadata to normalized planner state
- `forge/src/projects/manager.ts` - expose project and subproject views from the same planner source
- `forge/state.json` - hold only runtime planner summary fields not derivable from phases or ledger
- `/api/forge/status` - serve the unified planner contract
- `/qor/forge` - consume planner summary and active work from the unified contract
- `/qor/forge/projects` - consume project and phase views from the unified contract
- `/qor/forge/roadmap` - consume ordered planner sequence from the unified contract
- `/qor/forge/risks` - consume risk views from the unified contract
- `/qor/forge/constellation` - consume planner-derived concept metadata from the unified contract
- `forge/tests/status.test.ts` - verify response shape stability
- `forge/tests/derive.test.ts` - verify concept derivation from normalized planner data

### Changes

- Reshape `forge/src/api/status.ts` around one output contract with three top-level planner views:
  - `planner`
  - `projects`
  - `ledger`
- Put all route-facing Forge summaries under `planner`:
  - `activePhase`
  - `nextPhase`
  - `queue`
  - `quarantine`
  - `progress`
  - `risks`
  - `milestones`
  - `evidence`
- Keep the top level concise, and push drill-down detail into nested structures under those planner views instead of exposing raw phase data as the main route contract.
- Make `projects` expose project and subproject structures without duplicating planner summary logic.
- Make `ledger` expose planner-relevant recent entries and counts, not raw unbounded history.
- Reduce `forge/state.json` to runtime-only values such as `lastUpdated`, `consecutiveCompletions`, and `lastTaskCompleted`.
- Make `derive.ts` read normalized planner and project views rather than raw `phases.json` so constellation metadata stays aligned with the planner contract.
- Update each Forge page route to consume the unified planner contract instead of mixing route-local transforms with API data.
- Keep the route updates strictly data-contract changes; no shell or layout redesign in this plan.

### Unit Tests

- `forge/tests/status.test.ts` - `/api/forge/status` returns `planner.activePhase`, `planner.queue`, `projects`, and `ledger`
- `forge/tests/status.test.ts` - blocked tasks appear under `planner.quarantine` and are excluded from `planner.queue`
- `forge/tests/status.test.ts` - planner progress is derived from normalized task state, not duplicated counters
- `forge/tests/status.test.ts` - `state.json` runtime fields merge without overriding planner truth from phases and ledger
- `forge/tests/derive.test.ts` - constellation nodes attach planner metadata from normalized views
- `forge/tests/derive.test.ts` - concept derivation remains stable when the active phase falls back from planned
