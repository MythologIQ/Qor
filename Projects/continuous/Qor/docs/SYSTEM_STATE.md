# SYSTEM_STATE — QOR Mono-Service Cutover (Phase 3 v5.1 P2 Implemented)

**As of:** 2026-04-22
**Cutover plan:** `docs/plans/2026-04-21-qor-phase3-cutover-v5.1.md`
**Phase sealed:** 2 (wrapper entrypoint) + Phase 3 v5 P1 (start.sh hardening). Phase 3 v5.1 P2 implemented; awaiting substantiation seal.
**Last chain hash (gate PASS):** `cc6f127eacd0dccd879d0e0de04f90f7127b0d1284c6b59b4f65960e0e812ee2`

---

## Phase 1 Artifacts (Reality)

| Path | Role | LOC | Status |
|------|------|-----|--------|
| `continuum/package.json` | Module identity (name: `qor`) | 16 | SEALED |
| `continuum/src/ipc/server.ts` | IPC server + `resolveTransport` normalizer | 181 | SEALED |
| `continuum/src/service/server.ts` | HTTP service + IPC boot w/ env fallback ladder | 153 | SEALED |
| `continuum/client/index.ts` | `ContinuumClient.fromEnv()` facade | 40 | SEALED |
| `continuum/tests/ipc/resolve-transport.test.ts` | Transport normalizer tests (4) | 25 | SEALED |
| `continuum/tests/client/from-env.test.ts` | Env-construction tests (5) | 66 | SEALED |

## Environment Contract (Post Phase 1)

| Variable | Purpose | Legacy Fallback |
|----------|---------|-----------------|
| `QOR_IPC_SOCKET` | Unix socket path (bare or `unix:`-prefixed) | `CONTINUUM_IPC_TRANSPORT` (deprecation warn) |
| `QOR_IPC_TOKEN_MAP` | Path to token map JSON | `CONTINUUM_IPC_TOKEN_MAP` |
| `QOR_IPC_TOKEN` | Client-side caller token | — |

Deprecation warning emitted on stdout when legacy var in use and new var absent.

## Phase 1 Test Surface

- Scoped suites (ipc/*, client/*): **33/33 pass**
- Full regression contains pre-existing failures gated on live Neo4j (outside Phase 1 scope; resolved by Phase 2/3 wrapper).

## Phase 2 Artifacts (Reality)

| Path | Role | LOC | Status |
|------|------|-----|--------|
| `qor/start.sh` (+x) | Wrapper entrypoint: env → spawn Neo4j → boot gate → watchdog → background-launch Bun → wait | 93 | SEALED (Phase 3 v5 P1) |
| `qor/neo4j.conf` | Workspace Neo4j override (127.0.0.1 listen; data/logs paths) | 9 | SEALED |
| `qor/README.md` | Entrypoint spec + env contract + exit codes + signal handling + Known Limitations | 60 | SEALED |
| `qor/start.test.sh` (+x) | 7-scenario bash harness (boot-pass, boot-timeout, liveness-kill, crashloop-cooldown, window-reset, preflight-probe, bun-watchdog) | 349 | SEALED (Phase 3 v5 P1) |

## Phase 2 Test Surface

- Bash harness: **7/7 pass** (boot_gate_pass, boot_gate_timeout, liveness_kill, crashloop_cooldown, crashloop_window_reset, preflight_port_probe, bun_watchdog)
- Stubs Neo4j via `$NEO4J_HOME` redirect and Bun via PATH shim; runs under `setsid` with per-scenario process-group reap.

## Phase 3 v5 Phase 1 Hardening (Sealed 2026-04-20)

Applied R3 + R4 closures in-place on `qor/start.sh` without structural change; extended `qor/start.test.sh` with scenarios 4–7:

- **R3 — Crashloop counter**: `/dev/shm/qor-crashloop` stateful counter, 3 failures / 60s window / 60s cooldown.
- **R4 Gap 1 — Pre-flight 7687 probe**: subshell-scoped `/dev/tcp` probe avoids stderr-silencing; orphan Neo4j detected and fails fast.
- **R4 Gap 2 — Bun PID watchdog**: background launch + `wait` replaces `exec`; supervisor sees Bun crash as wrapper exit.

Chain: `e15f8b67d86a92bfb867d6367fdf13086347408711b2f75b49696a7f743bedc5` (prev `b6792654…` v5 GATE PASS).

## Phase 3 v5.1 Phase 2 Implementation (2026-04-22)

Atomic service swap executed. Stale `neo4j` (`svc_Vw2b3WN68nM`) + `continuum-api` (`svc_JsVdYqujQAw`) deleted; single mono-service `qor` (`svc_2syCkir_MDw`) registered on port 4100 with entrypoint `qor/start.sh`.

### Artifacts

| Path | Role | LOC | Status |
|------|------|-----|--------|
| `qor/qor-live-canary.sh` (+x) | Post-cutover live canary; 6 assertions (health, public route, `/api/continuum/stats` JSON, Bolt `/dev/tcp`, UDS absence ×2) | 58 | Implemented |

### Config-Layer Assertions (MCP `list_user_services`)

| Assertion | Verdict |
|---|---|
| `NEO4J_URI=bolt://127.0.0.1:7687` present | ✅ |
| `NEO4J_USER=neo4j` present | ✅ |
| `NEO4J_PASS=victor-memory-dev` present | ✅ |
| `QOR_IPC_SOCKET` absent (IPC deferred) | ✅ |
| `QOR_IPC_TOKEN_MAP` absent (IPC deferred) | ✅ |

### Runtime Assertions (`bash qor/qor-live-canary.sh`)

6/6 PASS. Exit 0. Verified 2026-04-22.

### Known Phase 1-Sealed Surface Defects (Out of v5.1 Scope)

1. **Neo4j config dir ignored.** `start.sh:15` exports `NEO4J_CONF_DIR`, but Neo4j 2025 honors `NEO4J_CONF` instead. Effect: system conf `/opt/neo4j/conf/neo4j.conf` is used; workspace overrides (listen address, data dir) in `qor/neo4j.conf` are silent no-ops. Canary still passes because system conf binds Bolt on `0.0.0.0` and data dir points to an existing Neo4j store with live nodes. Follow-up: Phase 4 plan to swap env var name.
2. **Orphan Neo4j on early Bun death.** When Bun crashes before the 30s liveness subshell first tick, `wait $BUN_PID` returns and `start.sh` exits without signaling the Neo4j child; Neo4j is re-parented to init and binds 7687; next supervisor restart trips the pre-flight orphan probe and refuses to launch. Encountered once during v5.1 implementation; recovered by explicit TERM. Follow-up: Phase 4 plan to trap EXIT and TERM children.

## Substantiation

Phase 3 v5.1 Phase 2 **SEALED** at chain `d48264f8185425f24b6dd2b5324b1f08436289bfd087f3ed799e3706f1196f10` (2026-04-22). Reality = Promise verified (0 missing, 0 unplanned).

## Unshipped Phases

- **Phase 4** — resiliency patches for Phase 1-sealed defects (NEO4J_CONF env var name, EXIT-trap orphan handling).
- **Issue #38** — Phase 3.1 IPC hardening (7 residual items).

## Open Deferrals (Per Plan)

- **Q1** — Supervisor backoff verification; fallback is in-script crashloop counter.
- **Q3** — Victor boot-site injection (no production caller today); consumer switch tracked as Issue #37.
