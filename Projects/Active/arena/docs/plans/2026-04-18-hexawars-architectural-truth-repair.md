# Plan: HexaWars Architectural Truth Repair

## Open Questions

- Test-only namespace location: `src/testing/` vs `tests/fixtures/`
- Whether `docs/META_LEDGER.md` continuity repair should happen in this pass or the immediately following ledger-specific pass

## Phase 1: Restore Blueprint Truth

### Affected Files

- `docs/CONCEPT.md` - add the missing blueprint companion with current scope and anti-goals
- `docs/ARCHITECTURE_PLAN.md` - align the documented runtime with the actual intended service shape
- `docs/SHADOW_GENOME.md` - record the duplicated-runtime and reverse-dependency failure pattern
- `.agent/staging/AUDIT_REPORT.md` - remains the governing constraint for this plan, not edited in this phase

### Changes

Create `docs/CONCEPT.md` as a short product statement for the arena project: external-only BYOA competition, current Scope-1 baseline, and the fact that demo UI work exists but is not the objective of this remediation plan. Keep anti-goals explicit: no new matchmaking features, no new UI feature work, no ranking expansion.

Rewrite the affected sections of `docs/ARCHITECTURE_PLAN.md` so the build path is honest. State that `src/matchmaker/*` is the only canonical runtime pairing domain, router state is read-only with respect to matchmaking status, and test-only harness modules do not belong to the service runtime surface.

Add a remediation entry to `docs/SHADOW_GENOME.md` describing the exact failure mode: duplicated matchmaker domains, matchmaker importing router state, and runtime claims polluted by test-fed modules. Describe the repair as structural separation, not behavioral expansion.

### Unit Tests

- `tests/smoke.test.ts` - verify the documented boot path still matches the service entry after blueprint alignment
- `tests/shared-types.test.ts` - verify shared contracts remain stable while docs and runtime boundaries are clarified

## Phase 2: Canonicalize Runtime Matchmaker Status

### Affected Files

- `src/matchmaker/status.ts` - add a tiny runtime status holder for pairing timestamps
- `src/matchmaker/loop.ts` - replace router dependency with status dependency injection or direct status module use
- `src/server.ts` - instantiate the canonical queue, presence, and runtime status objects and wire them once
- `src/router.ts` - consume runtime status without owning mutable matchmaker state
- `tests/matchmaker/loop.test.ts` - verify pair execution updates runtime status without HTTP coupling
- `tests/router/matchmaker-status.test.ts` - verify status route reflects runtime state from the new source of truth
- `tests/matchmaker/integration.test.ts` - replace router-coupled assertions with runtime-status assertions

### Changes

Add `src/matchmaker/status.ts` as the single source of truth for `lastPairAt`. Keep it minimal: one value object or tiny mutable holder with explicit read/write methods. No HTTP imports, no queue ownership, no telemetry concerns beyond matchmaker status.

Update `src/matchmaker/loop.ts` so it no longer imports `recordPair` from `src/router.ts`. The loop should update runtime status through the new status module or a status collaborator passed from `src/server.ts`.

Update `src/server.ts` to create one queue, one presence tracker, and one runtime status object, then pass them into both `startMatchmaker(...)` and `mount(...)`. This makes boot wiring explicit and removes the reverse layering edge.

Remove router-owned mutable matchmaking state from `src/router.ts`. The router should read queue size, presence count, and `lastPairAt` from injected collaborators only. No matchmaker-to-router imports remain after this phase.

### Unit Tests

- `tests/matchmaker/loop.test.ts` - verify a successful pair updates runtime status exactly once
- `tests/router/matchmaker-status.test.ts` - verify route output is driven by injected runtime status, queue, and presence collaborators
- `tests/matchmaker/integration.test.ts` - verify the integration path no longer imports router helpers
- `tests/smoke.test.ts` - verify the service boots with the new status module in the canonical path

## Phase 3: Remove Runtime Claim Pollution

### Affected Files

- `src/orchestrator/matchmaker.ts` - move to the chosen test-only namespace or delete if superseded during extraction
- `src/orchestrator/match-runner.ts` - move to the chosen test-only namespace
- `src/runner/runner.ts` - move to the chosen test-only namespace unless promoted by a separate approved plan
- `src/agents/runner.ts` - move to the chosen test-only namespace unless promoted by a separate approved plan
- `src/public/keyboard.js` - move out of runtime assets into the chosen test/demo-only namespace
- `tests/orchestrator/matchmaker.test.ts` - repoint imports to the explicit test-only namespace
- `tests/engine/matchmaker.test.ts` - repoint imports to the explicit test-only namespace
- `tests/runner/*.test.ts` - repoint imports to the explicit test-only namespace

### Changes

Move useful non-runtime modules into an explicit test-only namespace so the runtime surface becomes truthful without deleting harness value. Preserve behavior; change ownership and import paths. The destination namespace must make it impossible to mistake these modules for service runtime.

Remove `src/public/keyboard.js` from runtime asset claims by moving it beside the other test/demo-only utilities. Do not wire it into the shipped arena surface in this pass.

Update tests to import from the explicit test-only namespace. The runtime build path after this phase should be explainable directly from `src/server.ts` without exceptions for test-fed modules.

Keep this phase structural. Do not introduce new runtime responsibilities, new routes, or new public UI behavior while performing the move.

### Unit Tests

- `tests/orchestrator/matchmaker.test.ts` - verify relocated harness behavior remains intact under the test-only namespace
- `tests/engine/matchmaker.test.ts` - verify legacy matchmaker-oriented expectations still run against the relocated fixture path
- `tests/runner/runner.test.ts` - verify runner fixture behavior survives path relocation
- `tests/smoke.test.ts` - verify runtime boot no longer depends on any relocated module
