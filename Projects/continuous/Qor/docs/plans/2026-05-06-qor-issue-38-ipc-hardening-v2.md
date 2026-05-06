# Plan: Issue #38 — Continuum IPC Hardening (7 Residual Items)

**Issue:** #38 — Continuum IPC hardening (7 residual items from Phase 1 IPC standup)
**Supersedes:** `docs/plans/2026-05-06-qor-issue-38-ipc-hardening.md` (VETO, 1 MAJOR — Item 7 targets wrong file)
**Risk Grade:** L2
**Depends On:** Issue #37 Phase 3 seal (`230c689`)

## Design Decisions (locked 2026-05-06)

- **Q1 = A** — Single phase, all 7 items. Tight coupling (registry return type change cascades to server + error codes); splitting adds integration overhead without reducing risk.
- **Q2 = A** — Error codes use kebab-case string enum. Values unchanged from current string literals; enum adds type safety and discoverability. No wire protocol change.
- **Q3 = A** — `stop(true)` enables drain. In-flight ops complete before socket close. Bounded by `DRAIN_TIMEOUT_MS = 5000`. `stop()` without argument retains instant-close behavior.

## Audit Remediation Crosswalk (v1 → v2)

| v1 Finding | Severity | v2 Resolution |
|---|---|---|
| **M-1** Item 7 targets `ipc/server.ts` for logging replacement, but it has zero `process.stdout.write` calls. Actual logging is in `service/server.ts` (lines 49, 131, 132, 147). `ipc-logger.ts` would be an orphan. | MAJOR | Item 7 Affected Files corrected to target `service/server.ts`. `ipc-logger.ts` consumed by `service/server.ts` (not `ipc/server.ts`). Build-path entry updated. |
| **R-1** Item 3 description says "callers must instanceof-check" but actual pattern is try/catch on errors. | MINOR | Item 3 description corrected: "dispatchOp throws typed errors; server.ts handleOpFrame catches and maps to error codes." |

## Context

Issue #37 Phase 1 stood up IPC on the `qor` mono-service. The gate audit passed with 7 residual items (non-blocking at L2 scope, now addressed here):

1. `execution-events.ts` exposes Neo4j-specific types from the IPC surface
2. Error codes are bare string literals with no central registry
3. `dispatchOp` return type is `Promise<unknown>` — callers must catch typed errors
4. No graceful shutdown — `stop()` immediately destroys the socket
5. `isValidPartition` type guard exists but lacks explicit test coverage
6. Token map reload requires full service restart
7. IPC server logging is ad-hoc `process.stdout.write` in `service/server.ts`

## Affected Files

| File | Change | LOC Est |
|------|--------|---------|
| `continuum/src/shared/execution-event-types.ts` | New — extracted types + re-export barrel | ≤60 |
| `continuum/src/memory/ops/execution-events.ts` | Re-export from shared; implementation unchanged | ±3 |
| `continuum/src/ipc/error-codes.ts` | New — `ErrorCode` enum + helpers | ≤40 |
| `continuum/src/ipc/server.ts` | ErrorCode enum + DispatchResult + drain + SIGHUP | +30 |
| `continuum/src/ipc/protocol.ts` | `DispatchResult` discriminated union type | +15 |
| `continuum/src/memory/ops/registry.ts` | `dispatchOp` returns `DispatchResult` | +10 |
| `continuum/src/ipc/ipc-logger.ts` | New — structured logger (stdout) | ≤30 |
| `continuum/src/service/server.ts` | Replace 4 `process.stdout.write` calls with `ipcLog()` | ±8 |
| `continuum/src/memory/partitions.ts` | Verify `isValidPartition` export (no change expected) | 0 |
| `continuum/tests/ipc/error-codes.test.ts` | New — enum coverage | ≤40 |
| `continuum/tests/ipc/dispatch-result.test.ts` | New — DispatchResult discrimination | ≤40 |
| `continuum/tests/ipc/graceful-shutdown.test.ts` | New — drain behavior | ≤60 |
| `continuum/tests/memory/partition-guard.test.ts` | New — explicit `isValidPartition` tests | ≤30 |
| `continuum/tests/ipc/token-reload.test.ts` | New — SIGHUP atomic swap | ≤50 |
| `continuum/tests/ipc/ipc-logger.test.ts` | New — structured format | ≤30 |
| `docs/SYSTEM_STATE.md` | IPC hardening section | +10 |
| `docs/META_LEDGER.md` | IMPLEMENT + SEAL entries | +20 |

## Changes

### Item 1: ExecutionEvent Type Extraction

- Create `continuum/src/shared/execution-event-types.ts` with all interfaces and types currently in `execution-events.ts`:
  - `ExecutionStatus`, `ExecutionEvent`, `ExecutionIntentLike`, `ExecutionResultLike`, `ValidationError`
- `execution-events.ts` re-exports from shared: `export type { ... } from "../shared/execution-event-types"`
- Implementation functions (`recordExecutionEvent`, `queryExecutionEvents`, `createExecutionEvent`, `validateExecutionEvent`) remain in `execution-events.ts`
- Zero breakage: all existing import sites resolve through re-exports

### Item 2: ErrorCode Enum

- New file `continuum/src/ipc/error-codes.ts`:
  ```ts
  export enum ErrorCode {
    AUTH_REQUIRED = "auth_required",
    AUTH_FAILED = "auth_failed",
    AUTH_ERROR = "auth_error",
    AUTH_TIMEOUT = "auth_timeout",
    UNKNOWN_OP = "unknown_op",
    ACCESS_DENIED = "access_denied",
    FRAME_ERROR = "frame_error",
    PROTOCOL_ERROR = "protocol_error",
    INTERNAL_ERROR = "internal_error",
  }
  ```
- Values match existing string literals exactly — no wire change
- `server.ts` uses enum members instead of bare strings
- Helper: `isErrorCode(val: string): val is ErrorCode`

### Item 3: DispatchResult Discriminated Union

- New type in `protocol.ts`:
  ```ts
  export interface DispatchOk { ok: true; value: unknown; }
  export interface DispatchErr { ok: false; code: ErrorCode; message: string; }
  export type DispatchResult = DispatchOk | DispatchErr;
  ```
- `dispatchOp` in `registry.ts` returns `Promise<DispatchResult>` instead of `Promise<unknown>`
- `server.ts` `handleOpFrame` branches on `result.ok` — eliminates try/catch error-mapping inline
- Additive: callers that don't use the discriminated union still work (`.value` / `.code`)

### Item 4: Graceful Shutdown Drain

- `IpcServerHandle.stop()` signature: `stop(drain?: boolean): Promise<void>`
- When `drain=true`:
  1. Stop accepting new connections (server.stop())
  2. Wait for in-flight ops to complete (track via counter)
  3. Timeout after `DRAIN_TIMEOUT_MS = 5000`
  4. Force-close remaining sockets
  5. Unlink socket
- When `drain=false` or omitted: instant close (existing behavior preserved)
- Wire into `service/server.ts` SIGTERM handler: `ipcHandle.stop(true)`

### Item 5: Partition Type Guard Test

- New test file `continuum/tests/memory/partition-guard.test.ts`
- Tests `isValidPartition` for:
  - Agent-private partitions: `"agent-private:victor"`, `"agent-private:qora"`, `"agent-private:forge"` → true
  - Shared partitions: `"shared-operational"`, `"canonical"`, `"audit"` → true
  - Invalid: `"agent-private:"`, `"agent-private"`, `""`, `"unknown"` → false
  - `isAgentPrivate` for agent-private vs shared vs invalid

### Item 6: SIGHUP Token Map Reload

- `ipc/server.ts` registers `process.on("SIGHUP", ...)` handler when IPC is active
- Handler calls `loadAgentTokenMap(tokenMapPath)` to get new map
- Atomic swap: replaces the closure-captured `tokenMap` variable
- No socket recreation, no connection drop
- On reload failure: log error via `ipcLog`, retain existing map (fail-open for availability)
- `SIGTERM` removes the SIGHUP listener

### Item 7: Structured IPC Logging

- New file `continuum/src/ipc/ipc-logger.ts`:
  ```ts
  export function ipcLog(event: string, data?: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify({ ts: Date.now(), src: "ipc", event, ...data }) + "\n");
  }
  ```
- **Target file: `service/server.ts`** (contains 4 ad-hoc `process.stdout.write` calls at lines 49, 131, 132, 147)
- Replace all 4 calls with `ipcLog()`:
  - Line 49: `ipcLog("sync", { newRecords: result.total - lastTotal, total: result.total })`
  - Line 131: `ipcLog("ipc_listening", { socketPath: ipcHandle.socketPath })`
  - Line 132: `ipcLog("started", { port: PORT })`
  - `ipc/server.ts` also uses `ipcLog` for auth/dispatch/drain events internally
- Events in `ipc/server.ts`: `auth_ok`, `auth_failed`, `op_dispatch`, `op_error`, `drain_start`, `drain_complete`, `token_reload`, `token_reload_failed`, `stop`
- No external dependencies. Stdout only (supervisor captures to `/dev/shm/qor.log`)

## Dependency Chain

```
Issue #37 Phase 3 SEAL (230c689)
  ↓ #38 (all 7 items, single phase, canary 8/8 unchanged)
```

## Test Summary

| Test File | Tests | Covers |
|-----------|-------|--------|
| `continuum/tests/ipc/error-codes.test.ts` | ~5 | Enum values, isErrorCode helper |
| `continuum/tests/ipc/dispatch-result.test.ts` | ~5 | DispatchOk/DispatchErr discrimination |
| `continuum/tests/ipc/graceful-shutdown.test.ts` | ~6 | Drain complete, drain timeout, instant close |
| `continuum/tests/memory/partition-guard.test.ts` | ~8 | isValidPartition, isAgentPrivate |
| `continuum/tests/ipc/token-reload.test.ts` | ~5 | SIGHUP reload, failed reload retains old map |
| `continuum/tests/ipc/ipc-logger.test.ts` | ~4 | Structured format, event names |

**Total: ~33 new tests**

## Risk Summary

| Item | Primary Risk | Mitigation |
|------|-------------|------------|
| 1 | Import breakage | Re-export from original path; zero call-site changes |
| 2 | Wire change | Values identical to existing string literals |
| 3 | Signature change | Return type is additive; callers can ignore |
| 4 | Drain timeout | Bounded by DRAIN_TIMEOUT_MS; falls back to force-close |
| 5 | None | Verify-only, no code change |
| 6 | SIGHUP race | Atomic swap; failed reload retains existing map |
| 7 | Log volume | Stdout only, no file I/O; supervisor captures |

## Explicit Non-Goals

- Wire protocol version bump
- TLS/encryption on IPC (UDS is local-only by design)
- Rate limiting or connection quotas
- Client-side retry logic
- Connection multiplexing
- Client-side timeout configuration
