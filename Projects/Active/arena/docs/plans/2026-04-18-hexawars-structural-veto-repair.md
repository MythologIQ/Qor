# Plan: HexaWars Structural Veto Repair

## Open Questions

- None. The design is locked for this pass: structural repairs only, `tests/fixtures/runtime/` for relocated test-only modules, `src/matchmaker/status.ts` as the runtime status source, ledger repair deferred.

## Phase 1: Restore Blueprint Truth

### Affected Files

- `docs/CONCEPT.md` - add the missing blueprint companion with current product scope and anti-goals
- `docs/ARCHITECTURE_PLAN.md` - align the documented runtime with the intended service shape after this pass
- `docs/SHADOW_GENOME.md` - record the exact failure pattern this plan repairs
- `.agent/staging/AUDIT_REPORT.md` - remains the governing constraint for this pass, not edited here

### Changes

Create `docs/CONCEPT.md` as the missing blueprint companion. Keep it short and load-bearing: HexaWars Arena is an external-only BYOA competition surface, current shipped baseline includes the live and demo UI, and this pass does not add new gameplay, ranking, or UI features.

Rewrite the affected sections of `docs/ARCHITECTURE_PLAN.md` so they describe the runtime truth this pass establishes. `src/matchmaker/*` is the only canonical pairing runtime. `src/router.ts` reads injected runtime collaborators and does not own pairing side effects. Test-only harness code is excluded from the runtime surface.

Add a new remediation entry to `docs/SHADOW_GENOME.md` for the exact failure mode: duplicated matchmaker domains, reverse dependency from matchmaker into router state, and runtime claims polluted by test-fed modules under `src/`.

### Unit Tests

- `tests/smoke.test.ts` - verify the documented service entry path still matches the runtime boot path after blueprint alignment
- `tests/shared-types.test.ts` - verify shared contracts remain stable while docs and runtime boundaries are clarified

## Phase 2: Canonicalize Runtime Matchmaker Status

### Affected Files

- `src/matchmaker/status.ts` - add the tiny runtime status holder for `lastPairAt`
- `src/matchmaker/loop.ts` - remove router imports and depend on runtime status instead
- `src/server.ts` - instantiate queue, presence, and runtime status once and inject them into router and matchmaker
- `src/router.ts` - consume injected runtime status without owning mutable matchmaker state
- `tests/matchmaker/loop.test.ts` - verify a successful pair updates runtime status without HTTP coupling
- `tests/router/matchmaker-status.test.ts` - verify route output reflects injected runtime status
- `tests/matchmaker/integration.test.ts` - verify the integration path no longer depends on router helpers

### Changes

Add `src/matchmaker/status.ts` as the single source of truth for `lastPairAt`. Keep it minimal: explicit read and write operations only, no HTTP concerns, no queue ownership, no telemetry sprawl.

Update `src/matchmaker/loop.ts` so it no longer imports or reaches into `src/router.ts`. Pairing updates runtime status through the new status module or a narrow collaborator created in `src/server.ts`.

Update `src/server.ts` to create one queue, one presence tracker, and one runtime status object, then inject them into both `startMatchmaker(...)` and `mount(...)`. The boot path becomes explicit and the reverse layering edge disappears.

Remove router-owned mutable matchmaking state from `src/router.ts`. The router reads queue size, presence count, and `lastPairAt` from injected collaborators only.

### Unit Tests

- `tests/matchmaker/loop.test.ts` - verify a successful pair updates runtime status exactly once
- `tests/router/matchmaker-status.test.ts` - verify route output is driven by injected runtime status, queue, and presence collaborators
- `tests/matchmaker/integration.test.ts` - verify the integration path no longer imports router helpers
- `tests/smoke.test.ts` - verify the service boots with the new status module in the canonical path

## Phase 3: Remove Runtime Claim Pollution

### Affected Files

- `src/orchestrator/matchmaker.ts` - move to `tests/fixtures/runtime/` or delete if superseded
- `src/orchestrator/match-runner.ts` - move to `tests/fixtures/runtime/`
- `src/runner/runner.ts` - move to `tests/fixtures/runtime/` unless promoted by a later approved runtime plan
- `src/agents/runner.ts` - move to `tests/fixtures/runtime/` unless promoted by a later approved runtime plan
- `src/public/keyboard.js` - move out of runtime assets into `tests/fixtures/runtime/`
- `tests/orchestrator/matchmaker.test.ts` - repoint imports to the explicit fixture namespace
- `tests/engine/matchmaker.test.ts` - repoint imports to the explicit fixture namespace
- `tests/runner/runner.test.ts` - repoint imports to the explicit fixture namespace

### Changes

Move useful non-runtime modules into `tests/fixtures/runtime/` so the runtime surface becomes truthful without deleting harness value. Preserve behavior; change ownership and import paths so the service boot path can be explained directly from `src/server.ts` with no exceptions.

Remove `src/public/keyboard.js` from runtime asset claims by moving it into `tests/fixtures/runtime/`. Do not wire it into the shipped arena surface in this pass.

Update tests to import the relocated fixtures from the explicit test-only namespace. After this phase, any file left under `src/` must be on a real runtime path or a clearly justified shared dependency of that path.

### Unit Tests

- `tests/orchestrator/matchmaker.test.ts` - verify relocated harness behavior remains intact under `tests/fixtures/runtime/`
- `tests/engine/matchmaker.test.ts` - verify legacy matchmaker-oriented expectations still run against the relocated fixture path
- `tests/runner/runner.test.ts` - verify runner fixture behavior survives path relocation
- `tests/smoke.test.ts` - verify runtime boot no longer depends on any relocated module
