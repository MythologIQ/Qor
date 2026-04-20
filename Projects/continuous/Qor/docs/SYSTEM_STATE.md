# SYSTEM_STATE — QOR Mono-Service Cutover (Phase 2 Sealed)

**As of:** 2026-04-18
**Cutover plan:** `docs/plans/2026-04-18-qor-mono-service-cutover.md`
**Phase sealed:** 2 of 3 (wrapper entrypoint + resiliency overlay)
**Last chain hash:** `d60746eade24b5a9b917c5e12fa96bc02e1af2d88536a6fd187dfe08e09638c3`

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
| `qor/start.sh` (+x) | Wrapper entrypoint: env → spawn Neo4j → boot gate → watchdog → `exec bun` | 45 | SEALED |
| `qor/neo4j.conf` | Workspace Neo4j override (127.0.0.1 listen; data/logs paths) | 9 | SEALED |
| `qor/README.md` | Entrypoint spec + env contract + exit codes + signal handling + Known Limitations | 60 | SEALED |
| `qor/start.test.sh` (+x) | 3-scenario bash harness (boot-pass, boot-timeout, liveness-kill) | 153 | SEALED |

## Phase 2 Test Surface

- Bash harness: **3/3 pass** (boot_gate_pass, boot_gate_timeout, liveness_kill)
- Stubs Neo4j via `$NEO4J_HOME` redirect and Bun via PATH shim; runs under `setsid` with per-scenario process-group reap.

## Unshipped Phases

- **Phase 3** — Atomic service swap via zo `register_user_service`. Requires live-state re-gate immediately before execution.

## Open Deferrals (Per Plan)

- **Q1** — Supervisor backoff verification; fallback is in-script crashloop counter.
- **Q3** — Victor boot-site injection (no production caller today); consumer switch tracked as Issue #37.
