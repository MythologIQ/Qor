# Plan: Forge Planner API-First Consolidation

## Open Questions

- `planner.claimed` should include in-flight task detail, not just counts, so `/qor/victor` and `/qor/forge` can show execution lineage without inventing route-local joins.
- Victor runtime execution reads `/api/forge/status` as planner truth; direct file reads remain test-only helper behavior and should not remain in the runtime heartbeat path.

## Phase 1: Forge Planner Truth

### Affected Files

- `forge/src/api/status.ts` - make the Forge status route the canonical planner read model
- `forge/src/projects/task-promotion.ts` - centralize planner selectors and queue eligibility rules
- `forge/src/api/phase-completion.ts` - complete and promote phases from normalized planner state only
- `forge/src/api/update-task.ts` - route task mutations through shared planner selectors and lifecycle transitions
- `.qore/projects/builder-console/path/phases.json` - normalize the active/planned boundary for the current queue
- `forge/tests/status.test.ts` - cover planner queue, claimed lane, and quarantine lane
- `forge/tests/task-promotion.test.ts` - cover deterministic active-phase and next-task selection
- `forge/tests/phase-completion.test.ts` - cover completion and promotion from normalized planner state

### Changes

- Reshape `forge/src/api/status.ts` around one canonical planner object:
  - `planner.activePhase`
  - `planner.nextPhase`
  - `planner.queue`
  - `planner.claimed`
  - `planner.quarantine`
  - `planner.progress`
  - `planner.risks`
  - `planner.evidence`
- Keep `projects` and `ledger` as separate top-level views, but make all queue and phase truth come from `planner`.
- Move active-phase selection into shared planner selectors:
  - prefer `active` and `in-progress`
  - fall back to the lowest-ordinal `planned` phase
- Make queue eligibility deterministic:
  - `planned` tasks are claimable
  - `claimed` tasks move to `planner.claimed`
  - `blocked` tasks move to `planner.quarantine`
  - `done` tasks are terminal and excluded from queue lanes
- Remove duplicate queue derivation and status heuristics from route-local code in `status.ts`.
- Make `update-task.ts` mutate tasks, run phase completion, and append ledger entries through the shared planner helpers instead of mixing route-local planner logic with lifecycle normalization.
- Make `phase-completion.ts` promote exactly one next planned phase after completion and never treat blocked work as phase-complete.
- Apply the one-time data correction in `.qore/projects/builder-console/path/phases.json` so the first planned phase becomes the current active planner context if none is active.

### Unit Tests

- `forge/tests/status.test.ts` - status returns `planner.activePhase`, `planner.queue`, `planner.claimed`, and `planner.quarantine`
- `forge/tests/status.test.ts` - blocked tasks are excluded from `planner.queue` and exposed under `planner.quarantine`
- `forge/tests/status.test.ts` - claimed tasks are excluded from `planner.queue` and exposed under `planner.claimed`
- `forge/tests/task-promotion.test.ts` - first planned phase becomes active when no active phase exists
- `forge/tests/task-promotion.test.ts` - an existing active phase is never displaced by planned fallback
- `forge/tests/phase-completion.test.ts` - a phase completes only when all tasks are terminal `done`
- `forge/tests/phase-completion.test.ts` - completion promotes only the next planned phase by ordinal

## Phase 2: Victor API-First Consumption

### Affected Files

- `victor/src/heartbeat/forge-queue.ts` - consume `/api/forge/status` planner views for runtime queue reads
- `victor/src/heartbeat/mod.ts` - derive Forge tasks from API planner truth before lifecycle fallback
- `victor/src/heartbeat/forge-writeback.ts` - keep write-back aligned to planner lifecycle transitions and route contract
- `victor/tests/forge-queue.test.ts` - cover API-first queue reads and lane filtering
- `victor/tests/heartbeat.test.ts` - cover Forge-first derivation from planner API responses
- `victor/tests/forge-writeback.test.ts` - cover write-back payloads against planner lifecycle expectations

### Changes

- Split `forge-queue.ts` into two concerns:
  - parse planner truth from `/api/forge/status`
  - keep file-based phase parsing as a test helper only
- Make runtime queue selection consume `planner.queue` from the Forge API contract instead of reading raw phase files.
- Keep Victor unaware of Forge’s raw filesystem structure at runtime.
- Map planner queue entries to Victor task shape without local status heuristics:
  - `id`
  - `title`
  - `description`
  - `urgency`
  - `source`
- Make `mod.ts` prefer planner API truth first, then fall back to lifecycle derivation only when `planner.queue` is empty.
- Keep blocked work out of Victor execution selection; quarantined items remain visible for later remediation analysis but do not become executable queue items in this plan.
- Keep `forge-writeback.ts` aligned with the shared lifecycle contract so claim and completion writes use route-supported transition states only.

### Unit Tests

- `victor/tests/forge-queue.test.ts` - API planner queue returns the first claimable Forge task
- `victor/tests/forge-queue.test.ts` - claimed and quarantined tasks are excluded from Victor queue selection
- `victor/tests/forge-queue.test.ts` - empty `planner.queue` yields no Forge task without crashing
- `victor/tests/heartbeat.test.ts` - heartbeat returns Forge-derived work when `planner.queue` has claimable tasks
- `victor/tests/heartbeat.test.ts` - heartbeat falls back to lifecycle derivation when `planner.queue` is empty
- `victor/tests/forge-writeback.test.ts` - claim and completion payloads use lifecycle-valid transitions

## Phase 3: Visible Planner Contract on `/qor`, `/qor/forge`, and `/qor/victor`

### Affected Files

- zo.space route `/api/forge/status` - expose the final planner contract consumed by page routes
- zo.space route `/qor` - reflect planner summary from the canonical Forge status contract
- zo.space route `/qor/forge` - render queue, claimed, and quarantine lanes from the canonical planner contract
- zo.space route `/qor/victor` - render Victor execution lineage against planner-owned queue truth
- `forge/src/api/status.ts` - provide stable planner field names for route consumers

### Changes

- Update `/qor` to read planner summary from `/api/forge/status` without recomputing active work in the page route.
- Update `/qor/forge` to present three distinct lanes from the API contract:
  - claimable queue
  - claimed/in-flight work
  - quarantine/blocked work
- Update `/qor/victor` to show execution lineage that is planner-aware:
  - current claimed task
  - last completed Forge task
  - execution status
  - streak or recent run summary if already present
- Keep these page changes data-contract focused:
  - no shell redesign
  - no new navigation model
  - no unrelated UI sweep
- Make all three routes consume the same planner field names so the read model stays visible and testable.

### Unit Tests

- route verification for `/api/forge/status` - response includes `planner.queue`, `planner.claimed`, and `planner.quarantine`
- route verification for `/qor` - dashboard reads planner summary without route-local fallback logic
- route verification for `/qor/forge` - queue, claimed, and quarantine sections all render from API data
- route verification for `/qor/victor` - current execution lineage renders from planner-aware Victor state
- end-to-end verification - a claimed Forge task appears in `/qor/forge` claimed lane and in Victor execution context after refresh
