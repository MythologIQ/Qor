# Plan: Forge Workspace Authority and Thin Route Adapters

## Open Questions

- The authoritative planner read model lives in the workspace and is materialized as a stable JSON artifact before zo.space serves it.
- zo.space remains a delivery surface only in this phase; planner logic, normalization, and mutation rules do not live in route-local code.

## Phase 1: Extract the Workspace Planner Contract

### Affected Files

- `qor/contracts/forge-planner.ts` - define the canonical planner read model and mutation-facing types
- `qor/contracts/forge-planner.test.ts` - verify normalization and serialized contract shape
- `forge/src/projects/task-promotion.ts` - move active-phase, fallback, and queue selectors behind the shared contract
- `forge/src/api/status.ts` - reduce to workspace authority helpers that build the contract artifact
- `forge/src/api/phase-completion.ts` - consume canonical lifecycle and planner transition helpers
- `forge/src/api/update-task.ts` - mutate task state through contract-backed helpers only
- `forge/src/governance/ledger.ts` - expose planner mutation append helpers with stable action names
- `forge/tests/status.test.ts` - cover canonical planner contract generation
- `forge/tests/task-promotion.test.ts` - cover deterministic queue and phase selection
- `forge/tests/phase-completion.test.ts` - cover contract-backed completion and promotion

### Changes

- Create `qor/contracts/forge-planner.ts` as the only canonical planner contract for Forge workspace authority.
- Define normalized planner views in the contract:
  - `planner.activePhase`
  - `planner.nextPhase`
  - `planner.queue`
  - `planner.claimed`
  - `planner.quarantine`
  - `planner.progress`
  - `planner.risks`
  - `planner.evidence`
  - `projects`
  - `ledger`
- Move all active-phase fallback rules into shared selectors exported from the workspace contract layer.
- Keep task lifecycle normalization sourced from `qor/contracts/task-lifecycle.ts`; do not re-declare state aliases in Forge modules.
- Decompose `forge/src/api/status.ts` so it becomes a small contract-materialization surface instead of a route-shaped derivation file.
- Route `forge/src/api/update-task.ts` through shared mutation helpers:
  - validate transition
  - apply task mutation
  - recompute planner lanes
  - run phase completion
  - append canonical ledger entry
- Keep `forge/src/api/phase-completion.ts` focused on completion and next-phase promotion only; no route formatting.
- Standardize planner mutation actions in `forge/src/governance/ledger.ts`:
  - `claim-task`
  - `complete-task`
  - `block-task`
  - `reopen-task`
  - `complete-phase`
  - `promote-phase`

### Unit Tests

- `qor/contracts/forge-planner.test.ts` - contract emits one stable planner shape from normalized phases and ledger input
- `qor/contracts/forge-planner.test.ts` - blocked work lands only in `planner.quarantine`
- `qor/contracts/forge-planner.test.ts` - claimed work lands only in `planner.claimed`
- `forge/tests/status.test.ts` - first planned phase becomes planner context when no active phase exists
- `forge/tests/task-promotion.test.ts` - existing active phase is never displaced by planned fallback
- `forge/tests/phase-completion.test.ts` - only terminal `done` tasks complete a phase
- `forge/tests/phase-completion.test.ts` - completion promotes exactly one next planned phase

## Phase 2: Materialize the Planner Artifact for Thin Route Read-Through

### Affected Files

- `forge/src/runtime/materialize-planner.ts` - write the canonical planner artifact to disk
- `forge/src/runtime/materialize-planner.test.ts` - verify artifact generation and idempotence
- `forge/state/planner-status.json` - authoritative serialized planner artifact served by adapters
- `forge/state.json` - reduce to runtime-only summary fields not already present in the planner artifact
- `forge/src/api/status.ts` - write `forge/state/planner-status.json` from workspace authority
- `forge/tests/status.test.ts` - verify artifact contents and minimal summary merge

### Changes

- Add `forge/src/runtime/materialize-planner.ts` to serialize the canonical planner contract to `forge/state/planner-status.json`.
- Make the artifact the single read-through object consumed by zo.space read routes.
- Keep `forge/state.json` limited to runtime-only values:
  - `lastUpdated`
  - `consecutiveCompletions`
  - `lastTaskCompleted`
  - `lastMutationId`
- Make `forge/src/api/status.ts` return the same object it writes to disk so workspace tests and live adapters share one shape.
- Ensure artifact materialization is deterministic:
  - stable field order
  - stable task ordering by ordinal or priority
  - no route-only decoration
- Keep planner artifact generation in the workspace tree, not inside zo.space route code.

### Unit Tests

- `forge/src/runtime/materialize-planner.test.ts` - repeated materialization produces identical planner JSON from identical input
- `forge/src/runtime/materialize-planner.test.ts` - artifact includes `planner`, `projects`, and `ledger`
- `forge/tests/status.test.ts` - `forge/state.json` runtime fields merge without overriding planner truth
- `forge/tests/status.test.ts` - planner artifact remains valid when no active phase exists and fallback promotion is used

## Phase 3: Convert zo.space to Thin Adapters

### Affected Files

- zo.space route `/api/forge/status` - replace inline planner derivation with read-through from `forge/state/planner-status.json`
- zo.space route `/api/forge/update-task` - replace route-local mutation logic with a thin adapter over workspace mutation outputs
- zo.space route `/api/forge/create-phase` - call workspace-backed phase creation and return canonical planner fields
- zo.space route `/api/forge/update-risk` - call workspace-backed risk mutation and return canonical planner fields
- zo.space route `/api/forge/record-evidence` - append evidence through workspace helper output, not route-local formatting
- `/qor` - consume planner fields from the authoritative adapter response only
- `/qor/forge` - consume `planner.queue`, `planner.claimed`, and `planner.quarantine` without route-local fallback logic
- `/qor/victor` - consume planner-owned execution lineage fields without re-deriving queue state
- `forge/tests/status.test.ts` - verify route consumers match the authoritative field names

### Changes

- Replace the inline `/api/forge/status` route logic with a thin adapter that only:
  - reads `forge/state/planner-status.json`
  - returns the parsed contract
  - reports a clear 503 when the artifact is missing
- Replace route-local write logic with thin mutation adapters that only:
  - validate auth
  - validate request shape
  - call the workspace-backed mutation path
  - return the updated canonical planner contract or stable mutation receipt
- Remove planner derivation, queue heuristics, and ledger formatting from zo.space routes.
- Update `/qor`, `/qor/forge`, and `/qor/victor` to consume authoritative field names from the adapter response without local planner recomputation.
- Keep all route edits within adapter scope only; no UI redesign is included in this plan.

### Unit Tests

- route verification for `/api/forge/status` - returns the serialized planner artifact without inline planner derivation
- route verification for `/api/forge/update-task` - response fields match the workspace mutation contract
- route verification for `/qor` - consumes planner summary fields directly from the authoritative adapter
- route verification for `/qor/forge` - queue, claimed, and quarantine lanes map one-to-one from the authoritative planner contract
- route verification for `/qor/victor` - execution lineage fields are rendered without route-local queue fallback
