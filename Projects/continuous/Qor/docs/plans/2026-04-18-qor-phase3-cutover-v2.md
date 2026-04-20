# Plan: Qor Phase 3 Cutover (VETO Remediation v2)

Supersedes Phase 2 + Phase 3 of `2026-04-18-qor-mono-service-cutover.md` (v1). Phase 1 of v1 is already sealed. This plan closes VETO findings R1–R4 from audit chain `2dffc116…`.

## Open Questions

- None. Design dialogue complete; all answers locked (v1 Q1=A, Q2=A, Q3=B, Q4=A1+B1).

## Phase 1: start.sh Hardening — Crashloop Counter + Orphan Reap + Bun Watchdog

**Goal:** Close R3 + R4. Make `start.sh` safe under supervisor restart storms and mid-life Bun failure.

### Affected Files

- `Projects/continuous/Qor/qor/start.sh` — Add crashloop counter (R3), pre-flight 7687 probe (R4 Gap 1), Bun PID watchdog replacing unconditional `exec` (R4 Gap 2).
- `Projects/continuous/Qor/tests/qor/start-sh-harness.test.ts` — Extend existing harness with 3 new scenarios covering the new branches.

### Changes

1. **Crashloop counter (R3):** At entry, before any Neo4j launch:
   - State file: `/dev/shm/qor-crashloop` (JSON: `{failures: number, windowStart: epochSeconds}`).
   - Tunables (env vars with defaults): `QOR_CRASHLOOP_MAX=3`, `QOR_CRASHLOOP_WINDOW=60`, `QOR_CRASHLOOP_COOLDOWN=60`.
   - Logic:
     - If file missing/invalid: initialize `{failures: 0, windowStart: now}`.
     - If `now - windowStart > WINDOW`: reset `{failures: 0, windowStart: now}`.
     - If `failures >= MAX`: `sleep COOLDOWN`, reset counter, continue.
     - Else: increment `failures`, write back.
   - On clean Bun exit (code 0) at end of script: `rm -f /dev/shm/qor-crashloop` (reset).

2. **Pre-flight orphan reap (R4 Gap 1):** Before launching Neo4j:
   - Probe `/dev/tcp/127.0.0.1/7687`. If bound: log `qor: port 7687 already bound; refusing to launch neo4j (orphan suspected)` → exit 1.
   - Supervisor restart → crashloop counter kicks in on repeated failure.

3. **Bun PID watchdog (R4 Gap 2):** Replace `exec bun run …` with:
   - `bun run continuum/src/service/server.ts & BUN_PID=$!`
   - Extend the existing liveness subshell (lines 27–42) to also check `kill -0 $BUN_PID`. If Bun dies: `kill -TERM 0`.
   - Replace final line with `wait $BUN_PID` so bash stays alive monitoring; process group remains coupled to both Neo4j and Bun.
   - On Bun exit, propagate its exit code.

4. **Ordering:** Crashloop check first → pre-flight port probe → Neo4j launch → Bolt boot-gate (unchanged) → liveness subshell (extended) → Bun launch (backgrounded) → wait.

### Unit Tests

- `tests/qor/start-sh-harness.test.ts` — extend the existing 3-scenario harness:
  - **Scenario 4: crashloop cooldown fires after 3 rapid failures** — write `{failures: 3, windowStart: now}` to `/dev/shm/qor-crashloop`, invoke with `QOR_CRASHLOOP_COOLDOWN=1`, assert script sleeps ≥1s before proceeding; assert counter resets after cooldown. Proves R3.
  - **Scenario 5: crashloop counter resets after window expiry** — write `{failures: 3, windowStart: now-120}` with `QOR_CRASHLOOP_WINDOW=60`, assert no cooldown triggered; assert counter rewritten with `failures=1, windowStart=now`. Proves window semantics.
  - **Scenario 6: pre-flight port probe refuses launch when 7687 bound** — start a local listener on 127.0.0.1:7687 in the test, invoke script, assert exit code 1 + stderr contains `"port 7687 already bound"`; assert Neo4j was not spawned. Proves R4 Gap 1.
  - **Scenario 7: Bun death triggers process-group kill** — stub Neo4j boot to succeed; stub Bun entrypoint with `exit 42` after 500ms; assert script exits non-zero within 2s; assert the liveness subshell was reached (trace log). Proves R4 Gap 2.

---

## Phase 2: Atomic Service Swap — env_vars Fix + IPC Deferral

**Goal:** Close R1 + R2. Delete `neo4j` + `continuum-api`, register `qor` with the hardened `start.sh` and complete env_vars. No IPC env_vars — IPC server explicitly not started in this phase.

### Affected Files

- **No source file changes** (purely operational; uses `delete_user_service` + `register_user_service`).
- `AGENTS.md` (workspace root) — service table: single `qor` row; remove `neo4j`; remove stale `.neo4j/start-neo4j.sh` reference.
- `Projects/continuous/Qor/AGENTS.md` — mirror the change in project-local AGENTS.md.
- `Projects/continuous/Qor/docs/plans/2026-04-18-qor-phase3-cutover-v2.md` — append Session Log entry post-cutover.
- `Projects/continuous/Qor/docs/SYSTEM_STATE.md` — service inventory update.

### Changes

1. **Pre-cutover gate:**
   - Phase 1 (this plan) merged to main; `bun test tests/qor/` green (scenarios 1–7).
   - Snapshot existing service IDs from `list_user_services`: `neo4j=svc_Vw2b3WN68nM`, `continuum-api=svc_JsVdYqujQAw`.
   - Confirm `/opt/neo4j/bin/neo4j` + `/dev/shm/qor-crashloop` absent on host.

2. **Cutover sequence:**
   - `delete_user_service(svc_Vw2b3WN68nM)` — stops Java.
   - `delete_user_service(svc_JsVdYqujQAw)` — stops Bun.
   - `register_user_service(name="qor", mode="http", local_port=4100, entrypoint="/home/workspace/Projects/continuous/Qor/qor/start.sh", env_vars={ NEO4J_URI: "bolt://127.0.0.1:7687", NEO4J_USER: "neo4j", NEO4J_PASS: "victor-memory-dev", QOR_PORT: "4100" })`.
   - **Explicitly omitted from env_vars:** `QOR_IPC_SOCKET`, `QOR_IPC_TOKEN_MAP`. IPC server remains disabled in this phase per Q2=A. Re-enabling IPC becomes its own phase when Victor kernel consumers are wired.
   - Wait ≥30s for Neo4j Bolt readiness (crashloop counter guards supervisor storms if boot fails).

3. **Post-cutover verification:**
   - `curl localhost:4100/health` → 200.
   - `curl https://qor-frostwulf.zocomputer.io/health` → 200.
   - `getDriver()` smoke: invoke any Neo4j-backed API route; assert no `NEO4J_URI required` throw (closes R1).
   - Tail `/dev/shm/qor.log` for 120s; expect clean boot pattern, zero `kill -TERM 0` entries, empty crashloop counter file.
   - Kill Neo4j PID externally; assert `qor` service dies within `NEO4J_LIVENESS_INTERVAL`; supervisor auto-restarts within crashloop budget.

4. **Rollback (if cutover fails):**
   - `delete_user_service(<new qor svc_id>)`.
   - `register_user_service(name="neo4j", entrypoint="/opt/neo4j/bin/neo4j console", …)` — direct entrypoint, not the stale `.neo4j/start-neo4j.sh`.
   - `register_user_service(name="continuum-api", …)` with prior config.
   - Append failure mode + telemetry to Session Log.

### Unit Tests

- **No new unit tests** (operational phase; tests are live smoke).
- `tests/integration/qor-live-health.test.ts` (new) — post-cutover canary:
  - Asserts `/health` 200 on both internal (`localhost:4100`) and public (`qor-frostwulf.zocomputer.io`) URLs.
  - Asserts a Neo4j-backed route returns non-error JSON (closes R1: env_vars actually loaded).
  - Asserts `/ipc/status` returns 404 or explicit `{ enabled: false }` (closes R2: IPC deferral is intentional, not accidentally-on).
  - Runnable as a canary post any future `qor` service update.

---

## Dependency Chain

```
v1 Phase 1 (sealed) → v1 Phase 2 (sealed, start.sh exists) → v2 Phase 1 (start.sh hardening) → v2 Phase 2 (atomic swap)
```

No cross-phase parallelism. Each phase independently committable and independently auditable.

## Risk Ledger

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Crashloop counter state file survives across unrelated boot-up cycles | v2 P1 | Window-based reset (60s); manual `rm /dev/shm/qor-crashloop` documented in rollback. |
| Pre-flight probe blocks legitimate restart after clean shutdown | v2 P1 | Probe only fails if 7687 is *currently* bound; clean shutdown releases port. |
| Bun watchdog racing with Neo4j watchdog on `kill -TERM 0` | v2 P1 | Both target process group; double-kill is idempotent. |
| env_vars NEO4J_PASS checked into git | v2 P2 | Accepted (Q1=A); matches existing `continuum-api` exposure level. |
| IPC deferral strands Victor kernel live-IPC tests | v2 P2 | Victor `continuum-store` tests use direct-driver path when `QOR_IPC_SOCKET` unset; verify pre-cutover. |
| Zo supervisor backoff still unverified | v2 P1 | Crashloop counter is defense-in-depth; supervisor behavior becomes observable via log pattern post-cutover. |

## Success Criteria

1. `list_user_services` shows single `qor` service; `neo4j` + `continuum-api` gone.
2. `curl https://qor-frostwulf.zocomputer.io/health` → 200.
3. Neo4j-backed route returns live data (R1 closed — env_vars loaded).
4. IPC endpoint returns 404 / `enabled: false` (R2 closed — IPC intentionally deferred).
5. Killing Neo4j PID triggers `qor` process-group exit; supervisor restart stays within crashloop budget (R3 + R4 closed).
6. Starting a second `start.sh` while 7687 is bound refuses launch with exit 1 (R4 Gap 1 closed).
7. AGENTS.md service tables accurate.
