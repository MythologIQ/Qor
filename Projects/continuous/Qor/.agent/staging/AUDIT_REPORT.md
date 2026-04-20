# Gate Tribunal — Phase 3 Cutover v3

**Plan:** `docs/plans/2026-04-18-qor-phase3-cutover-v3.md`
**Content hash:** `30d86e2f727e772ba86c89d2d1ed1ff09601979b7af9b3ebc7535001570d8d52`
**Chain hash (prev `2d4c2a6f…` + v3 content):** `e38d0c801e2da148f59a246715600209cc86908e3d8f1ebac418d99a397a1c16`
**Verdict:** ❌ **VETO**
**Risk grade:** L2

---

## Verdict Summary

v3 closes T1 (VETO chain `2d4c2a6f…`) by extending the existing bash harness — substantiated by live inspection of `qor/start.test.sh` structure. However, v3 introduces a **new orphan test path** (same bug class as T1) and a **cross-environment execution hazard** that was not surfaced in prior audits.

---

## Audit Passes

### Security Audit
- [x] No placeholder auth logic
- [x] No hardcoded credentials beyond the accepted Q1=A inline `NEO4J_PASS=victor-memory-dev` (matches existing `continuum-api` exposure)
- [x] No bypassed security checks
- [x] No mock authentication returns
- [x] No `// security: disabled for testing`

**Status:** PASS.

### Ghost UI Audit
N/A — operational cutover + test plan, no UI surface.

**Status:** PASS.

### Section 4 Razor Audit

| Check | Limit | Blueprint Proposes | Status |
|---|---|---|---|
| Max function lines | 40 | ~20/scenario (matches existing harness pattern) | OK |
| Max file lines | 250 | `qor/start.test.sh` 154 → ~235 (4 scenarios ≈ 20 lines each + runner updates) | OK (tight) |
| Max nesting depth | 3 | bash `if/for` in harness, 2 levels max | OK |
| Nested ternaries | 0 | 0 | OK |

**Status:** PASS.

### Dependency Audit
No new packages. `nc -l 127.0.0.1 7687` (Scenario 6) and `python3` (existing harness stub) already on host.

**Status:** PASS.

### Macro-Level Architecture Audit

- [x] Clear module boundaries
- [x] No cyclic dependencies
- [x] Layering direction enforced
- [x] Single source of truth for shared types
- [x] Cross-cutting concerns centralized
- [x] No duplicated domain logic
- [ ] **Build path is intentional** — ❌ **VIOLATION.** See X1 below.

**Status:** VETO — see Build Path Audit.

### Build Path Audit

| Proposed File | Entry Point Connection | Status |
|---|---|---|
| `qor/start.test.sh` (extended) | `bash qor/start.test.sh` from project root; existing invocation | **Connected** |
| `tests/integration/qor-live-canary.test.ts` | No `tests/` dir exists at `Projects/continuous/Qor/`. All tests live in `<module>/tests/` (`continuum/tests/`, `victor/tests/`, `evidence/tests/`, etc.). No root-level `bun test` script in `continuum/package.json`. | **ORPHAN** |

**Status:** VETO.

---

## Blocking Violations

### T1r (repeat of v2 T1) — Orphan canary test path

**Finding:** v3 Phase 2 specifies `Projects/continuous/Qor/tests/integration/qor-live-canary.test.ts`. No `tests/integration/` directory exists at project root. Grounded evidence:

```
$ find Projects/continuous/Qor -maxdepth 4 -type d -name "tests"
Projects/continuous/Qor/victor/tests
Projects/continuous/Qor/evolveai/tests
Projects/continuous/Qor/continuum/tests
Projects/continuous/Qor/evidence/tests
Projects/continuous/Qor/qora/tests
Projects/continuous/Qor/forge/tests
```

All project tests are module-scoped. `continuum/package.json` has no `scripts.test` key; `bun test` is invoked per-module from each module's cwd. A file at `Projects/continuous/Qor/tests/integration/` is unreachable by any existing test runner — same vacuity class as v2 T1 (TS file that `bun test tests/qor/` doesn't discover).

**Impact:** R1 + R2 closures are promised by this canary but cannot execute. Phase 2 completion is unverifiable.

**Remediation:** Relocate to `continuum/tests/integration/qor-live-canary.test.ts` (matches `continuum/tests/ipc/`, `continuum/tests/memory/` convention) and invoke via `bun test tests/integration/qor-live-canary.test.ts` from `continuum/` cwd.

---

### X1 — Cross-environment execution hazard (canary B assertion)

**Finding:** v3 Phase 2 canary B asserts *"Call `list_user_services`, locate the `qor` service entry, assert `env_vars` object has no key `QOR_IPC_SOCKET` and no key `QOR_IPC_TOKEN_MAP`."*

`list_user_services` is a Zo MCP tool, callable from the agent context. It is **not** callable from inside a `bun test` process — there is no documented SDK, binding, or shell wrapper in `continuum/tests/` that reaches the Zo MCP surface. The plan does not describe a mechanism to bridge these environments.

**Impact:** Canary B is non-executable as specified. Test would either (a) silently skip config assertion, (b) hard-fail on missing SDK, or (c) require an undocumented shim. R2 config-layer closure fails the substantiation test.

**Remediation options:**

- **R1:** Downgrade canary B to a bash-level check invoked by a human/agent outside `bun test` — documented as a post-cutover manual step with explicit verbatim command (e.g. `zo list-user-services --name qor` or whatever the actual CLI is, if one exists). Clearly separate from `bun test`-runnable canary A.
- **R2:** Define a shell-out wrapper (e.g. child process calling a CLI) with explicit failure semantics documented in the plan. Requires Governor to identify the actual bridge mechanism.
- **R3:** Scope canary B to reading a local artifact the registration mechanism writes (e.g. if `register_user_service` persists config to a known path), not the live MCP query.

---

## Non-Blocking Observations

*Not VETO — logged for Governor's awareness in v4:*

**O1 — Legacy env-var gap in canary B.** Server IPC gate (`continuum/src/service/server.ts:128`) falls back to `CONTINUUM_IPC_TRANSPORT` / `CONTINUUM_IPC_TOKEN_MAP` when new names are unset. Canary B only asserts absence of new names. Canary A (UDS socket absence) catches this at runtime, so not a closure gap — but the config-layer proof is asymmetric. If v4 re-scopes canary B, consider asserting on all four names.

---

## R1–R4 Closure Status (v3)

- **R1** (env_vars inline) — design closed; test substantiation **blocked by T1r**.
- **R2** (IPC tokens) — design closed; config-layer test **blocked by X1**; runtime-layer test **blocked by T1r** (would live in the orphan file).
- **R3** (crashloop counter) — design closed; test closure **PASS** (scenarios 4–5 target `qor/start.test.sh` which is a reachable entry point).
- **R4** (orphan reap + Bun watchdog) — design closed; test closure **PASS** (scenarios 6–7 same harness).

---

## Next Action

Governor produces v4 plan addressing **T1r + X1**. Scope: test surface only — all v3 source/cutover design (R1/R3/R4 remediations, cutover sequence, rollback, scenarios 4–7) is inherited. Dialogue required on X1 remediation path (R1 / R2 / R3 above).
