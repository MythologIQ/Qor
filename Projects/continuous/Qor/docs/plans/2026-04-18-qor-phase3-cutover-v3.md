# Plan: Qor Phase 3 Cutover (VETO Remediation v3)

Supersedes v2 (`2026-04-18-qor-phase3-cutover-v2.md`). Closes VETO findings T1 + C2 from audit chain `2d4c2a6f…`. All other v2 design (R1/R3/R4 remediations, cutover sequence, rollback) is inherited unchanged — this plan revises only the test surface.

## Open Questions

- None. Design dialogue complete; all answers locked (v3 Q1=A extend bash harness, v3 Q2=C config + runtime discriminators).

## Phase 1: start.sh Hardening — Crashloop Counter + Orphan Reap + Bun Watchdog

**Goal:** Close R3 + R4. Identical design to v2 Phase 1; only the test target changes.

### Affected Files

- `Projects/continuous/Qor/qor/start.sh` — Add crashloop counter (R3), pre-flight 7687 probe (R4 Gap 1), Bun PID watchdog replacing unconditional `exec` (R4 Gap 2). *(Unchanged from v2.)*
- `Projects/continuous/Qor/qor/start.test.sh` — Extend existing bash harness with 4 new scenarios (scenarios 4–7). **Replaces v2's orphan TS target** `tests/qor/start-sh-harness.test.ts`.

### Changes

*Source changes to `start.sh` inherited from v2 Phase 1 (§Changes 1–4). Test harness changes:*

Extend `qor/start.test.sh` in place. Harness already follows a setup/exec/assert/teardown pattern per scenario. Add:

- **Scenario 4: crashloop cooldown fires after 3 rapid failures** — seed `/dev/shm/qor-crashloop` with `{failures: 3, windowStart: $(date +%s)}`, invoke `start.sh` with `QOR_CRASHLOOP_COOLDOWN=1` and a stubbed Neo4j/Bun (no-op). Assert script sleeps ≥1s before proceeding and counter resets to `failures=0` after cooldown.
- **Scenario 5: crashloop counter resets after window expiry** — seed counter with `windowStart=$(($(date +%s) - 120))` and `QOR_CRASHLOOP_WINDOW=60`. Assert no cooldown is entered (no sleep observed), counter rewritten with `failures=1, windowStart=now`.
- **Scenario 6: pre-flight port probe refuses launch when 7687 is bound** — start a listener via `nc -l 127.0.0.1 7687 &` in the test, invoke `start.sh`. Assert exit code 1, stderr contains `port 7687 already bound`, and Neo4j stub was never invoked (sentinel file absent).
- **Scenario 7: Bun death triggers process-group kill** — stub Neo4j boot success; stub Bun entrypoint as `exit 42` after 500ms. Assert `start.sh` exits non-zero within 2s and a trace file written by the watchdog subshell contains `bun pid dead`.

Each scenario follows the existing harness idioms: `setup_tmpdir`, `stub_neo4j`, `stub_bun`, `run_start_sh`, `assert_eq`, `teardown`.

### Unit Tests

- `qor/start.test.sh` — now hosts scenarios 1–7. Invocation: `bash qor/start.test.sh`. Exit code 0 iff all scenarios pass. Scenarios 1–3 (existing) unchanged; 4–7 added per §Changes above.
  - Scenario 4 proves R3 (crashloop cooldown).
  - Scenario 5 proves R3 window semantics.
  - Scenario 6 proves R4 Gap 1 (orphan reap).
  - Scenario 7 proves R4 Gap 2 (Bun watchdog).

---

## Phase 2: Atomic Service Swap — env_vars Fix + IPC Deferral

**Goal:** Close R1 + R2. Identical cutover design to v2 Phase 2; only the canary test changes.

### Affected Files

- **No source file changes** (operational).
- `AGENTS.md` (workspace root) + `Projects/continuous/Qor/AGENTS.md` — service table rewritten to single `qor` row. *(Unchanged from v2.)*
- `Projects/continuous/Qor/docs/SYSTEM_STATE.md` — service inventory update. *(Unchanged from v2.)*
- `Projects/continuous/Qor/tests/integration/qor-live-canary.test.ts` — **new** discriminating canary (replaces v2's vacuous `/ipc/status` probe).

### Changes

*Cutover sequence inherited from v2 Phase 2 (§Changes 1–4). Canary test changes:*

The v2 canary asserted `/ipc/status` returns 404 — vacuous, since that route doesn't exist and would 404 regardless of IPC state. v3 replaces it with two discriminating assertions (Q2=C):

1. **Config-level discriminator (B):** Call `list_user_services`, locate the `qor` service entry, assert `env_vars` object has no key `QOR_IPC_SOCKET` and no key `QOR_IPC_TOKEN_MAP`. Proves R2 remediation at the service-registry layer.
2. **Runtime-level discriminator (A):** After canary runs 10s post-cutover (giving the IPC server time to bind if it were going to), assert no UDS socket file exists at `/tmp/qor.sock` or `/tmp/continuum.sock`. Proves IPC is not running at the kernel-syscall layer.

Both assertions fail independently — no shared fate. Together they cover intent (config) and reality (filesystem).

### Unit Tests

- `tests/integration/qor-live-canary.test.ts` — post-cutover live canary:
  - Asserts `curl localhost:4100/health` → 200 (liveness).
  - Asserts `curl https://qor-frostwulf.zocomputer.io/health` → 200 (public route).
  - Asserts a Neo4j-backed route (e.g. `GET /api/continuum/memory?limit=1`) returns non-error JSON. Closes R1 by proving env_vars were loaded.
  - Asserts `qor` service `env_vars` has no `QOR_IPC_SOCKET` or `QOR_IPC_TOKEN_MAP` keys. Closes R2 at config layer.
  - Asserts `/tmp/qor.sock` and `/tmp/continuum.sock` do not exist on host. Closes R2 at runtime layer.
  - Runnable as a canary post any future `qor` service update (`bun test tests/integration/qor-live-canary.test.ts`).

---

## Dependency Chain

```
v1 Phase 1 (sealed) → v1 Phase 2 (sealed, start.sh exists) → v3 Phase 1 (start.sh hardening + bash harness scenarios 4–7) → v3 Phase 2 (atomic swap + discriminating canary)
```

v2 is superseded wholesale; no artifacts from v2 are retained.

## Risk Ledger

*Inherited from v2 unchanged. New row:*

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Socket-absence assertion races IPC boot if future phase re-enables IPC | v3 P2 | Canary runs 10s post-registration; assertion is scoped to this phase's "IPC deliberately off" invariant, retired when IPC re-enabled in a later phase. |
| Bash harness not discoverable by `bun test` | v3 P1 | Accepted (Q1=A); harness is explicitly bash because `start.sh` is bash. Meta-test runner (if ever needed) can shell out. |

## Success Criteria

1. `bash qor/start.test.sh` exits 0 with scenarios 1–7 all passing. (Closes T1.)
2. `tests/integration/qor-live-canary.test.ts` passes post-cutover — env_vars config clean, UDS sockets absent, health 200, Neo4j route live. (Closes C2 + R1 + R2.)
3. All v2 success criteria (§1–7) met via inherited cutover sequence.
