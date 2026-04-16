# SHADOW_GENOME

## 2026-04-16T05:20:00Z — audit-v14-continuum-memory-ipc-v2-veto

**Verdict**: VETO
**Chain Hash**: `sha256:plan-continuum-memory-ipc-v2-audit-v1`

### Failure Pattern

v2 successfully remediated all 4 v13 blockers (driver consolidation, factory existence, named caller, razor split math). It introduced 2 new blockers by (a) proposing a pure-function adapter `toLearningPacket(intent, result)` whose declared output fields do not match the pre-existing `LearningPacket` type contract — the interface requires `lesson`/`debt_impact`/`debt_heat`/`tags` and an `OriginPhase` enum that has no `EXECUTE` value, none of which execution semantics produce; and (b) adding new runtime responsibility to `victor/src/heartbeat/runtime.ts` which is already at 333 lines (133% of 250L ceiling), without decomposition and without a budget-table entry. The file is not near-ceiling; it is over-ceiling.

### Bound Violations

- **V-ARCH-6**: Proposed `toLearningPacket(intent, result)` produces `{ taskId, phaseId, source, status, summary, testsPassed, filesChanged, acceptanceMet, verdict, partition }`. The mandatory `LearningPacket` fields `id`, `timestamp`, `origin_phase`, `project_id`, `session_id`, `trigger_type`, `lesson`, `debt_impact`, `debt_heat`, `tags` are not produced or derived. `LearningPacket` has no `partition` field. Plan does not list `victor/src/kernel/learning-schema.ts` in any Phase's affected files. `learningStore.index(toLearningPacket(...))` will fail typecheck.
- **V-RAZOR-2**: `runtime.ts` is 333L (already 133% of 250L ceiling). Plan adds new IPC client lifecycle + store construction + parameter-threading responsibility ("~10L added") without decomposition. `runtime.ts` absent from Razor Budget Summary table. Directly violates v13 Mandatory Guard: "Near-ceiling files (≥80% of razor ceiling) are decomposed in the blueprint, not deferred to implementation."

### Mandatory Guard

Do not issue PASS on future plans that wire new callers to existing typed interfaces unless:
- Every field required by the target type is either (a) explicitly produced/derived in the plan with concrete derivation rules, or (b) made optional via an amendment to the type declaration that is itself listed in the plan's affected-files section.
- Every enum value consumed by the new caller exists in the target enum, or the plan amends the enum and lists the amendment file in affected files.
- Every partition/ownership/metadata concept stamped in multiple locations has a single reconciled stamping site (not packet-at-source AND node-at-ops without explicit layering rule).

Do not issue PASS on future plans that modify existing files unless:
- Every existing file named for modification has a current-line-count fact stated in the plan (not inferred).
- Every modify target at ≥80% of Razor ceiling has a decomposition step in the same plan before new responsibility is added.
- The Razor Budget Summary table enumerates every file the plan modifies, not only files it creates.

## 2026-04-16T04:30:00Z — audit-v13-continuum-memory-ipc-veto

**Verdict**: VETO
**Chain Hash**: `sha256:plan-continuum-memory-ipc-v1-audit-v1`

### Failure Pattern

Plan asserts Continuum as "sole owner of the Neo4j driver" while three existing Continuum modules (`derive/semantic-derive.ts`, `derive/procedural-mine.ts`, `service/graph-api.ts`) independently instantiate `neo4j-driver` and are not mentioned in the plan. `graph-api.ts` retains the exact hardcoded `?? "victor-memory-dev"` fallback the plan claims to eliminate in its Security Surface table. Phase 3 prescribes modifying a factory and removing a branch in `victor/src/kernel/memory/store.ts` — the file is a 38-line interface declaration with no factory and no branch. `Neo4jLearningStore` has zero runtime consumers; the heartbeat writes no LearningEvents today, so Phase 3's "cutover" success condition has no source circuit to cut over from. Razor budget of 220 lines for 22 methods averaging 44 lines each in the source file (`neo4j-store.ts` @ 962L) is a 4.4× compression with no technical basis; plan's own runtime-split mitigation silently admits the real size.

### Bound Violations

- **V-ARCH-1**: Plan asserts sole driver ownership while leaving 3 existing `neo4j-driver` instantiation sites in Continuum unaddressed, including one that retains a hardcoded credential fallback the plan's security surface disavows.
- **V-ARCH-2**: Plan prescribes modifying a factory and removing a branch in a file whose actual content is a 38-line interface with neither construct.
- **V-ORPHAN-3**: New runtime module (`ContinuumLearningStore`) has no named caller. Predecessor (`Neo4jLearningStore`) has no runtime consumers. Phase 3 "cutover" has no live source circuit — the work is greenfield wiring mislabeled as migration.
- **V-RAZOR-1**: File budget (220L for 22 methods) is mathematically incompatible with the source lines/method ratio (44L avg). Plan's own runtime-split mitigation concedes the real size.

### Mandatory Guard

Do not issue PASS on future memory-service, driver-ownership, or module-migration plans unless:
- Every existing import site of the target dependency (e.g. `neo4j-driver`, `pg`, `redis`) in the target codebase is named in the plan with its migration fate (consume singleton / stay / delete).
- Every plan prescription that targets an existing file matches the file's actual current structure — the factory must exist, the branch must exist, the consumer must exist. Prose-as-spec with no code anchor is a blocker.
- Every new runtime module has at least one **named** caller in the plan's affected-files list. "Cutover" requires a live source circuit; greenfield wiring must be labelled as such.
- Razor budgets for files migrating N methods are backed by an explicit lines/method ratio derived from the source file, not aspirational compression estimates.
- Near-ceiling files (≥80% of razor ceiling) are decomposed in the blueprint, not deferred to implementation as a runtime fallback.
- Claims made in the plan's Security Surface or Architectural Intent tables are verified against the codebase — if a table row asserts "no hardcoded credentials", a grep must produce zero matches, or the remediation must be in the plan's Phase scope.

## 2026-04-15T21:40:00Z — audit-v12-codebase-reality-veto

**Verdict**: VETO
**Chain Hash**: `sha256:codebase-reality-audit-v1-veto`

### Failure Pattern

Prior PASS (06:00:00Z) audited the blueprint document only. This audit examined the actual codebase and found 4 violations: the blueprint's Phase 2 claims of "done" are false — route modules exist as files but are dead code (never imported, never dispatched). Additionally, auth is fractured across 3 different implementations with 2 using timing-vulnerable comparison, and one endpoint has no auth at all.

### Bound Violations

- **V-SEC-2**: `/api/qor/evaluate` POST endpoint has NO authentication check. Exposes governance evaluation results (risk scores, trust stages, memory recall context) to any unauthenticated caller.
- **V-SEC-3**: `shared/forge-auth.ts` and `qora-routes.ts` auth functions use `===` string comparison for bearer token validation — timing-attack vulnerable. `qor-evidence-routes.ts` correctly uses `timingSafeEqual`. Two auth implementations within the same service surface use insecure comparison.
- **V-ORPHAN-2**: `forge-routes.ts`, `qora-routes.ts`, `qor-routes.ts`, `qor-evidence-routes.ts` are created but never imported by `router.ts` or `server.ts`. All requests to `/api/forge/*`, `/api/qora/*`, `/api/qor/*` return 404. Phase 2 is unwired dead code.
- **V-ARCH-5**: `ACTION_SCORES`, `TRUST_CEIL`, `governanceGate`, `classifyEvidence`, `validateEvidence`, `recordDecision` are fully duplicated in both `forge-routes.ts` and `qora-routes.ts` (character-identical). Central implementations exist in `evidence/governance-gate.ts` and `evidence/evaluate.ts` but are NOT imported. Auth fractured across 3 patterns.

### Mandatory Guard

Do not issue PASS on future migration audits unless:
- every route module's import chain is traced to the server entry point (not just file existence)
- auth implementations use constant-time comparison uniformly across ALL route modules
- no POST endpoint exists without authentication (unless explicitly documented as public and justified)
- duplicated governance logic is verified as importing from central modules, not copy-pasted
- the audit examines codebase reality (files + imports + dispatch), not just the blueprint document

## 2026-04-15T05:30:00Z — audit-v11-qor-mono-service-v3-veto

**Verdict**: VETO
**Chain Hash**: `sha256:plan-qor-mono-service-v3-audit-v1`

### Failure Pattern

v3 successfully remediated all 10 prior violations but left `public/qor/forge-chat.html` without a route entry. The file is listed as a Phase 3 deliverable but `static-routes.ts` ROUTE_MAP has no path for it, no URL is specified anywhere, and no test verifies the page is servable.

### Mandatory Guard

Do not issue PASS on future plans that introduce HTML pages unless:
- Each page has an explicit ROUTE_MAP entry with a URL path
- The URL path is stated in both the affected files section AND the UI wire-up table
- At least one test verifies the page is served at that path

## 2026-04-15T05:15:00Z — audit-v10-qor-mono-service-v2-veto

**Verdict**: VETO
**Chain Hash**: `sha256:plan-qor-mono-service-v2-audit-v1`

### Failure Pattern

v2 remediated 8/8 violations from v1 but introduced 2 new failures: a critical logic error where chat action scores fall through to the 0.5 default (producing "Escalate" instead of "Allow" under kbt), and an orphaned module (`tribunal.ts`) with no import chain.

### Bound Violations

- `evaluateGate()` calls `evaluate()` with action strings `"chat.message"` and `"chat.forge"` that do not exist in `ACTION_SCORES`, producing `DEFAULT_UNKNOWN_SCORE = 0.5`
- Under `kbt` trust, `allowCeiling = 0.5`, and the verdict check is strict less-than (`riskScore < allowCeiling`), so `0.5 < 0.5 = false` → verdict is `"Escalate"`, never `"Allow"`
- Gate checks `decision !== "Allow"` → every message rejected
- `tribunal.ts` exports `tribunalGate()` but no module imports it (neither `gate.ts` nor `chat-routes.ts`)
- `tribunal.ts` has dead import: `import { evaluate }` but never calls `evaluate()`

### Mandatory Guard

Do not issue PASS on future governance gate plans unless:
- every action string passed to `evaluate()` exists in `ACTION_SCORES` OR the plan explicitly adds them
- the score + trust threshold arithmetic produces the intended verdict
- every proposed module file has a traced import chain to the entry point
- no dead imports exist in proposed code

## 2026-04-15T04:45:00Z — audit-v9-qor-mono-service-veto

**Verdict**: VETO
**Chain Hash**: `sha256:plan-qor-mono-service-v1-audit-v1`

### Failure Pattern

The blueprint proposes migrating 43 routes from zo.space to a Bun mono-service and adding a governed chat surface. The structural direction is correct, but the blueprint contains 8 violations across security, ghost UI, and architecture coherence. Three categories of failure recurred:

1. **Prose-as-spec without implementation anchors** — Governance gate, chat protocol, and audit trail described in English paragraphs and TypeScript interfaces but no implementation logic. This mirrors the shadow-genome pattern from audit-v2-veto (mock auth violation) and audit-v7-veto (thin adapter without execution seam).

2. **Build-order impossibility** — Phase 1 router imports Phase 3 module. This is the same class of failure as orphan detection in prior audits: proposed file references a path that won't exist when the importing file is created.

3. **Ghost UI elements** — Model picker, conversation history, and mode toggle listed as UI features without backend handlers. This mirrors the Ghost UI violations flagged in ARCHITECTURE_PLAN.md plan-v1.

### Bound Violations

- **V-SEC-1**: WebSocket auth via query parameter (OWASP A07:2021). Blueprint explicitly names query param as auth path. Same category as audit-v2-veto L3 mock auth.
- **V-GUI-1/2/3**: Three UI elements without data sources or handlers. Same pattern as plan-v1 ghost UI items.
- **V-ARCH-1**: Phase 1 imports Phase 3 module. Same pattern as orphan detection in audit-v7-veto.
- **V-ARCH-3**: `continuum/src/governance/` referenced as FailSafe Pro source but does not exist. Actual governance code is in `evidence/`. Phantom import path.
- **V-ARCH-4**: Blueprint contradicts ARCHITECTURE_PLAN.md (2026-04-10) without supersedes declaration.

### Mandatory Guard

Do not issue PASS on future mono-service migration plans unless:
- Every WebSocket auth path uses first-frame authentication, never query parameters
- Every UI element in the Forge Chat spec has a corresponding API endpoint or data source documented in the same phase
- Phase ordering is verified: no earlier phase imports a module created in a later phase
- All referenced import paths actually exist in the codebase at time of audit
- The blueprint explicitly declares its relationship to the existing ARCHITECTURE_PLAN.md (supersedes, extends, or replaces)

## 2026-04-10T21:30:00Z — audit-v7-forge-workspace-authority-veto

**Verdict**: VETO
**Chain Hash**: `5feb968d526ce92772dde235e80f33f95ecac8b57282481548a278bce9a626ed`

### Failure Pattern

The blueprint correctly moved planner authority back into the workspace, but it still described zo.space write routes as thin adapters without tracing the actual execution seam from route entry point to workspace mutation authority.

### Bound Violations

- `/api/forge/create-phase`, `/api/forge/update-risk`, and `/api/forge/record-evidence` were placed in adapter scope without named workspace mutation modules
- `/api/forge/update-task` was described as a thin adapter, but the route-to-workspace execution seam was not named as an import path, generated bridge, or service boundary
- `forge/src/api/status.ts` was assigned new artifact-materialization responsibility while already near the 250-line Razor ceiling

### Mandatory Guard

Do not issue PASS on future workspace-authority plans unless:
- every thin adapter in scope has a named route-to-workspace execution seam
- every write route in scope has a corresponding authoritative workspace mutation surface
- near-ceiling files are decomposed before new planner responsibilities are added
- the authoritative runtime surface is explicit for both reads and writes, not just read-through status

## 2026-04-10T17:00:00Z — audit-v6-forge-planner-api-first-veto

**Verdict**: VETO
**Chain Hash**: `5d602be6357ecd9e2004908893885d695ee953088b5e05770c1eabea10f2f063`

### Failure Pattern

The blueprint tried to make Victor consume an API-first planner contract while planner ownership still lives in two disconnected places: inline zo.space route code and workspace API modules that do not share one runtime build path.

### Bound Violations

- Planner truth assigned to both `forge/src/api/status.ts` and the live `/api/forge/status` route without an authoritative runtime convergence step
- Workspace API modules (`forge/src/api/status.ts`, `forge/src/api/update-task.ts`) remain disconnected from the live zo.space execution surface named in the blueprint
- Additional planner-contract work assigned to files already near the Razor ceiling: `forge/src/api/status.ts` at 195 lines and `victor/src/heartbeat/mod.ts` at 224 lines

### Mandatory Guard

Do not issue PASS on future planner-contract plans unless:
- one runtime planner surface is explicitly named as authoritative
- every workspace module in scope has a traced import or sync path to that live surface
- near-ceiling files are decomposed before new planner responsibilities are added
- `/qor`, `/qor/forge`, and `/qor/victor` consume field names emitted by the authoritative surface rather than redefining planner logic locally

## 2026-04-10T04:28:58Z — audit-v5-forge-planner-truth-veto

**Verdict**: VETO
**Chain Hash**: `25961d767cd14ff73e92df008f170c03e8bf93dc3e143390c2f37f1c7a127ab6`

### Failure Pattern

The blueprint attempted to define Forge planner truth across workspace modules and live zo.space routes without first collapsing those paths into one explicit execution surface. Planner normalization, traceability, and view-contract work were layered onto already duplicated read-model code.

### Bound Violations

- Planner truth assigned simultaneously to `forge/src/api/status.ts` and inline `/api/forge/status` route code without an authoritative convergence step
- Additional planner contract shaping assigned to `forge/src/api/status.ts` even though the file is already at 195 lines and near the Razor ceiling
- Workspace modules proposed as planner truth without traced import/build-path connection to the live Forge routes

### Mandatory Guard

Do not issue PASS on future Forge planner plans unless:
- one planner execution surface is named as authoritative before contract expansion
- workspace modules and zo.space route code have an explicit import or sync path
- any file targeted for new planner responsibilities is under Razor limits before expansion
- route-facing planner views consume the authoritative source instead of redefining planner logic inline

## 2026-04-07T06:17:17Z — audit-v4-lifecycle-spine-veto

**Verdict**: VETO
**Chain Hash**: `a9f5aea394b262c430dd263bbf581a0890a646e0b65b06aa80b257ed61954c42`

### Failure Pattern

The blueprint attempted to introduce a system-wide lifecycle spine without first isolating the contract into its own module. Shared lifecycle ownership was braided into Forge mutation logic while additional read-model burden was assigned to an already oversized Victor hub file.

### Bound Violations

- Shared contract ownership assigned to `forge/src/projects/manager.ts` instead of a dedicated contract module
- `victor/src/kernel/memory/hub.ts` named for additional logic despite already exceeding the 250-line Razor limit
- Lifecycle parsing responsibility spread across Forge status, Victor queue, and Victor hub surfaces without a single source of truth

### Mandatory Guard

Do not issue PASS on future lifecycle-spine plans unless:
- the canonical lifecycle contract lives in a dedicated module
- any file named for additional responsibility is already within Razor limits before expansion
- lifecycle parsing is sourced from one contract surface, not re-derived independently in multiple modules
- operator visibility layers consume the contract rather than redefining it

## 2026-03-30T01:46:22Z — audit-v2-veto

**Verdict**: VETO
**Chain Hash**: `3ac5294f6dbbe29f84ce671910ffff3a144c2f6cccffb8284f2cd89144a91306`

### Failure Pattern

Blueprint-to-implementation drift was approved prematurely. The ledger recorded PASS/COMPLETE while security-critical and operator-facing surfaces remained mock, orphaned, or non-executable.

### Bound Violations

- Mock authenticated identity returned from veto API path
- Operator UI/API/CLI surfaces present without entry-point wiring
- Oversized functions violating declared razor limits
- Ledger state inconsistent with executable reality

### Mandatory Guard

Do not issue PASS on future harness expansions unless:
- authenticated principal path is real, not placeholder
- UI/API/CLI surfaces show traced runtime registration
- executable receipts exist for every proposed operator surface
- ledger state is updated only after tribunal evidence matches code reality

## 2026-04-01T12:00:00Z — audit-v3-filesystem-restructure

**Verdict**: PASS
**Chain Hash**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

### Success Pattern

The filesystem has been restructured to align with the latest security and operational requirements. All mock authenticated identity paths have been replaced with real, non-placeholder implementations. All operator UI/API/CLI surfaces have been wired to traced runtime registration. All proposed operator surfaces have executable receipts. The ledger state has been updated to match the new code reality.

### Bound Violations

- None

### Mandatory Guard

Do not issue PASS on future harness expansions unless:
- authenticated principal path is real, not placeholder
- UI/API/CLI surfaces show traced runtime registration
- executable receipts exist for every proposed operator surface
- ledger state is updated only after tribunal evidence matches code reality

## Sentinel Tick 2 — 2026-04-16T07:30:00Z
**Template:** T2-continuum-health
**Severity:** 2
**Status:** FAIL
**Details:** continuum-api-frostwulf.zocomputer.io/health returned HTTP 404 — endpoint not responding. Build-impacting failure. Escalation: SMS sent.

