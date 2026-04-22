# Plan: Qor Phase 3 Cutover (VETO Remediation v5.1)

Supersedes v5 (`2026-04-20-qor-phase3-cutover-v5.md`). Closes single VETO finding D1 from audit chain `b19d4da8…`. All other v5 design (Phase 1 sealed at `e15f8b67…`, Phase 2 atomic swap, cutover sequence, rollback, R1/R2/R3/R4 remediations, config-layer runbook step, N1 `/api/continuum/stats` canary endpoint) is inherited unchanged — this plan revises **only the Phase 2 canary assertion 4 Bolt probe primitive**.

## Open Questions

- None. Design dialogue complete; v5.1 answer locked (Q1=A bash `/dev/tcp` idiom).

## Phase 1: start.sh Hardening — SEALED

**Status:** Sealed under v5 at chain `e15f8b67…`. No changes in v5.1.

---

## Phase 2: Atomic Service Swap — env_vars Fix + IPC Deferral

**Goal:** Close R1 + R2. Identical cutover design to v5 Phase 2; only the canary assertion 4 Bolt probe primitive changes (D1 closure).

### Affected Files

- **No source file changes** (operational).
- `AGENTS.md` (workspace root) + `Projects/continuous/Qor/AGENTS.md` — service table rewritten to single `qor` row. *(Unchanged from v5.)*
- `Projects/continuous/Qor/docs/SYSTEM_STATE.md` — service inventory update. *(Unchanged from v5.)*
- `Projects/continuous/Qor/qor/qor-live-canary.sh` — bash canary. *(Shell unchanged from v5; assertion 4 Bolt probe revised.)*
- `Projects/continuous/Qor/docs/plans/2026-04-21-qor-phase3-cutover-v5.1.md` (this file) — authoritative runbook.

### Changes

*Cutover sequence inherited from v5 Phase 2 (§Changes 1–4). Canary assertion 4 change:*

v5's canary assertion 4 invoked `nc -z 127.0.0.1 7687`. Host audit (2026-04-21):

| Probe | Result |
|---|---|
| `which nc` | not found |
| `which netcat` | not found |
| `which ncat` | not found |
| `apt list --installed 2>/dev/null \| grep -i netcat` | empty |

`nc` is absent. Assertion 4 would exit `127 (command not found)` on every invocation — indistinguishable from a real Bolt outage and collapsing the canary into an unreliable false-negative generator (D1).

v5.1 closes D1 by reusing the **exact same primitive Phase 1 already uses** throughout `qor/start.sh` (pre-flight orphan reap at line 40, boot-gate at line 49, mid-life watchdog at line 70): bash's `/dev/tcp` pseudo-device. This primitive is a kernel-level non-blocking connect provided directly by bash — zero external dependencies, zero new toolchain requirements, and already validated on this host under Phase 1's seal (`e15f8b67…`).

**Replacement:**

```bash
# v5 (broken):
nc -z 127.0.0.1 7687

# v5.1 (Phase 1 idiom):
(exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null && exec 3<&- 3>&-
```

The `exec 3<>` opens bidirectional file descriptor 3 against the TCP endpoint. `2>/dev/null` swallows the connect-refused stderr. The chained `exec 3<&- 3>&-` closes both halves of fd 3 cleanly after a successful probe so the canary does not leak descriptors across its remaining assertions.

### Unit Tests

- `qor/qor-live-canary.sh` — post-cutover bash canary. Invocation: `bash qor/qor-live-canary.sh`. Asserts (all must pass, exit code 0):

  1. **Liveness:** `curl -fsS http://localhost:4100/health` returns HTTP 200.
  2. **Public route:** `curl -fsS https://qor-frostwulf.zocomputer.io/health` returns HTTP 200.
  3. **Neo4j-backed route (R1 runtime proof):** `curl -fsS http://localhost:4100/api/continuum/stats` returns HTTP 200 with valid JSON. Confirms NEO4J_* env_vars were loaded into the process and the driver handshake succeeded. *(Inherited from v5.)*
  4. **Bolt liveness:** `(exec 3<>/dev/tcp/127.0.0.1/7687) 2>/dev/null && exec 3<&- 3>&-` succeeds. Confirms Neo4j is up under qor's lifecycle. *(v5.1: primitive swapped from absent `nc -z` to bash-builtin `/dev/tcp`, matching Phase 1 start.sh.)*
  5. **IPC socket absence at `/tmp/qor.sock` (R2 runtime proof):** `test ! -e /tmp/qor.sock`.
  6. **IPC socket absence at `/tmp/continuum.sock` (R2 runtime proof):** `test ! -e /tmp/continuum.sock`.

  Each assertion emits a line on success (`PASS: <assertion name>`) or failure (`FAIL: <assertion name>: <detail>`) and bumps a failure counter. Script exits 0 iff counter is zero at end.

- `qor/start.test.sh` — unchanged (scenarios 1–7, sealed under v5 Phase 1).

### Cutover Runbook (manual config-layer verification)

*Inherited from v5 Phase 2 verbatim; v4 §Cutover Runbook provides the `env_vars` key list assertions executed via `list_user_services` MCP tool.*

---

## Dependency Chain

```
v1 Phase 1 (sealed) → v1 Phase 2 (sealed, start.sh exists) → v5 Phase 1 (sealed e15f8b67…) → v5.1 Phase 2 (atomic swap + bash canary [assertion 4 primitive revised] + mandatory MCP runbook step)
```

v2, v3, v4, and v5 Phase 2 are superseded wholesale; v5 Phase 1 seal is inherited (not re-executed).

## Risk Ledger

*Inherited from v5. New / revised rows:*

| Risk | Phase | Mitigation |
|------|-------|-----------|
| `/dev/tcp` probe could succeed against a half-open socket (TIME_WAIT, orphan listener without backing process) | v5.1 P2 | Assertion 3 (`/api/continuum/stats` 200) already requires a live Cypher round-trip via the Neo4j driver. If Bolt is half-open, assertion 3 fails with 500 before assertion 4 is reached. Defense-in-depth. |
| bash `/dev/tcp` could be disabled in a future bash build (compile-time opt-out `--disable-net-redirections`) | v5.1 P2 | Host bash validated: Phase 1 start.sh already depends on this feature in 4 call sites, and is sealed at `e15f8b67…`. Regression would break Phase 1 first, surfacing before canary runs. |

## Success Criteria

1. `bash qor/start.test.sh` exits 0 with scenarios 1–7 all passing. (Closed by v5 Phase 1 seal.)
2. `bash qor/qor-live-canary.sh` exits 0 post-cutover — health 200, public route 200, `/api/continuum/stats` 200 with JSON, **Bolt bound via `/dev/tcp`**, UDS sockets absent. (Closes D1 from v5 + N1 from v4 + T1r + X1 runtime layer from v3 + C2 from v2 + R1 runtime + R2 runtime.)
3. Cutover runbook config-layer verification executed via MCP; env_var key list recorded in Phase 2 seal evidence. (Closes R2 at config layer, closes X1 via operator-bound verification.)
4. All v2 success criteria (§1–7) met via inherited cutover sequence.
