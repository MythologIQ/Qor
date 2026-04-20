# qor/ — Mono-Service Entrypoint

The `qor` service is a single supervised process that owns the lifecycle of its Neo4j backing store and the Bun IPC+HTTP runtime. This directory contains only the operational artifacts used to boot and supervise that process group.

## Files

| File | Role |
|------|------|
| `start.sh` | Executable wrapper. Launches Neo4j, waits for Bolt, starts a liveness watchdog, then `exec`'s the Bun service. |
| `neo4j.conf` | Workspace-local Neo4j override (data/logs paths + 127.0.0.1 listen addresses). Loaded via `NEO4J_CONF_DIR`. |
| `start.test.sh` | Bash harness exercising boot-gate and liveness-watchdog scenarios with stubbed binaries. |

## Environment Contract

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEO4J_BOOT_TIMEOUT` | `90` (seconds) | Abort if Bolt (7687) unreachable within this window. |
| `NEO4J_LIVENESS_INTERVAL` | `30` (seconds) | Watchdog probe cadence; also the maximum detection latency for Neo4j death. |
| `NEO4J_HOME` | `/opt/neo4j` | Root of the Neo4j install. `start.sh` invokes `$NEO4J_HOME/bin/neo4j console`. |
| `NEO4J_CONF_DIR` | `$(dirname $0)` | Directory containing the `neo4j.conf` override. Defaults to this folder. |
| `QOR_IPC_SOCKET` | `/tmp/qor.sock` (caller-supplied) | Unix socket path for IPC listener (see `continuum/src/ipc/server.ts`). |
| `QOR_IPC_TOKEN_MAP` | — | Path to the IPC token map JSON. Service skips IPC boot if absent. |
| `QOR_PORT` | `4100` (continuum default) | HTTP port for the Bun service. |

## Exit Codes

| Code | Cause |
|------|-------|
| `0`  | Clean shutdown (signal-delivered). |
| `1`  | Boot-gate timeout (Bolt never opened) **or** watchdog detected Neo4j death or Bolt unreachable post-boot. |
| other | Propagated from `bun` (service crash). |

## Signal Handling

- The watchdog subshell runs inside the same process group as `start.sh`/`bun`. On liveness failure it calls `kill -TERM 0`, which signals the entire process group.
- `exec bun …` replaces the wrapper shell PID with the Bun runtime PID. The supervisor (Zo `register_user_service`) tracks the Bun PID directly.
- On external `SIGTERM` to the service: supervisor → Bun → Bun exits → process group teardown → watchdog and Neo4j receive hangup chain.

## Local Verification

```bash
# 1. Ensure no stray Neo4j already listening on 7687.
# 2. Run the wrapper interactively.
cd /home/workspace/Projects/continuous/Qor
QOR_IPC_TOKEN_MAP=/path/to/tokens.json bash qor/start.sh
```

Verify (in a second shell):

```bash
curl -fsS localhost:4100/health       # expect 200
bash -c ': >/dev/tcp/127.0.0.1/7687'  # expect exit 0
```

Kill the Neo4j Java PID and confirm the wrapper dies within `NEO4J_LIVENESS_INTERVAL + 1s`.

## Known Limitations

- **Watchdog does not monitor Bun.** If Bun crashes after `exec`, the watchdog (parented to Bun's PID) is orphaned and continues to keep Neo4j alive until Neo4j itself dies. This is documented as a Phase 2 audit non-blocking finding and is tracked for resolution during Phase 2 local smoke or Phase 3 cutover verification.
- **`neo4j.conf` hardcodes the workspace data path.** If the repo relocates, update `dbms.directories.data` / `dbms.directories.logs` accordingly.
