# Plan: QOR Mono-Service Cutover + Neo4j Lifecycle Coupling

**Date:** 2026-04-18
**Scope:** v3 mono-service migration items 1–4 (rename, IPC env-var, wrapper, atomic swap). Route migration (v3 Phase 2), Forge Chat (v3 Phase 3), and #38 IPC hardening are **out of scope** — separate plans.
**Upstream:** `2026-04-15-qor-mono-service-migration.md` v3 (Phase 1 landed). GitHub issues: none direct; enables #37 (Qora/Forge kernels) after this ships.

## Core Principle

Collapse user-facing service surface to **one** (`qor`) that owns the lifecycle of its Neo4j backing store. Neo4j stays a standalone JVM process inside the `qor` process group, coupled via a wrapper entrypoint. Complecting to avoid: service lifecycle, IPC transport identity, and process supervision are all kept as separate concerns internally; they converge at one boundary (the wrapper script).

## Open Questions

1. **Supervisor backoff semantics** — Zo's `register_user_service` restart policy: does it exponentially backoff on crashloops, or restart immediately? Plan assumes backoff exists; if not, Phase 2 wrapper gains an in-script crashloop counter. *Verification: audit phase.*
2. **`NEO4J_HOME` vs workspace-local data dir** — `/opt/neo4j` is read-only system install; data currently under `Projects/continuous/Qor/data/neo4j/`. Plan assumes `NEO4J_HOME=/opt/neo4j` + `NEO4J_CONF_DIR` override pointing at a workspace-local conf that sets `dbms.directories.data=<workspace>/data/neo4j`. *Verification: Phase 2 local smoke test.*
3. **IPC client socket path injection point** — `ContinuumClient.create({ socketPath })` is called by whoever boots Victor kernel. Current boot entrypoint not yet confirmed; Phase 1 must identify + inject `QOR_IPC_SOCKET` env read at that exact call site. *Verification: Phase 1 reconnaissance step.*

---

## Phase 1: Rename + IPC Socket Env-Var Migration

**Goal:** Package + env-var rename. No service re-registration. System still runs as `continuum-api` at end of phase; internals say `qor`.

### Affected Files

- `continuum/package.json` — rename `"name": "continuum"` → `"name": "qor"`.
- `continuum/src/service/server.ts` — rename env vars: `CONTINUUM_IPC_TRANSPORT` → `QOR_IPC_SOCKET` (value: bare socket path, no `unix:` prefix); `CONTINUUM_IPC_TOKEN_MAP` → `QOR_IPC_TOKEN_MAP`. Keep old names as fallback for one release (read new, fallback old). Default `QOR_IPC_SOCKET` to `/tmp/qor.sock`.
- `continuum/src/ipc/server.ts` — `startIpcServer` already accepts `transport: string`. Add helper `resolveTransport(socketPath)` that accepts either bare path or `unix:` prefix, normalizes to `unix:` internally. Default-when-empty stays undefined (caller's responsibility).
- `continuum/client/index.ts` — add `ContinuumClient.fromEnv()` static that reads `QOR_IPC_SOCKET` (fallback `CONTINUUM_IPC_TRANSPORT` without `unix:` prefix) + `QOR_IPC_TOKEN` (client auth), constructs `IpcClient` opts. Keep existing `.create(opts)` unchanged.
- **Caller injection site** (TBD — reconnaissance first) — Victor kernel boot: replace hardcoded `socketPath` with `ContinuumClient.fromEnv()`. If no boot entrypoint constructs the client (all tests pass opts explicitly), defer to consumer plan.
- `continuum/bin/continuum-service` (if present) or `package.json#scripts.start` — rename script name to `qor:start`; keep old script as alias for one release.
- `docs/plans/2026-04-15-qor-mono-service-migration.md` — strike Phase 1 items now covered here; add pointer to this plan.

### Changes

1. Reconnaissance: `grep -rn "ContinuumClient.create\b" /home/workspace/Projects/continuous/Qor/{victor,qora,forge}/src` to identify boot-site for `fromEnv` injection.
2. Env-var rename with fallback ladder: `QOR_IPC_SOCKET` → `CONTINUUM_IPC_TRANSPORT` → error. Identical pattern as existing `QOR_PORT`/`CONTINUUM_PORT`.
3. `fromEnv()` static: 12-ish lines. Reads env, throws `IpcClientError("config", "QOR_IPC_SOCKET not set")` if absent.
4. No behavioral change. No socket path change on wire (defaults to `/tmp/qor.sock` only when caller passes nothing; existing service registration still passes `unix:/tmp/continuum.sock` as before).

### Unit Tests

- `continuum/src/service/server.test.ts` (extend) — env-var fallback ladder: `QOR_IPC_SOCKET` wins over `CONTINUUM_IPC_TRANSPORT`; bare path gets `unix:` prepended; missing both → no IPC started. Important: prevents silent config drift during transition.
- `continuum/src/ipc/server.test.ts` (extend) — `resolveTransport` idempotent (`unix:/a/b.sock` → `unix:/a/b.sock`; `/a/b.sock` → `unix:/a/b.sock`). Important: normalization correctness.
- `continuum/client/from-env.test.ts` (new) — `ContinuumClient.fromEnv()` reads `QOR_IPC_SOCKET`; falls back to `CONTINUUM_IPC_TRANSPORT`; throws typed error when both absent. Important: deterministic client construction.
- If Victor boot-site found: corresponding kernel test confirming client construction goes through `fromEnv`.

---

## Phase 2: Wrapper Entrypoint + Resiliency Overlay

**Goal:** Create the `qor/start.sh` wrapper that owns Neo4j lifecycle. Verified locally. Still not yet registered as the service entrypoint.

### Affected Files

- `qor/start.sh` (new, repo root `Projects/continuous/Qor/qor/start.sh`) — boot gate + liveness watchdog + exec bun. Executable bit set.
- `qor/neo4j.conf` (new) — minimal Neo4j config override: `dbms.directories.data`, `dbms.directories.logs`, `server.default_listen_address=127.0.0.1`, `server.bolt.listen_address=127.0.0.1:7687`. Points at workspace-local data dir.
- `qor/README.md` (new) — entrypoint spec: env vars (`NEO4J_BOOT_TIMEOUT`, `NEO4J_LIVENESS_INTERVAL`, `QOR_IPC_SOCKET`, `QOR_IPC_TOKEN_MAP`, `QOR_PORT`), exit codes, SIGTERM handling.
- `qor/start.test.sh` (new) — bash test harness that shells out to start.sh with a fake Neo4j stub to verify boot-gate timeout and liveness-watchdog kill.

### Changes

1. `qor/start.sh` content:
   ```bash
   #!/usr/bin/env bash
   set -eo pipefail
   : "${NEO4J_BOOT_TIMEOUT:=90}"
   : "${NEO4J_LIVENESS_INTERVAL:=30}"
   : "${NEO4J_HOME:=/opt/neo4j}"
   : "${NEO4J_CONF_DIR:=$(dirname "$0")/neo4j.conf}"
   export NEO4J_HOME NEO4J_CONF_DIR

   "$NEO4J_HOME/bin/neo4j" console &
   NEO4J_PID=$!

   deadline=$(( $(date +%s) + NEO4J_BOOT_TIMEOUT ))
   until exec 3<>/dev/tcp/127.0.0.1/7687 2>/dev/null; do
     [[ $(date +%s) -gt $deadline ]] && { echo "qor: neo4j boot timeout" >&2; kill $NEO4J_PID 2>/dev/null; exit 1; }
     sleep 1
   done
   exec 3<&-

   (
     while true; do
       sleep "$NEO4J_LIVENESS_INTERVAL"
       kill -0 $NEO4J_PID 2>/dev/null || { echo "qor: neo4j pid dead" >&2; kill -TERM 0; exit 1; }
       exec 3<>/dev/tcp/127.0.0.1/7687 2>/dev/null || { echo "qor: bolt unreachable" >&2; kill -TERM 0; exit 1; }
       exec 3<&-
     done
   ) &

   cd "$(dirname "$0")/.."
   exec bun run continuum/src/service/server.ts
   ```
   - `exec 3<>/dev/tcp/...` is a pure-bash port probe (no `nc` dependency).
   - `kill -TERM 0` signals the entire process group so both Bun and Neo4j die together, supervisor restarts the tree clean.
   - `exec bun` replaces wrapper PID with Bun PID so supervisor tracks Bun directly.
2. `qor/neo4j.conf` points `dbms.directories.data=/home/workspace/Projects/continuous/Qor/data/neo4j`.
3. Local verification (pre-Phase-3): stop current `neo4j` service, run `bash qor/start.sh` interactively, confirm `curl localhost:4100/health` returns 200, confirm Bolt reachable, kill Neo4j → wrapper dies within `NEO4J_LIVENESS_INTERVAL+1s`.

### Unit Tests

- `qor/start.test.sh` (new) — three scenarios, each invoking start.sh with a stub neo4j binary:
  1. Stub opens port 7687 promptly → wrapper continues past boot gate (asserted via presence of child bun-stub exec).
  2. Stub never opens port → wrapper exits non-zero after `NEO4J_BOOT_TIMEOUT=2s`.
  3. Stub opens port then dies → watchdog kills process group within `NEO4J_LIVENESS_INTERVAL=2s+grace`.
  Important: boot-gate and watchdog are the resiliency guarantees; regression here is a silent outage risk.

---

## Phase 3: Atomic Service Swap + Cutover Verification

**Goal:** Delete `neo4j` + `continuum-api`, register `qor` with the wrapper entrypoint. Verify full system health.

### Affected Files

- **No source file changes** (purely operational). Uses Zo service tools: `delete_user_service`, `register_user_service`.
- `/home/workspace/AGENTS.md` — update service table to `qor` only; remove `neo4j` row; update the stale `.neo4j/start-neo4j.sh` reference.
- `/home/workspace/Projects/continuous/Qor/AGENTS.md` — update service state section.
- `docs/plans/2026-04-18-qor-mono-service-cutover.md` — append Session Log entry once cutover verified.
- `docs/SYSTEM_STATE.md` (if present) — service inventory update.

### Changes

1. **Pre-cutover checklist** (run from audit output):
   - Phase 1 + Phase 2 merged to main; tests green.
   - `qor/start.sh` verified locally per Phase 2.
   - Snapshot current service IDs: `neo4j=svc_Vw2b3WN68nM`, `continuum-api=svc_JsVdYqujQAw`.
   - Rollback plan documented (below).
2. **Cutover sequence**:
   a. `delete_user_service(svc_Vw2b3WN68nM)` (neo4j) — stops Java.
   b. `delete_user_service(svc_JsVdYqujQAw)` (continuum-api) — stops Bun.
   c. `register_user_service(name="qor", mode="http", local_port=4100, entrypoint="/home/workspace/Projects/continuous/Qor/qor/start.sh", env_vars={QOR_IPC_SOCKET: "/tmp/qor.sock", QOR_IPC_TOKEN_MAP: "...", QOR_PORT: "4100"})`.
   d. Wait 30s for Neo4j boot.
   e. Verify: `curl localhost:4100/health` → 200; `curl https://qor-frostwulf.zocomputer.io/health` → 200; Bolt 7687 reachable from host.
3. **Post-cutover verification**:
   - Run Victor `continuum-store` tests against live `qor` — confirms IPC path end-to-end.
   - Tail `/dev/shm/qor.log` for 2 min, look for clean startup pattern.
4. **Rollback** (if cutover fails):
   - `delete_user_service(<new qor svc_id>)`.
   - `register_user_service(name="neo4j", ...)` with corrected entrypoint `/opt/neo4j/bin/neo4j console` (the entrypoint that actually works, **not** the stale `.neo4j/start-neo4j.sh` from old AGENTS.md).
   - `register_user_service(name="continuum-api", ...)` with prior config.
   - Document failure mode in plan's Session Log.

### Unit Tests

- **No new unit tests** (operational phase). Verification = live smoke:
  - `tests/integration/qor-live-health.test.ts` (new) — drives `curl` against the live service after cutover; asserts `/health`, `/ipc/status`, IPC round-trip via `ContinuumClient.fromEnv()`. Important: substantiates cutover success, runnable as a post-deploy canary.
  - Existing `continuum/tests/*` suite must remain green against the live service.

---

## Dependency Chain

```
Phase 1 (rename/env-var)  →  Phase 2 (wrapper local-verified)  →  Phase 3 (atomic swap)
```

No cross-phase parallelism. Each phase is independently committable.

## Risk Ledger

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Wrapper can't bind to `NEO4J_HOME=/opt/neo4j` (read-only) | 2 | Use `NEO4J_CONF_DIR` override pointing at workspace conf; verify in Phase 2 smoke test. |
| Supervisor lacks backoff → crashloop storms | 3 | Verify in audit. If absent, add in-script counter writing `/dev/shm/qor-crashloop` with exit-0 after N consecutive failures. |
| Old service IDs re-used before DNS propagation | 3 | `register_user_service` returns new ID; no reuse assumption. |
| Clients with old env vars silently break | 1 | Fallback ladder (new → old → error) + log warning on old-var use. |
| Victor boot site not found in recon | 1 | Phase 1 scope narrows to server + client facade; consumer injection deferred to #37 plan. Flagged as open question. |

## Success Criteria

1. Single user-service `qor` visible in `list_user_services`; `neo4j` and `continuum-api` gone.
2. `curl https://qor-frostwulf.zocomputer.io/health` returns 200.
3. Bolt 7687 reachable inside the `qor` process group; unreachable externally.
4. Victor `continuum-store` live tests green against `qor`.
5. Killing Neo4j PID externally causes `qor` to die and auto-restart within `NEO4J_LIVENESS_INTERVAL + supervisor_restart_delay`.
6. AGENTS.md service tables accurate.
