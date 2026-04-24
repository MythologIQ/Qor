
## Gate Tribunal Failure — Plan D v2 Phases 3–5 R-A v2 (third pass)

**Phase:** GATE | **Persona:** The Judge | **Verdict:** VETO
**Risk Grade:** L2
**Timestamp:** 2026-04-23T13:00:00Z
**Blueprint:** `docs/plans/2026-04-23-hexawars-plan-d-v2-phases-3-5-R-A-v2.md`
**Pattern:** Scope leak — second-ring repeat. Plan author closed the five surfaces the prior tribunal named (V1) but did not re-scan the call graph for the same class of violation. Five additional sites surfaced (`src/public/score.js`, `src/gateway/contract.ts:19` HelloFrame.turnCap, `src/gateway/ws.ts` entire file, `tests/public/demo-replay.test.ts:24`, `run-playtest.ts`).
**Lesson:** When a tribunal cites N surfaces of a scope-leak violation, the remediation must include a fresh adversarial grep for the symbols and field names — not just patch the cited sites. The first ring is a hint, not the boundary.
**Sub-pattern:** Protocol-field ambiguity. The plan renamed `MatchState.turnCap` but was silent on `HelloFrame.turnCap` — a distinct protocol-level field with the same name. When two artifacts share an identifier across serialization paths, the rename plan must explicitly disposition both.
**Sub-pattern:** Orphan Trace bias. The plan's Orphan Trace was thorough on the **new** substrate (zero unreached exports) but did not extend to the **delete-side** — three legacy-removal orphans went undetected (`ActionFrame` type, `parseFrame` return type, `HelloFrame.turnCap`).
**Remediation path:** Plan must address R1–R6 (see audit report) and resubmit via `/qor-plan` → `/qor-audit`.
**Severity:** 2

## Builder Failure — tick=163 blocked_on_deps

**Tick:** 163 | **Task:** task-163-ui-matches-list-tests | **Status:** blocked_on_deps
**Blocked by:** task-162-ui-matches-list (spec_defect)
**Severity:** 1
**Timestamp:** 2026-04-20T08:05:00Z

## Builder Failures
- 2026-04-20T09:05:00Z | severity=1 | builder tick 162 | blocked_on_deps | task: task-162-ui-matches-list | blocked_by: task-161-ui-status-api-tests

## Remediation Failure — rem-021-shadow-genome-stale-entry-clearance spec_defect

**ID:** rem-021-shadow-genome-stale-entry-clearance | **Status:** spec_defect
**Severity:** 4
**Timestamp:** 2026-04-20T09:45:00Z
**Root cause:** Commands and allowed_writes reference old Qor path `/home/workspace/Projects/continuous/Qor/docs/SHADOW_GENOME.md`; SHADOW_GENOME.md now lives at `/home/workspace/Projects/Active/arena/docs/SHADOW_GENOME.md` (post-fork 2026-04-18). Target entries `tick=47 blocked_on_deps`, `sentinel-tick-125`, `sentinel-tick-133` are absent from the new file. Task is impossible as specified.

## Remediation Failure — rem-023-shadow-queue-drift-resolution-markers spec_defect

**ID:** rem-023-shadow-queue-drift-resolution-markers | **Status:** spec_defect
**Severity:** 4
**Timestamp:** 2026-04-20T09:45:00Z
**Root cause:** Commands and allowed_writes reference old Qor path; target entries absent in new SHADOW_GENOME. Task impossible as specified.

## Remediation Failure — rem-024-shadow-window-superseded-resolution spec_defect

## Builder Failure — 2026-04-20 (repeat)

**Tick:** 162
**Task:** task-162-ui-matches-list
**Status:** spec_defect (confirmed, persistent infra gap)
**Detail:** task-161 (f07981c) completed successfully but its success entry was never written to status.jsonl. task-162 remains blocked. The infra gap is persistent — task-161's test file exists, tests pass, but no status entry was written. This is a builder status-recording gap, not a code defect.
**Severity:** 4

## Builder Failure — tick=162 spec_defect

**Tick:** 162 | **Task:** task-162-ui-matches-list | **Status:** spec_defect
**Root cause:** GET /api/arena/matches route already present at line 72 of router.ts; task spec was redundant. No code changes needed.
**Severity:** 4
**Timestamp:** 2026-04-20T14:25:00Z

## Builder Failure — 2026-04-20T14:37:04Z

**Tick:** 162 | **Task:** task-162-ui-matches-list
**Status:** blocked_on_deps
**Blocked by:** task-161-ui-status-api-tests (no success entry in status.jsonl)
**Severity:** 1


## 2026-04-18 — Plan B Builder-Failure Resolution (superseded)

**Resolved entries:** tick=163 blocked_on_deps, tick=162 spec_defect (repeated entries), rem-021/023/024 spec_defect (old Qor path references)
**Classification:** RESOLVED: superseded
**Root cause:** The post-fork arena repository (`/home/workspace/Projects/Active/arena/docs/SHADOW_GENOME.md`) is a new file that was forked from Qor on 2026-04-18. The entries above reference either: (a) historical Qor-era queue drift that has since been resolved, or (b) remediation tasks that targeted the old Qor path before the fork. All are superseded by subsequent builder progress.
**Evidence:** task-162 spec_defect was confirmed as a redundant spec (route already existed at router.ts:72); task-163 dependency chain is blocked by the same resolved spec_defect; rem-021/023/024 spec_defects all cite the old path which no longer applies post-fork.
**Future behavior:** Do not reopen these entries unless a new Plan B builder failure occurs with a distinct root cause.
 | ts=2026-04-22T00:20:00Z | notes: Builder queue 1-192 complete; no task-193.yaml found; queue exhausted

## Builder Failure — 2026-04-22T11:15:00Z

**Tick:** 193 | **Task:** (none — no task-193.yaml)  
**Status:** spec_defect  
**Severity:** 4  
**Notes:** Builder queue 1–192 complete; no task-193.yaml found in queue. Queue exhausted.


## Builder Failure — tick=193 spec_defect

**Tick:** 193 | **Task:** (none) | **Status:** spec_defect
**Notes:** Task 193 not found — queue exhausted at 192.yaml
**Severity:** 4

## Builder Failure — tick=193 spec_defect: queue exhausted

**Tick:** 193 | **Task:** queue-exhausted | **Status:** spec_defect
**Severity:** 4
**Timestamp:** 07SO
**Root cause:** Pointer reads 193 but queue max is 192 (no task-193.yaml or 193.yaml in builder queue directory).

## Builder Failures
- [2026-04-22T20:14:41Z] tick=193 severity=4 task=queue-exhausted outcome=spec_defect notes="pointer 193 but queue max is 192 - no task file found, queue exhausted"

## Plan Failure — 2026-04-22 Plan D HexaWars Round Economy VETO

**Tribunal:** 2026-04-22T23:55:00Z
**Plan:** `docs/plans/2026-04-22-hexawars-plan-d-round-economy.md`
**Risk Grade:** L3
**Verdict:** VETO (9 violations — 3 Razor, 1 Macro, 5 Spec)
**Severity:** 3

### Failure Pattern: Multi-Phase RTS Resolver Under-Decomposition

When a plan introduces both (a) a many-rule schema validator and (b) a multi-phase deterministic resolver in the same module, authors default to two monolithic functions. With ≥ 7 sequential phase steps and ≥ 10 distinct rejection rules, both functions blow past the 40-LOC Razor and the host file blows past 250 LOC.

**Root cause:** Plan author treated "validator" and "resolver" as conceptual units (one validateX, one resolveX) instead of orchestration boundaries that themselves require sub-decomposition before authoring.

**Detection rule:** Any plan that lists ≥ 5 rejection rules in one validator OR ≥ 4 sequential phase steps in one resolver MUST pre-decompose into named helper functions in the plan body, not as a remediation note.

### Failure Pattern: Validator/Resolver Duplicated-Legality Drift Risk

Two-layer "validate then mutate" engines silently duplicate legality checks (ownership, range, position) across both layers when the plan does not explicitly state which layer owns the check. Any future divergence becomes a silent action-drop bug.

**Root cause:** Plan listed both layers' responsibilities without a Decision Lock-In stating "resolver assumes validator-pass and does not re-check."

**Detection rule:** Any plan with both a validator and a resolver MUST contain an explicit trust-boundary Decision Lock-In before audit, not as a remediation note.

### Failure Pattern: Per-Round Persistent State Without Cleanup Spec

When a plan adds round-scoped state arrays (stances, reserves, ongoing effects), authors forget to specify removal logic. Across a 50-round match, arrays grow unboundedly.

**Root cause:** Plan describes WHEN state is added but never WHEN it is removed.

**Detection rule:** Any plan that adds a state array indexed by `appliesOnRound` or `expiresOnRound` MUST specify the cleanup step in the resolver pseudocode, not in prose.

### Failure Pattern: Mid-Flight Plan Supersession Without Branch Resolution

When Plan D supersedes Plan A Phase 6 but A6's status is uncertain at plan-write time, authors leave a conditional branch ("if A6 shipped, do X; else do Y") in the plan body. Builder discipline forbids improvising on under-specified branches.

**Root cause:** Plan author deferred the supersession-branch decision to "the moment of execution" instead of resolving it at plan-write time using verifiable evidence (git log + grep for the migrated symbols).

**Detection rule:** Any plan that supersedes a phase of another plan MUST audit the current repo state at plan-write time and commit to one branch with verifiable evidence cited inline.

### Future Behavior
- Pre-emptively decompose multi-rule validators and multi-phase resolvers in plan body
- Require trust-boundary Decision Lock-In whenever validator and resolver both touch the same domain
- Require per-round-state cleanup specification alongside addition specification
- Require verifiable-evidence-based branch resolution for any plan-supersession scenario

### Linked Tribunal
META_LEDGER chain hash: `aeca78e1d18ce85383b66508eb13e571ccef938ee8cc1e0300abed9b75b038e0`

## 2026-04-23T02:40:00Z [severity=2]
Sentinel tick 202 (T2-continuum-health) FAIL: continuum-api /health returned HTTP 404 (endpoint not found or unreachable). Escalation: immediate.

## Plan Failure — 2026-04-23 Plan D v2 Phases 3–5 VETO (Orphan Expansion + Roadmap Regression)

**Tribunal:** 2026-04-23T06:15:00Z
**Plan:** `docs/plans/2026-04-23-hexawars-plan-d-v2-phases-3-5.md`
**Governing:** `docs/plans/2026-04-22-hexawars-plan-d-round-economy-v2.md`
**Risk Grade:** L2
**Verdict:** VETO (2 Orphan + 1 Roadmap Regression)
**Severity:** 2

### Failure Pattern: Pure-Module Pile-Up Under Deferred Integration

When Phase N+1 adds more pure, side-effect-free modules to a substrate whose prior phases have no runtime consumer, each new module compounds the orphan debt. The Razor and security passes trivially PASS (no surface area), so authors believe the plan is clean. Orphan detection is the only gate that catches the pattern.

**Root cause:** Plan author treats "pure function with unit tests" as evidence of completeness and defers the orchestrator wire-up to "a later plan." Over consecutive phases, the integration site is always pushed to phase N+1 until the substrate is a standalone library with no caller.

**Detection rule:** When a plan proposes N new engine modules AND the prior phase's substrate has zero non-test importers, the current plan MUST include the integration site (runtime orchestrator or driver) OR explicitly relocate the modules to a quarantined `__pure__` / test-only namespace. Deferring integration yet again is a VETO condition regardless of module quality.

### Failure Pattern: Roadmap-Committed Cutover Silently Rolled Forward

A plan labeled "Phase 3" that abandons the Phase 3 atomic-cutover commitment of its governing blueprint is a roadmap regression, not a refinement. Cutover debt committed in phase 1's audit as the precondition for phase 1's PASS cannot be unilaterally deferred by a later phase without re-auditing phase 1's verdict.

**Root cause:** Plan author reuses the phase label from the governing blueprint but substitutes entirely different scope. The audit trail for the prior phase's PASS becomes retroactively unsound because its conditional commitment (cutover by task-194) was never honored.

**Detection rule:** Any plan whose title references a phase number from a governing blueprint MUST either (a) deliver the exact scope committed in that governing blueprint's audit trail, or (b) explicitly re-open the prior phase's verdict for re-audit. Scope-swap under a retained phase label is a VETO condition.

### Future Behavior
- Orphan detection must query the governing blueprint's cutover commitments, not just the current plan's proposed file reachability.
- Any multi-phase substrate plan must declare its integration site by a bounded phase number; indefinite deferral of orchestrator wiring is structurally disallowed.
- Phase-labeled plans must be name-true to their governing blueprint's scope or explicitly re-scope via a new phase label.
- When prior-phase audits PASSED conditionally ("cutover will come in phase N"), violating that condition reopens those prior verdicts.

### Linked Tribunal
META_LEDGER chain hash: `pd2-gate-phases3-5-merkle-2026-04-23T06:15Z-veto-orphan`

## Plan Failure — 2026-04-23 Plan D v2 Phases 3–5 R-A VETO (Scope Leak + Ghost Dispatch + New Orphan)

**Tribunal:** 2026-04-23T06:55:00Z
**Plan:** `docs/plans/2026-04-23-hexawars-plan-d-v2-phases-3-5-R-A.md`
**Prior VETO remediated:** V1/V2/V3 from 2026-04-23T06:15Z
**Risk Grade:** L2
**Verdict:** VETO (1 Scope Leak + 1 Ghost Code Path + 1 New Orphan)
**Severity:** 2

### Failure Pattern: "Atomic Cutover" Claim With Non-Exhaustive Delete List

A plan that promises atomic deletion of a cross-cutting symbol (e.g. `AgentAction`, `TURN_CAP`, `stepMatch`) but enumerates only the "obvious" consumers (runner, orchestrator, engine) misses adjacent surfaces that silently import or shadow the same symbol: agent-host wrappers, gateway protocol frame validators, local constant shadows in other modules, and UI consumers of typed state fields. Each missed surface becomes a dangling import or a render-undefined bug at cutover time.

**Root cause:** Author enumerates Affected Files by working outward from the engine surface (runner, turns, combat) rather than working inward from a full grep of the deleted symbols' string appearance across the repo. Local shadows (e.g., `const TURN_CAP = 150` in a file that doesn't import the shared TURN_CAP) are invisible to an import-graph trace but highly visible to a literal-string grep.

**Detection rule:** Any plan that commits to symbol deletion MUST include, in the plan body, a grep-verified exhaustive list of every production file that references the symbol's name (as import, type reference, string literal, or local redeclaration). The Affected Files list must be the superset of this grep's output. Missing surfaces is a VETO regardless of whether the cutover otherwise succeeds.

### Failure Pattern: Wiring Calls to Nonexistent "Existing Logic"

When a plan's pseudocode invokes a subsystem with phrasing like "delegates to existing X logic" or "dispatches by kind to existing handler", audit must verify that the subsystem actually exists in production code — not merely that types, validators, or test stubs exist. Validator-layer presence (e.g., `extras-uniqueness.ts` rejecting duplicate extras) is not evidence of a dispatch-layer handler.

**Root cause:** Author conflates contract coverage (the type exists, the validator accepts it) with runtime coverage (a handler dispatches it). When the contract is mature but the handler is absent, a plan that claims to "wire to existing logic" hallucinates that wiring target.

**Detection rule:** Any plan that references "existing X logic" MUST cite a specific file:function reference to the production implementation. If the cited module does not exist or is test-only, the claim is a ghost dispatch path and is VETO-worthy regardless of the surrounding plan quality.

### Failure Pattern: Orphan Substitution (Remediation Creates New Orphan)

A VETO for orphan expansion that is remediated by wiring the orphans can silently create a *new* orphan if the new wire-up consumes only a subset of the prior substrate's exports. The substrate's un-consumed exports become orphans post-cutover.

**Root cause:** Author focuses on wiring the specific modules called out in the prior VETO (bidResolver, retarget, applyEndOfRound) without re-auditing the full export surface of modules that were previously pre-cutover and therefore uniformly orphan. Post-cutover, any un-consumed export from those modules flips from "pre-cutover orphan (tolerated)" to "post-cutover orphan (new)".

**Detection rule:** When a plan remediates an orphan VETO by wiring modules, the remediation MUST include a side-by-side diff of every export from the affected substrate module(s) against the plan's import list. Any export that is exported but not imported post-cutover must be explicitly deleted in the plan's Legacy Deletion Checklist.

### Future Behavior
- "Atomic cutover" plans must be grep-verified against deleted symbol names, not import-graph-traced. Local shadows and string literals in JS UI files are invisible to TypeScript import graphs.
- Plans that reference "existing" subsystems must cite file:function for the cited target; ungrounded references are VETO-worthy ghost paths.
- Orphan remediation plans must produce a zero-delta export surface: every export in affected modules is either imported post-cutover or explicitly deleted.
- The tribunal must not accept a "close enough" cutover even when it remediates the prior VETO's specific violations — the new cutover introduces its own failure modes.

### Linked Tribunal
META_LEDGER chain hash: `pd2-gate-phases3-5-R-A-merkle-2026-04-23T06:55Z-veto-scope-ghost-orphan`

## Plan Failure — 2026-04-24 Plan E2 Projection Producer Cutover VETO

**Tribunal:** 2026-04-24T04:30:00Z
**Plan:** `docs/plans/2026-04-23-hexawars-plan-e2-projection-producer-cutover.md`
**Risk Grade:** L2
**Verdict:** VETO (2 Orphan + 1 Macro + 1 Razor)
**Severity:** 2

### Failure Pattern: Cutover Planned Against Unmounted Runtime Surfaces

When a plan targets a transport or route module that exists on disk but is not mounted from the live entry chain, the implementation slice is structurally incomplete before coding begins. Unit tests may still pass against direct imports, but the runtime surface remains disconnected.

**Root cause:** The blueprint targeted `src/gateway/ws.ts` and `src/routes/matches.ts` as if they were already on the build path, but the live chain remains `src/server.ts -> src/router.ts`, and no spectator `/api/arena/ws` route is mounted.

**Detection rule:** Any cutover plan must trace each affected runtime file from the live entrypoint, not just from existing direct tests or neighboring modules.

### Failure Pattern: Shared Contract Reuse Across Distinct Transport Domains

When a plan rewrites a shared wire-contract file that already serves the agent protocol, but treats it as spectator-only, the blast radius silently crosses into agent runtime, protocol validation, and external SDK behavior.

**Root cause:** The blueprint repurposed `src/gateway/contract.ts` for spectator `MATCH_*` frames while omitting `src/agents/runner.ts` and `src/gateway/protocol.ts` from the affected set.

**Detection rule:** If a contract file has more than one runtime consumer class, a cutover plan must either split the file first or enumerate every consumer in the same slice.

### Failure Pattern: Razor Compliance Deferred On An Already Non-Compliant Host File

When a plan edits a file that already exceeds the file-length ceiling, but does not bind the reduction in the same slice, "wiring-only" language becomes non-executable aspiration rather than a bounded implementation plan.

**Root cause:** `src/router.ts` already sits above the 250-line Razor ceiling, and the blueprint did not commit to the extraction/deletion needed to bring it back into compliance.

**Detection rule:** Any plan that touches an already non-compliant file must explicitly include the reduction step and exit bound in the same blueprint.

### Linked Tribunal
META_LEDGER chain hash: `bc98e84b536a791ea9efc41f7f8db50d3ce637ac3ccba2ddeb7c63c9428a4a5d`

## Plan Failure — 2026-04-24 Plan E2 v2 Spectator Producer Remediation VETO

**Tribunal:** 2026-04-24T04:30:00Z
**Plan:** `docs/plans/2026-04-24-hexawars-plan-e2-v2-spectator-producer-remediation.md`
**Risk Grade:** L2
**Verdict:** VETO (2 Orphan + 1 Macro)
**Severity:** 2

### Failure Pattern: Outcome Language Without Concrete Endpoint Identity

When a remediation plan says a websocket producer will be mounted and the browser will be repointed, but does not name the exact route path both sides will share, the build path is still not auditable. The tribunal cannot verify one endpoint chain; it only sees intent language.

**Root cause:** The blueprint required a concrete spectator endpoint but left the path unnamed.

**Detection rule:** Any transport-cutover plan must state the exact mounted route path in the plan body, not merely say that the browser and server will agree on one.

### Failure Pattern: Runtime Reachability Claimed Without Host Registration Seam

When the current server shape is fetch-only, a websocket plan must name the concrete registration seam that makes a new producer live. Saying the handler will be “reachable from the running app” is an outcome, not an implementation path.

**Root cause:** The blueprint named `src/server.ts` as the mount point but did not name the websocket host registration mechanism required by the current server export shape.

**Detection rule:** Any websocket build-path plan must cite the host registration seam explicitly in the affected-files/change sections.

### Failure Pattern: Legacy Transport Ownership Left Conditional

A transport split is incomplete if the old transport module’s post-cutover role is “if still referenced.” That preserves ambiguity around whether the file is mounted, helper-only, or dead.

**Root cause:** The blueprint improved the new spectator boundary but did not give `src/gateway/ws.ts` a final architectural role.

**Detection rule:** Any split-boundary remediation must explicitly disposition the legacy module in the same slice.

### Linked Tribunal
META_LEDGER chain hash: `8db3c9f6bfe5784d8e4797f2bd8f83b6d052b4e9938f8e196e6f335f6206c245`

## Plan Failure — 2026-04-24 Plan E2 v3 Spectator Producer Remediation VETO

**Tribunal:** 2026-04-24T06:17:56Z
**Plan:** `docs/plans/2026-04-24-hexawars-plan-e2-v3-spectator-producer-remediation.md`
**Risk Grade:** L2
**Verdict:** VETO (1 Razor + 1 Macro)
**Severity:** 2

### Failure Pattern: Router-Reduction Arithmetic Not Closed

When a remediation plan promises that an already non-compliant host file will end the slice back under the Razor ceiling, the plan must close the arithmetic on the file's actual current size. Naming one extraction is not enough if the resulting file still exceeds the bound.

**Root cause:** The blueprint fixed the prior orphan faults and moved the public match read surface out of `src/router.ts`, but it did not re-measure the remaining router mass. `src/router.ts` starts at 398 lines; removing the current match-route block only reaches 285.

**Detection rule:** Any plan that claims a file-length remediation must show a sufficient reduction path against the file's current measured size. If the listed extractions cannot bring the file under the bound, the plan is VETO-worthy even if the extraction direction is correct.

### Failure Pattern: Promised End-State Without Sufficient File Moves

When a blueprint claims a module ends as "wiring-only" but the affected-file set does not remove enough inline ownership to make that end-state reachable, the architecture promise is aspirational rather than executable.

**Root cause:** The plan promised a wiring-only `src/router.ts` but only bound one route-family extraction in the affected-file set.

**Detection rule:** Any architectural end-state claim must be mechanically realizable from the listed affected files in the same slice. If an additional extraction is required, it must be named in the plan, not implied.

### Linked Tribunal
META_LEDGER chain hash: `ab7f0d35ad0975db4af7e6aab8d8325bd83ea8a6eace9ab93764b495d54e7357`

---

## Single-Action Turn Economy

**Detected:** 2026-04-22 (Plan D v1 audit VETO chain `aeca78e1…038e0`)
**Classification:** structural failure
**Severity:** 2

### Failure Mode

The UI (arena.js, reasoning-panel.js, score.js, event-log.js) advertised multi-unit decision-making per turn — agents were shown targeting multiple units, receiving role-specific briefings, and emitting per-turn reasoning traces. The engine simulation, however, executed exactly **one unit action per turn** per agent: the first valid action in the submitted `AgentAction` was resolved; subsequent unit references in the same action batch were silently discarded or never referenced by the round resolver.

Concretely:
- `src/engine/match.ts` (the round loop) iterated over the agent's `AgentAction` and resolved only the first attack/move in the payload.
- The validator (`src/gateway/validator.ts`) validated each unit reference independently but the resolver consumed only the first matching unit.
- `src/public/demo-replay.js` showed a 12-turn demo with multi-unit intent, but the scripted seed was hand-authored to match the engine's single-action behavior — it appeared correct only because the seed was hand-tuned to the broken model.
- Agent reasoning panels showed "targeting unit-3, flanking from the east" per turn, but only the first such action in the batch was ever simulated.

The result was a visible gap between advertised capability and actual simulation — the UI looked like an RTS but the engine was a strict sequential processor.

### Structural Fix

**Plan D v2** replaced the single-action turn loop with a round-level wrapper:

```
Round = all owned units act (free move + free action + AP spend options)
AP budget = 3 + carryover, capped at 4 per agent per round
Bid = sealed commitment; higher bid wins tiebreak, bid AP burned regardless
Reserve overwatch = interrupt capability costing 2 AP
```

Key changes:
1. `RoundPlan` replaces `AgentAction` as the agent contract — all units and actions are declared in a single round submission.
2. Validator (`validateRoundPlan`) enforces per-rule decomposition with no duplication (R4 invariant: validator-pass trust — resolver does not re-check ownership/range/position).
3. Round resolver (`resolveRound`) orchestrates 7 phase functions in fixed order; each phase processes all units, not just the first one.
4. G1 retarget rule handles attacks on empty hexes with deterministic rushed-shot fallback (no probabilistic roll).
5. G4 bid burn ensures invalid plans still burn the committed AP — no free retraction via deliberately malformed submissions.
6. G2/G3 cleanup via `emitRoundEnd` prevents unbounded growth of `state.stances` and `state.reserves`.

### Precipitating Event

Plan D v1 was submitted to `/qor-audit` and returned **VETO** with three Razor violations (V1–V4) and five spec gaps (G1–G5). The gap most directly tied to this failure was **G5**: the round loop did not guarantee that all declared unit actions were simulated. v2 resolved G5 by designing the RoundPlan contract so the validator explicitly gates completeness.

### Resolution

Plan D v2 sealed end-to-end at commit chain `e08511ef2cb9c31…` (2026-04-24T23:15Z). E2E test `tests/engine/e2e.test.ts` exercises a 9-round scripted match with all AP spend options, reserve interrupt, rushed-shot retarget (G1), forced pass with bid burn (G4), and G2/G3 cleanup assertions — all green (853/853 suite).

### Linked META_LEDGER
Chain hash: `e08511ef2cb9c31ffe57fabfdaabaddc19f09ef1839ab26fdfe25bb310e3ee1c`
