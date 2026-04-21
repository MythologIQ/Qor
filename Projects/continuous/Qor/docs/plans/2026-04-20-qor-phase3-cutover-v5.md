# Plan: Qor Phase 3 Cutover (VETO Remediation v5)

Supersedes v4 (`2026-04-18-qor-phase3-cutover-v4.md`). Closes single VETO finding N1 from audit chain `5b58f8a9…`. All other v4 design (Phase 1 start.sh hardening + bash harness scenarios 4–7, Phase 2 atomic swap, cutover sequence, rollback, R1/R2/R3/R4 remediations, config-layer runbook step) is inherited unchanged — this plan revises **only the Phase 2 canary assertion 3 endpoint**.

## Open Questions

- None. Design dialogue complete; v5 answer locked (Q1=A `/api/continuum/stats`).

## Phase 1: start.sh Hardening — Crashloop Counter + Orphan Reap + Bun Watchdog

**Inherited from v4 Phase 1 verbatim.** No changes.

### Affected Files

- `Projects/continuous/Qor/qor/start.sh` — crashloop counter (R3), pre-flight 7687 probe (R4 Gap 1), Bun PID watchdog (R4 Gap 2).
- `Projects/continuous/Qor/qor/start.test.sh` — extended with scenarios 4–7 (v3 spec, unchanged).

### Changes

*See v3 §Phase 1 Changes.*

### Unit Tests

*See v3 §Phase 1 Unit Tests.* Invocation: `bash qor/start.test.sh`. Exit code 0 iff scenarios 1–7 pass.

---

## Phase 2: Atomic Service Swap — env_vars Fix + IPC Deferral

**Goal:** Close R1 + R2. Identical cutover design to v4 Phase 2; only the canary assertion 3 endpoint changes (N1 closure).

### Affected Files

- **No source file changes** (operational).
- `AGENTS.md` (workspace root) + `Projects/continuous/Qor/AGENTS.md` — service table rewritten to single `qor` row. *(Unchanged from v4.)*
- `Projects/continuous/Qor/docs/SYSTEM_STATE.md` — service inventory update. *(Unchanged from v4.)*
- `Projects/continuous/Qor/qor/qor-live-canary.sh` — bash canary. *(Shell unchanged from v4; assertion 3 endpoint revised.)*
- `Projects/continuous/Qor/docs/plans/2026-04-20-qor-phase3-cutover-v5.md` (this file) — authoritative runbook.

### Changes

*Cutover sequence inherited from v4 Phase 2 (§Changes 1–4). Canary assertion 3 change:*

v4's canary assertion 3 probed `curl -fsS http://localhost:4100/api/continuum/memory?limit=1`. Reconnaissance against `continuum/src/service/router.ts` (v4 §Router inventory at audit time) confirms `/api/continuum/memory` is **not a registered route**: the router delegates `/api/continuum/*` to `moduleRoutes` + `handleGraphRoutes` + `handleLayerRoutes`, and none register `/memory`. Fallthrough returns HTTP 404, which does not discriminate Neo4j driver health from router routing — making the canary vacuous (N1).

v5 closes N1 by swapping to a **registered, zero-param, Neo4j-touching GET endpoint**: `/api/continuum/stats`. This route is handled inline in `handleGraphRoutes` (server.ts:72–74), calls `getGraphStats()` which executes Cypher against the Neo4j driver, and returns JSON aggregate counts. A 200 response with valid JSON proves:

1. The route is reachable (router wiring intact).
2. `getDriver()` resolved NEO4J_URI / NEO4J_USER / NEO4J_PASS successfully.
3. Bolt 7687 handshake succeeded under the configured credentials.
4. A Cypher read executed end-to-end.

Any of NEO4J_* being wrong, absent, or unresolvable collapses this assertion into a 500 or connection error — direct discrimination of env_vars reaching the process, which was the original intent of assertion 3.

### Unit Tests

- `qor/qor-live-canary.sh` — post-cutover bash canary. Invocation: `bash qor/qor-live-canary.sh`. Asserts (all must pass, exit code 0):

  1. **Liveness:** `curl -fsS http://localhost:4100/health` returns HTTP 200.
  2. **Public route:** `curl -fsS https://qor-frostwulf.zocomputer.io/health` returns HTTP 200.
  3. **Neo4j-backed route (R1 runtime proof):** `curl -fsS http://localhost:4100/api/continuum/stats` returns HTTP 200 with valid JSON. Confirms NEO4J_* env_vars were loaded into the process and the driver handshake succeeded. *(v5: endpoint swapped from orphan `/api/continuum/memory?limit=1` to registered `/api/continuum/stats`.)*
  4. **Bolt liveness:** `nc -z 127.0.0.1 7687` succeeds. Confirms Neo4j is up under qor's lifecycle.
  5. **IPC socket absence at `/tmp/qor.sock` (R2 runtime proof):** `test ! -e /tmp/qor.sock`.
  6. **IPC socket absence at `/tmp/continuum.sock` (R2 runtime proof):** `test ! -e /tmp/continuum.sock`.

  Each assertion emits a line on success (`PASS: <assertion name>`) or failure (`FAIL: <assertion name>: <detail>`) and bumps a failure counter. Script exits 0 iff counter is zero at end.

- `qor/start.test.sh` — unchanged from v3/v4 (scenarios 1–7).

### Cutover Runbook (manual config-layer verification)

*Inherited from v4 Phase 2 verbatim. Mandatory step; see v4 §Cutover Runbook for the `env_vars` key list assertions executed via `list_user_services` MCP tool.*

---

## Dependency Chain

```
v1 Phase 1 (sealed) → v1 Phase 2 (sealed, start.sh exists) → v5 Phase 1 [= v4 Phase 1 = v3 Phase 1] (start.sh hardening + bash harness scenarios 4–7) → v5 Phase 2 (atomic swap + bash canary [assertion 3 endpoint revised] + mandatory MCP runbook step)
```

v2, v3, and v4 are superseded wholesale; no artifacts retained from any.

## Risk Ledger

*Inherited from v4. New / revised rows:*

| Risk | Phase | Mitigation |
|------|-------|-----------|
| `/api/continuum/stats` response shape could change and break canary JSON parsing | v5 P2 | Canary uses `curl -fsS` which only checks HTTP status; no body-shape assertion. Any 200 with decodable JSON is sufficient. |
| `getGraphStats()` could succeed on a connectionless driver mock (false positive) | v5 P2 | No mock driver exists in the production server entry path; `getDriver()` resolves real `neo4j-driver` module. Combined with assertion 4 (Bolt 7687 bound), double-proof. |

## Success Criteria

1. `bash qor/start.test.sh` exits 0 with scenarios 1–7 all passing. (Closes T1 from v2, inherited from v3/v4.)
2. `bash qor/qor-live-canary.sh` exits 0 post-cutover — health 200, public route 200, **`/api/continuum/stats` 200 with JSON**, Bolt bound, UDS sockets absent. (Closes N1 from v4 + T1r + X1 runtime layer from v3 + C2 from v2 + R1 runtime + R2 runtime.)
3. Cutover runbook config-layer verification executed via MCP; env_var key list recorded in Phase 2 seal evidence. (Closes R2 at config layer, closes X1 via operator-bound verification.)
4. All v2 success criteria (§1–7) met via inherited cutover sequence.
