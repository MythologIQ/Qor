# AUDIT_REPORT — QOR Issue #38 Plan v1

**Plan**: `docs/plans/2026-05-06-qor-issue-38-ipc-hardening.md`
**Plan SHA-256**: `83b1e5e0597e426a301b52663bf85a95f70164ec0c5dabfca3c8ace382ed64d7`
**Phase**: GATE — Adversarial Tribunal
**Date**: 2026-05-06
**Verdict**: ❌ **VETO**
**Risk Grade**: L2

---

## Summary

V1 addresses 7 IPC hardening items from the Issue #37 gate residual. Six items are grounded and well-scoped. One item (Item 7) targets the wrong file, and the plan's description of Item 3 mischaracterizes the current code pattern. One MAJOR finding (M-1) and one MINOR finding (R-1).

## Findings

| ID | Pass | Severity | Summary |
|---|---|---|---|
| M-1 | Macro-Architecture / Build-Path | MAJOR | Item 7 targets `ipc/server.ts` for logging replacement, but `ipc/server.ts` contains **zero** `process.stdout.write` calls (verified: `grep -c` returns 0). The ad-hoc logging actually lives in `service/server.ts` (lines 132, 135, 147). Plan's `ipc-logger.ts` module targets the wrong consumer and the `server.ts` §Changes for Item 7 will replace zero instances. The affected file in the plan should be `continuum/src/service/server.ts`, not `continuum/src/ipc/server.ts`. |
| R-1 | Ghost UI (description accuracy) | MINOR | Item 3 justification states "callers must instanceof-check" for `dispatchOp`'s `Promise<unknown>` return. Actual pattern: `handleOpFrame` (sole caller, `ipc/server.ts:60-67`) uses try/catch on the dispatch call and instanceof-checks **thrown errors** to derive error codes — it never instanceof-checks the return value. The DispatchResult discriminated union is a valid improvement, but the motivating description is inaccurate. |

## Pass-by-Pass

### Pass A — Security (PASS)
- No auth changes. No new auth surfaces. ✓
- SIGHUP reload is fail-open (retains old map on failure) — acceptable for local UDS. ✓
- ErrorCode enum values match existing wire literals exactly. No privilege escalation. ✓
- Token map atomic swap pattern is sound for single-writer (SIGHUP handler). ✓
- No new secrets, no injection vectors. ✓

### Pass B — Ghost UI (PASS — with R-1 flag)
- All proposed file paths verified against live repo. ✓
- `execution-events.ts` confirmed: 5 exported interfaces/types (line grep matches plan's extraction list). ✓
- `server.ts` error code literals confirmed at lines 64-66, 79, 88, 95, 109, 118. ✓
- `registry.ts` `dispatchOp` confirmed: returns `Promise<unknown>` (line grep matches). ✓
- **R-1**: Plan's Item 3 description says "callers must instanceof-check" but the actual pattern is try/catch on errors, not return-value discrimination. Description drift, not a ghost symbol.
- No fictional symbols. No invented APIs. ✓

### Pass C — Razor (PASS)
- `execution-event-types.ts` ≤60 LOC. ✓
- `error-codes.ts` ≤40 LOC. ✓
- `ipc-logger.ts` ≤30 LOC. ✓
- `server.ts` delta +30 LOC — current file is 181 LOC, post-change ~211 LOC. Under 250. ✓
- All test files under their stated limits. ✓
- Plan declares ≤40 LOC functions, depth ≤3, no nested ternaries, no `console.log`. ✓

### Pass D — Dependency / Toolchain (PASS)
- No new external dependencies. ✓
- `ErrorCode` enum uses TypeScript enum (zero runtime cost). ✓
- `ipcLog` uses `JSON.stringify` + `process.stdout.write` — Node/Bun builtins. ✓
- SIGHUP is a POSIX signal available in Bun runtime. ✓

### Pass E — Macro-Architecture (VETO — see M-1)
- Module boundaries are clear for Items 1-6. ✓
- **M-1**: Item 7 proposes `ipc-logger.ts` and says "Replace all `process.stdout.write` in `server.ts` with `ipcLog()` calls." But `continuum/src/ipc/server.ts` has **zero** `process.stdout.write` calls. The logging that exists is in `continuum/src/service/server.ts` (lines 132, 135, 147). The plan targets the wrong file for Item 7's implementation, which means:
  - The `ipc/server.ts` §Changes for Item 7 will be a no-op (replacing zero instances)
  - The actual ad-hoc logging in `service/server.ts` will remain untouched
  - Post-implementation verification would falsely pass (grep for `process.stdout.write` in `ipc/server.ts` already returns 0)

### Pass F — Build-Path / Orphan (PASS)
| Proposed File | Entry Point Connection | Status |
|---|---|---|
| `continuum/src/shared/execution-event-types.ts` | Re-exported by `execution-events.ts` → imported by IPC callers | Connected ✓ |
| `continuum/src/ipc/error-codes.ts` | Imported by `server.ts` + `registry.ts` | Connected ✓ |
| `continuum/src/ipc/ipc-logger.ts` | Imported by `service/server.ts` (should be — currently targets wrong file) | **Misrouted** (M-1) |
| `continuum/src/ipc/protocol.ts` (DispatchResult) | Imported by `registry.ts` + `server.ts` | Connected ✓ |
| `continuum/tests/*` | Test runner | Connected ✓ |

### Pass G — Reality Check (PASS — confirms findings)
- `ipc/server.ts` logging: confirmed zero `process.stdout.write`. ✓
- `service/server.ts` logging: confirmed at lines 132, 135, 147. ✓
- Error code literals in `server.ts`: confirmed at 7 locations matching plan's enum values. ✓
- `dispatchOp` return type: confirmed `Promise<unknown>`. ✓
- `stop()` signature: confirmed instant-close (no drain). ✓
- `tokenMap` closure capture: confirmed at `buildHandler(tokenMap)` line 102. ✓

## Root Pattern

The plan was written from the Issue #37 gate audit notes ("IPC server logging is ad-hoc") without re-verifying which file contains the logging. The Issue #37 audit correctly identified the logging as "ad-hoc" but the plan author mapped the remediation to `ipc/server.ts` instead of the actual location (`service/server.ts`). Classic "audit note → wrong file target" drift.

## Verdict

❌ **VETO** — M-1 is a build-path misrouting that would make Item 7 a no-op. The structured logger would be created but never called from the file that actually has the ad-hoc logging.

### Next Action

`/qor-plan` → v2 closing M-1 (correct Item 7 target file to `service/server.ts`, add it to Affected Files table, update §Changes Item 7). R-1 is non-blocking — fix the Item 3 description for accuracy.
