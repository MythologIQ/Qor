# Plan: Qor Phase 3 Cutover (VETO Remediation v4)

Supersedes v3 (`2026-04-18-qor-phase3-cutover-v3.md`). Closes VETO findings T1r + X1 from audit chain `e38d0c80…`. All other v3 design (R1/R3/R4 remediations, cutover sequence, rollback, Phase 1 start.sh hardening + bash harness scenarios 4–7) is inherited unchanged — this plan revises only the Phase 2 canary surface.

## Open Questions

- None. Design dialogue complete; v4 answers locked (Q1=B bash canary at `qor/qor-live-canary.sh`, Q2=A runtime-only canary with config-layer check moved to cutover runbook).

## Phase 1: start.sh Hardening — Crashloop Counter + Orphan Reap + Bun Watchdog

**Inherited from v3 Phase 1 verbatim.** No changes.

### Affected Files

- `Projects/continuous/Qor/qor/start.sh` — crashloop counter (R3), pre-flight 7687 probe (R4 Gap 1), Bun PID watchdog (R4 Gap 2).
- `Projects/continuous/Qor/qor/start.test.sh` — extended with scenarios 4–7 (v3 spec, unchanged).

### Changes

*See v3 §Phase 1 Changes.*

### Unit Tests

*See v3 §Phase 1 Unit Tests.* Invocation: `bash qor/start.test.sh`. Exit code 0 iff scenarios 1–7 pass.

---

## Phase 2: Atomic Service Swap — env_vars Fix + IPC Deferral

**Goal:** Close R1 + R2. Identical cutover design to v3 Phase 2; only the canary test changes (T1r + X1 closure).

### Affected Files

- **No source file changes** (operational).
- `AGENTS.md` (workspace root) + `Projects/continuous/Qor/AGENTS.md` — service table rewritten to single `qor` row. *(Unchanged from v3.)*
- `Projects/continuous/Qor/docs/SYSTEM_STATE.md` — service inventory update. *(Unchanged from v3.)*
- `Projects/continuous/Qor/qor/qor-live-canary.sh` — **new** bash canary (replaces v3's `tests/integration/qor-live-canary.test.ts`, which targeted a nonexistent root-level `tests/` tree).
- `Projects/continuous/Qor/docs/plans/2026-04-18-qor-phase3-cutover-v4.md` (this file) — authoritative runbook, carries the manual config-layer verification step.

### Changes

*Cutover sequence inherited from v3 Phase 2 (§Changes 1–4). Canary test changes:*

v3's canary had two defects:
- **T1r:** located at `tests/integration/qor-live-canary.test.ts`, but no root-level `tests/` directory exists; all tests are module-scoped. Undiscoverable.
- **X1:** attempted to call `list_user_services` (a Zo MCP tool) from inside `bun test` — the MCP surface is not callable from a Bun test process.

v4 closes both:

1. **Canary moves to bash at `qor/qor-live-canary.sh`** (Q1=B). Co-located with `start.sh` / `start.test.sh`, runnable via `bash qor/qor-live-canary.sh`. Exit code 0 iff all assertions pass. Zero dependency on `bun test` discovery or MCP-from-test bridges.

2. **Config-layer assertion moves out of the canary** (Q2=A). Instead of attempting an in-process MCP call, the config-layer check (qor's `env_vars` contains NEO4J_* and excludes QOR_IPC_*) becomes a **mandatory manual runbook step** the implementer executes via the assistant's MCP tools during cutover (§Cutover Runbook below). The bash canary covers runtime-layer assertions only, which transitively prove config correctness:

   - If `NEO4J_PASS` were wrong in env_vars, the Neo4j driver handshake would fail and the Neo4j-backed route would error. Route success → NEO4J_* reached the process correctly.
   - If `QOR_IPC_SOCKET` were set in env_vars, the server code (`continuum/src/service/server.ts`, IPC gated on truthy `IPC_SOCKET && IPC_TOKEN_MAP`) would bind a UDS socket. Socket absence at `/tmp/qor.sock` and `/tmp/continuum.sock` → IPC is not running.

### Unit Tests

- `qor/qor-live-canary.sh` — post-cutover bash canary. Invocation: `bash qor/qor-live-canary.sh`. Asserts (all must pass, exit code 0):

  1. **Liveness:** `curl -fsS http://localhost:4100/health` returns HTTP 200.
  2. **Public route:** `curl -fsS https://qor-frostwulf.zocomputer.io/health` returns HTTP 200.
  3. **Neo4j-backed route (R1 runtime proof):** `curl -fsS http://localhost:4100/api/continuum/memory?limit=1` returns HTTP 200 with valid JSON (no driver-handshake error). Confirms NEO4J_* env_vars were loaded into the process.
  4. **Bolt liveness:** `nc -z 127.0.0.1 7687` succeeds. Confirms Neo4j is up under qor's lifecycle.
  5. **IPC socket absence at `/tmp/qor.sock` (R2 runtime proof):** `test ! -e /tmp/qor.sock`.
  6. **IPC socket absence at `/tmp/continuum.sock` (R2 runtime proof):** `test ! -e /tmp/continuum.sock`.

  Each assertion emits a line on success (`PASS: <assertion name>`) or failure (`FAIL: <assertion name>: <detail>`) and bumps a failure counter. Script exits 0 iff counter is zero at end.

- `qor/start.test.sh` — unchanged from v3 (scenarios 1–7).

### Cutover Runbook (manual config-layer verification)

**Mandatory step before declaring Phase 2 sealed.** Implementer executes via the assistant's Zo MCP tools:

1. After `register_user_service(name="qor", ...)` completes, call `list_user_services`.
2. Locate the entry where `name == "qor"`.
3. Inspect `env_vars` object keys. Assert:
   - ✅ `NEO4J_URI` present with value `bolt://127.0.0.1:7687`
   - ✅ `NEO4J_USER` present with value `neo4j`
   - ✅ `NEO4J_PASS` present with value `victor-memory-dev`
   - ❌ `QOR_IPC_SOCKET` absent
   - ❌ `QOR_IPC_TOKEN_MAP` absent
4. If any assertion fails, invoke `update_user_service(service_id="<qor id>", ...)` to correct env_vars before running the bash canary.
5. Record the verified key list in the Phase 2 seal evidence.

This step is **not optional** — v4 explicitly pushes config-layer verification out of the automated canary and into the cutover operator's MCP-bound workflow, because the Zo service registry is only reachable from the MCP surface.

---

## Dependency Chain

```
v1 Phase 1 (sealed) → v1 Phase 2 (sealed, start.sh exists) → v4 Phase 1 [= v3 Phase 1] (start.sh hardening + bash harness scenarios 4–7) → v4 Phase 2 (atomic swap + bash canary + mandatory MCP runbook step)
```

v2 and v3 are superseded wholesale; no artifacts retained from either.

## Risk Ledger

*Inherited from v3. New / revised rows:*

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Socket-absence assertion races IPC boot if future phase re-enables IPC | v4 P2 | Canary runs post-cutover; assertion scoped to this phase's "IPC deliberately off" invariant, retired when IPC re-enabled. |
| Config-layer verification depends on implementer discipline (no automated test) | v4 P2 | Mandatory runbook step with explicit key list; seal evidence must record the verified list. Runtime-layer transitively proves positive keys (NEO4J_*); socket-absence proves negative keys (QOR_IPC_*). |
| Bash canary not discoverable by `bun test` | v4 P2 | Accepted; canary is explicitly bash because (a) it shells out to `curl`/`nc`/`test`, and (b) matches the Q1=A Phase 1 decision that `start.sh` ecosystem stays in bash. |

## Success Criteria

1. `bash qor/start.test.sh` exits 0 with scenarios 1–7 all passing. (Closes T1 from v2, inherited from v3.)
2. `bash qor/qor-live-canary.sh` exits 0 post-cutover — health 200, public route 200, Neo4j route live, Bolt bound, UDS sockets absent. (Closes T1r + X1 at runtime layer, closes C2 + R1 runtime + R2 runtime.)
3. Cutover runbook config-layer verification executed via MCP; env_var key list recorded in Phase 2 seal evidence. (Closes R2 at config layer, closes X1 via operator-bound verification rather than test-bound.)
4. All v2 success criteria (§1–7) met via inherited cutover sequence.
