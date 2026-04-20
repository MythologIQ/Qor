# Plan: HexaWars Arena Remediation + Phase 2 Unblock

## Open Questions

- `docs/CONCEPT.md` scope: keep it as a concise product statement plus anti-goals, or mirror the fuller long-term vision summary
- Demo UI follow-up stays out of this plan except for documenting the current surface as canonical baseline
- Test-only harness namespace: `tests/fixtures/` vs `src/testing/` can be chosen during implementation as long as nothing non-runtime remains on the service build path

## Phase 1: Restore Blueprint Truth

### Affected Files

- `docs/CONCEPT.md` - restore the required blueprint document with current product purpose, anti-goals, and Phase 2 boundary
- `docs/ARCHITECTURE_PLAN.md` - align active baseline with real runtime and deployed UI state
- `docs/META_LEDGER.md` - repair locally traceable chain continuity for latest entries
- `docs/SHADOW_GENOME.md` - add the remediation pattern entry that corresponds to the veto causes
- `.agent/staging/AUDIT_REPORT.md` - preserve veto findings as the input constraint for implementation

### Changes

Create `docs/CONCEPT.md` as the missing blueprint companion. Keep it short: product summary, current scope, non-goals, and the statement that demo/layout work is part of the current arena baseline but not the objective of this remediation plan.

Rewrite the affected sections of `docs/ARCHITECTURE_PLAN.md` so they describe the repo as it should exist after remediation:
- `src/matchmaker/*` is the only canonical runtime pairing path
- UI/demo work is acknowledged as current baseline
- non-runtime harness code is explicitly excluded from service entry paths
- Phase 2 unblock is defined as architectural cleanup plus identity route continuity, not new feature expansion

Repair `docs/META_LEDGER.md` so every visible entry has a locally traceable `prev_hash` chain. If a broken entry cannot be proven, replace that segment with a corrective ledger entry rather than leaving ambiguous continuity.

Record the architectural failure mode in `docs/SHADOW_GENOME.md`: duplicate runtime domains, reverse router dependency, orphaned test-fed modules, and blueprint drift.

### Unit Tests

- `tests/smoke.test.ts` - verify the documented runtime entry still boots after blueprint-driven cleanup
- `tests/shared-types.test.ts` - verify shared contracts named in the blueprint remain the single source of truth

## Phase 2: Canonicalize Runtime Matchmaking

### Affected Files

- `src/server.ts` - boot only canonical runtime modules and inject cross-cutting seams explicitly
- `src/router.ts` - remove matchmaker-owned state and router-owned telemetry side effects
- `src/matchmaker/loop.ts` - stop importing from router; depend only on injected collaborators
- `src/matchmaker/queue.ts` - remain the queue source used by runtime and tests
- `src/matchmaker/presence.ts` - remain the presence source used by runtime and tests
- `src/matchmaker/types.ts` - hold pairing contracts without HTTP concerns
- `src/matchmaker/pair.ts` - keep pure pairing selection logic
- `src/orchestrator/matchmaker.ts` - delete or move to test-only namespace; no runtime duplication
- `src/orchestrator/match-runner.ts` - move to test-only namespace or split into smaller runtime-free fixtures
- `src/runner/runner.ts` - move to test-only namespace if still useful
- `src/agents/runner.ts` - move to test-only namespace if still useful
- `src/public/keyboard.js` - either connect to the live page explicitly or move beside test/demo-only assets

### Changes

Make `src/matchmaker/*` the sole runtime pairing domain. Introduce a tiny runtime seam for pairing telemetry, owned outside the router, so `startMatchmaker()` receives `onPair` and optional status recorder via dependency injection. The router becomes a reader of runtime state, not a writer invoked by the matchmaker.

Remove `recordPair()` and `getLastPairAt()` from `src/router.ts`. Replace them with a narrowly scoped runtime status module or closure-owned state passed from `server.ts` into both router and matchmaker.

Delete runtime duplication in `src/orchestrator/matchmaker.ts`. If parts of that file still matter for harnessing, move them under a clearly non-runtime namespace and rename them accordingly.

Move test-fed non-runtime modules out of `src/` runtime paths unless they are imported by `server.ts`. Tests should import fixtures from an explicit testing namespace, not from misleading runtime locations.

Resolve the `src/public/keyboard.js` orphan honestly: wire it into `src/public/arena.js` if it is part of the live surface, otherwise move it out of the runtime asset set.

### Unit Tests

- `tests/orchestrator/matchmaker.test.ts` or replacement fixture test - verify moved harness logic still behaves the same outside the runtime path
- `tests/router/matches-routes.test.ts` - verify router status/read routes observe runtime state without owning pairing side effects
- `tests/smoke.test.ts` - verify service boot path imports no orphan runtime modules
- `tests/public/*` relevant suite - verify any retained keyboard/live asset is actually referenced by the shipped page

## Phase 3: Enforce Razor Limits and Re-open Phase 2

### Affected Files

- `src/public/demo-replay.js` - split into board playback, timeline state, and presentation modules under the file ceiling
- `src/orchestrator/match-runner.ts` or its moved fixture successor - split large routines into small pure steps or retire from runtime scope
- `tests/router/operator-routes.test.ts` - split by route family so the test file stays under the ceiling
- `src/identity/operator.ts` - confirm Phase 2 identity path stays within file/function budgets after remediation
- `src/identity/agent-version.ts` - confirm fingerprint/model capture path remains well-bounded
- `src/identity/rate-limit.ts` - keep limiter logic small and runtime-local
- `.agent/staging/AUDIT_REPORT.md` - replace veto with pass only after all ceilings and build-path claims are true

### Changes

Bring all load-bearing files and functions back under Section 4 ceilings. Prefer extraction into pure modules over helper accretion. `demo-replay.js` should separate replay data, animation state, and DOM rendering. Large harness logic that is not part of runtime should either move fully into test fixtures or be split into narrow pure utilities.

Once the build path is honest and Razor-compliant, complete the minimum Phase 2 unblock pass:
- keep `POST /api/arena/operators` and `POST /api/arena/agent-versions` on the cleaned router surface
- preserve first-class `model_id` capture
- keep rate limiting, handle normalization, and token verification on the identity boundary
- ensure no Phase 2 module depends on demo UI or matchmaker internals

Update `docs/ARCHITECTURE_PLAN.md` Razor Budget and Phase status so the blueprint matches the repaired codebase, then re-run tribunal and substantiation against the corrected baseline.

### Unit Tests

- `tests/router/operator-routes.test.ts` and split successors - verify operator registration, collision handling, auth, and `modelId` validation on the cleaned route surface
- `tests/identity/*` - verify token issuance, token lookup, fingerprint determinism, and similarity advisory behavior remain intact after file splits
- `tests/public/*` relevant suite - verify demo replay still renders after modularization
- `tests/smoke.test.ts` - verify the full service boots with canonical runtime wiring and cleaned asset imports
