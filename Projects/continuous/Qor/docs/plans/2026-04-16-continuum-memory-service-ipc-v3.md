# Plan: Continuum Memory Service with IPC Kernel Boundary (v3)

**Supersedes**: `2026-04-16-continuum-memory-service-ipc-v2.md` (VETO'd, audit v14)
**Chain**: `sha256:plan-continuum-memory-ipc-v2-audit-v1-veto → plan-continuum-memory-ipc-v3`
**Risk Grade**: L3
**Binds to Issue**: #36

## Architectural Intent

**Continuum is the Memory Service.** Sole owner of the Neo4j driver and the sole point of contact for any Cypher execution. All writes and reads — in-process (ingestion, derivation, HTTP graph-api) and out-of-process (Victor/Qora/Forge kernels) — funnel through `memory/ops/*`. The driver is a private implementation detail; no module outside `memory/` touches it.

**Kernels consume memory via local UDS IPC** with first-frame token auth, named-op dispatch, and partition-scoped ACL. Agent identity is server-resolved from the auth token, never client-supplied.

**Execution-dispatch emits `ExecutionEvent` records**, not `LearningPacket`. Execution events are raw, per-dispatch telemetry. They do **not** re-use the `LearningPacket` contract — that contract is reserved for post-hoc learning insights (lessons, debt impact, heat). Keeping the shapes separate preserves the existing `LearningPacket` consumer chain and keeps each record faithful to its meaning.

## Open Questions

- **F3 follow-up (from v2)**: Vector index dimension is read from `process.env.NEO4J_VECTOR_DIMENSIONS` (default `1024`) at schema-init. If production embedding model changes dimension, the schema needs rebuild — acknowledged as operator burden for this cycle.
- Quarantined executions (`status: "quarantined"`, missing evidence) — do they emit an `ExecutionEvent` with `verdict: "quarantined"` or get suppressed? Plan defaults to **emit**, so governance has a record.

## Audit v14 Remediation Map

| Violation | Phase | Remediation |
|---|---|---|
| V-ARCH-6 (LearningPacket contract mismatch) | Phase 3 | New `ExecutionEvent` shape distinct from `LearningPacket`. Runtime emits `events.execution.record`, not `events.index`. `LearningPacket` schema is untouched. Named factory enforces partition population. |
| V-RAZOR-2 (runtime.ts over ceiling) | Phase 3 | Extract `runtime/dependencies.ts` and `runtime/tick-persistence.ts`. `runtime.ts` drops to ~200L. New plan wiring lands in `dependencies.ts`, not `runtime.ts`. |
| F1 (continuum-store.ts budget inflated) | Phase 3 | Correct budget: 21 thin-delegator methods × ~3L = **100L / 150 ceiling (67%)**. |
| F2 (schema.ts caller unnamed) | Phase 1 | `continuum/src/service/server.ts` startup invokes `initializeSchema()`. Added to Phase 1 affected files. |
| F3 (≤95% ceiling self-violation) | Phase 1 | Pre-declared extraction: `memory/ops/semantic-helpers.ts` (~80L) receives 3 deepest Cypher builders from `semantic-graph.ts`. `semantic-graph.ts` drops to ~180L (72%). `continuum-store.ts` addressed by F1 fix. |

---

## Phase 1: Memory Core + Driver Consolidation

### Affected Files

- `continuum/src/memory/driver.ts` — **new**, ~60L. Lazy singleton; fail-closed on missing `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASS`; no fallback strings.
- `continuum/src/memory/partitions.ts` — **new**, ~40L. Partition taxonomy: `agent-private:<agentId>`, `shared-operational`, `canonical`, `audit`. Stamping/parsing pure functions.
- `continuum/src/memory/access-policy.ts` — **new**, ~100L. Default-deny ACL: agent may write/read own `agent-private`; read/write `shared-operational` per-op; read-only `canonical`/`audit` (audit append-only).
- `continuum/src/memory/schema.ts` — **new**, ~90L. Exports `initializeSchema(driver)`. Constraints + vector index init. Reads `NEO4J_VECTOR_DIMENSIONS` env (default 1024).
- `continuum/src/memory/ops/learning-events.ts` — **new**, ~180L. 6 ops: `initialize`, `close`, `events.index`, `events.query`, `events.update`, `events.updateHeatmap`.
- `continuum/src/memory/ops/execution-events.ts` — **new**, ~120L. Factory + schema + 2 ops: `createExecutionEvent(intent, result)` pure factory; Zod `ExecutionEventSchema`; `events.execution.record`, `events.execution.query`. Partition is server-stamped from `agentCtx.agentId`.
- `continuum/src/memory/ops/semantic-graph.ts` — **new**, ~180L. 6 ops: `graph.upsertDocument`, `graph.replaceDocumentChunks`, `graph.loadDocumentSnapshot`, `graph.upsertSemanticNodes`, `graph.markSemanticNodesTombstoned`, `graph.upsertSemanticEdges`. 3 deepest Cypher builders delegated to `semantic-helpers.ts`.
- `continuum/src/memory/ops/semantic-helpers.ts` — **new**, ~80L. Pure Cypher-builder functions: `buildUpsertSemanticNodesCypher`, `buildUpsertSemanticEdgesCypher`, `buildTombstoneCypher`. No session/transaction handling.
- `continuum/src/memory/ops/search.ts` — **new**, ~200L. 6 ops: `search.chunks`, `search.chunksByVector`, `search.semanticNodes`, `search.expandNeighborhood`, `search.loadFreshCacheEntries`, `search.appendIngestionRun`. Plus `graph.upsertCacheEntries` + `graph.markCacheEntriesStale` moved here since they pair with cache-read ops.
- `continuum/src/memory/ops/registry.ts` — **new**, ~90L. Named-op dispatch table; maps op-name string → `(params, agentCtx) => Promise<result>`; ACL check wraps every call. Includes `events.execution.*` entries.
- `continuum/src/service/server.ts` — **modify**, ~+15L. Import `initializeSchema` + `getDriver` from `memory/`; invoke `await initializeSchema(getDriver())` in startup sequence (before IPC server listen). Named caller resolves F2.
- `continuum/src/ingest/memory-to-graph.ts` — **modify**, drop to ~200L. Replace local driver + inline Cypher with calls to `memory/ops/semantic-graph.ts` and `memory/ops/search.ts` (`appendIngestionRun`). Delete local `neo4j.driver()`.
- `continuum/src/derive/semantic-derive.ts` — **modify**, ~150L. Replace raw `neo4j.int()`/direct driver reads with `memory/ops/semantic-graph.ts` + `memory/ops/search.ts` calls.
- `continuum/src/derive/procedural-mine.ts` — **modify**, ~160L. Same migration pattern as `semantic-derive.ts`.
- `continuum/src/service/graph-api.ts` — **modify**, ~120L. Delete local `getDriver()` + `NEO4J_PASS ?? "victor-memory-dev"` hardcoded fallback. HTTP handlers call `memory/ops/search.ts` for reads.

### Changes

**`memory/driver.ts`** owns the single `neo4j.driver()` call. Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASS` from env; throws on any missing. No defaults. Exports `getDriver()` (lazy) and `closeDriver()`.

**`memory/partitions.ts`** defines the `Partition` union type and pure helpers `stampPartition(data, partition)`, `parseAgentId(partition)`, `isAgentPrivate(partition)`.

**`memory/access-policy.ts`** exports `assertCanWrite(agentCtx, partition, opName)` and `assertCanRead(...)`. Throws `AccessDeniedError` with structured reason. No return-false silent denials.

**`memory/schema.ts`** exports `initializeSchema(driver)`. Caller: `continuum/src/service/server.ts` startup, invoked once before IPC server begins accepting connections.

**`memory/ops/execution-events.ts`** is the partition-safety cornerstone:

```typescript
import { z } from "zod";
import type { ExecutionIntent, ExecutionResult } from "../../../../victor/src/heartbeat/execution-dispatch";

export const ExecutionEventSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  partition: z.string().min(1),   // required, non-empty — rejects "" and undefined
  taskId: z.string().min(1),
  phaseId: z.string().min(1).optional(),
  source: z.string().min(1),
  status: z.enum(["completed", "blocked", "failed", "quarantined"]),
  timestamp: z.number().int().positive(),
  summary: z.string().optional(),
  testsPassed: z.number().int().nonnegative().optional(),
  filesChanged: z.array(z.string()).optional(),
  acceptanceMet: z.boolean().optional(),
  verdict: z.string().optional(),
});
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

export function createExecutionEvent(
  intent: ExecutionIntent,
  result: ExecutionResult,
): ExecutionEvent { /* derives partition = `agent-private:${intent.agent}` */ }
```

Op handler for `events.execution.record` calls `ExecutionEventSchema.parse(event)` at entry; throws `ValidationError` on missing/empty partition. Only construction path for callers is `createExecutionEvent` (imported symbol). TypeScript `readonly partition: string` (non-optional) makes the factory the only ergonomic builder.

**`memory/ops/semantic-graph.ts`** becomes a pure orchestration layer over `semantic-helpers.ts` for Cypher construction. Each op opens a session, calls a builder, executes, closes.

**`memory/ops/semantic-helpers.ts`** is side-effect-free. Each builder returns `{ cypher: string; params: Record<string, unknown> }`. Trivially testable without a Neo4j connection.

**`memory/ops/registry.ts`** exports `OP_TABLE: Record<string, OpHandler>` — single source of truth for named ops. `ipc/server.ts` dispatches via this table.

**`ingest/memory-to-graph.ts`** becomes a pure orchestration layer: parse input → call `graph.upsertDocument` → call `graph.replaceDocumentChunks` → call `graph.upsertSemanticNodes/Edges` → call `search.appendIngestionRun`. No raw Cypher in this file.

**`derive/semantic-derive.ts`** + **`derive/procedural-mine.ts`** call `search.expandNeighborhood` / `graph.loadDocumentSnapshot` / `graph.upsertSemanticNodes` instead of opening their own sessions.

**`service/graph-api.ts`** HTTP handlers call `search.chunks` / `search.semanticNodes` / `search.expandNeighborhood`. Driver reference and hardcoded credentials deleted.

**`service/server.ts`** adds `await initializeSchema(getDriver())` to startup before IPC listen. Failure aborts process start (fail-closed).

### Unit Tests

- `continuum/tests/memory/driver-fail-closed.test.ts` — Driver throws `MissingEnvError` when any of `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASS` is unset.
- `continuum/tests/memory/driver-single-owner.test.ts` — **Enforcement test**: scans `continuum/src/` for `neo4j.driver(` substring and asserts 0 matches outside `memory/driver.ts`. Fails loudly if a new import site is added.
- `continuum/tests/memory/partitions.test.ts` — `stampPartition` + `parseAgentId` round-trip; reject malformed partition strings.
- `continuum/tests/memory/access-policy.test.ts` — Agent A denied write to `agent-private:agent-b`; denied write to `canonical`; allowed read `shared-operational`; `audit` is append-only (write allowed, update/delete denied).
- `continuum/tests/memory/ops-learning-events.test.ts` — `events.index` stamps `agent_id` + `partition`; `events.query` filters out other agents' private events; `events.updateHeatmap` merges counters.
- `continuum/tests/memory/ops-execution-events.test.ts` — `createExecutionEvent(intent, result)` derives `partition = "agent-private:${intent.agent}"`; schema round-trips; event without partition rejected by `ExecutionEventSchema.parse`; `events.execution.record` stamps `agent_id` + `partition` on Neo4j node; `events.execution.query` filters other agents' events.
- `continuum/tests/memory/ops-execution-events-factory-only.test.ts` — `recordExecution({ ... no partition ... })` throws `ValidationError`. Hand-crafted event with empty partition throws. Factory-produced event passes.
- `continuum/tests/memory/ops-semantic-graph.test.ts` — `graph.upsertDocument` idempotent; `graph.replaceDocumentChunks` replaces fully (no orphan chunks); tombstone ops soft-delete (query excludes).
- `continuum/tests/memory/ops-semantic-helpers.test.ts` — Pure builders: each returns deterministic `{ cypher, params }` for fixed inputs; tombstone builder produces correct MATCH pattern.
- `continuum/tests/memory/ops-search.test.ts` — `search.chunksByVector` requires vector index present; returns empty on index miss; `search.expandNeighborhood` depth-bounded.
- `continuum/tests/memory/ops-registry.test.ts` — Unknown op name → `UnknownOpError`; known op dispatched with agentCtx; every op is ACL-gated (null agentCtx rejected); `events.execution.record` present in table.
- `continuum/tests/memory/schema-vector-dimensions.test.ts` — `NEO4J_VECTOR_DIMENSIONS=768` env propagates to vector index creation statement.
- `continuum/tests/service/server-schema-init.test.ts` — Server startup invokes `initializeSchema` exactly once before IPC listen; startup aborts on schema init failure.
- `continuum/tests/ingest/memory-to-graph-no-driver.test.ts` — `memory-to-graph.ts` source file scanned; assert 0 occurrences of `neo4j.driver(` or `import neo4j`.
- `continuum/tests/derive/no-driver.test.ts` — Both derive files scanned; 0 occurrences of `neo4j.driver(` or direct `neo4j.int(` without going through an op.
- `continuum/tests/service/graph-api-no-fallback.test.ts` — Source file scanned; 0 occurrences of `"victor-memory-dev"`.

---

## Phase 2: IPC Boundary

### Affected Files

- `continuum/src/ipc/protocol.ts` — **new**, ~70L. Frame format (`{len:u32}{body}`), `AuthFrame`, `OpFrame`, `ResultFrame`, `ErrorFrame`. Versioned.
- `continuum/src/ipc/auth.ts` — **new**, ~60L. First-frame token validation. Reads agent→token map from `/home/workspace/Projects/continuous/Qor/.secrets/ipc-agents.json` (file mode 0600, fail-closed on missing). Uses `timingSafeEqual` from `node:crypto`. Resolves `agentCtx = { agentId, partitions: [...] }`.
- `continuum/src/ipc/server.ts` — **new**, ~220L. Bun `Bun.listen()` on `unix:` socket only; fail-closed if `tcp:` or missing socket path. Socket permissions `0600`; parent dir `0700`. Per-connection: await auth frame → resolve agentCtx → pump op-frames through `ops/registry.ts`.
- `continuum/src/ipc/client.ts` — **new**, ~200L. UDS client. Sends auth frame first, then typed `call(opName, params)` methods. Auto-reconnect with backoff; in-flight op IDs for response correlation.
- `continuum/src/service/server.ts` — **modify**, start IPC server alongside HTTP. `unix:/home/workspace/Projects/continuous/Qor/.secrets/continuum.sock`. (Schema init from Phase 1 runs before IPC listen.)
- `continuum/client/index.ts` — **new**, ~40L. Re-exports `IPCClient` and typed `ContinuumClient` facade.

### Changes

**Transport discipline**: `ipc/server.ts` asserts the socket path begins with `unix:` at startup. Any TCP attempt panics. Socket file and parent dir permissions verified on bind.

**Auth**: First frame within 2s deadline. Bearer token compared via `timingSafeEqual`. Agent identity resolved server-side from token map. Client never supplies agent ID.

**Dispatch**: Server loop reads `OpFrame { opName, params, reqId }`, calls `OP_TABLE[opName](params, agentCtx)`, returns `ResultFrame` or `ErrorFrame`. Unknown ops → structured error. ACL failures → structured error (never silent).

**Client**: Typed methods on `ContinuumClient` match `OP_TABLE` keys exactly. Methods are thin wrappers over `call(opName, params)` with generic typing.

### Unit Tests

- `continuum/tests/ipc/protocol-frames.test.ts` — Encode/decode round-trip for all frame types; reject frames with invalid length prefix.
- `continuum/tests/ipc/auth-first-frame.test.ts` — Second-frame op before auth-frame → `AuthFrameRequiredError`; auth-frame with invalid token → `AuthFailedError`; valid token → `agentCtx` resolved; timeout > 2s → connection dropped.
- `continuum/tests/ipc/auth-timing-safe.test.ts` — Invalid token of correct length vs. invalid token of wrong length have comparable rejection timing (within 2x variance across 100 trials).
- `continuum/tests/ipc/server-unix-only.test.ts` — Attempting to bind `tcp:` path throws `InvalidTransportError`.
- `continuum/tests/ipc/server-socket-permissions.test.ts` — After `listen()`, socket file mode is `0600` and parent dir is `0700`.
- `continuum/tests/ipc/server-dispatch.test.ts` — Known op dispatched, agentCtx injected; unknown op → structured `UnknownOpError` frame; ACL-denied op → `AccessDeniedError` frame.
- `continuum/tests/ipc/client-reconnect.test.ts` — Server restart mid-session; client reconnects, re-auths, resumes with new reqIds.

### Handoff Checklist

- [ ] **F2 pre-flight (from v2)**: Create `.secrets/ipc-agents.json` (mode 0600) with entry `{ "victor-kernel": "<VICTOR_KERNEL_TOKEN>" }`. Token generated via `openssl rand -hex 32`.
- [ ] Ensure `.secrets/` dir mode 0700, owner `root`.
- [ ] Confirm `unix:/home/workspace/Projects/continuous/Qor/.secrets/continuum.sock` path not in a tmpfs that gets wiped on restart without a recreate step.

---

## Phase 3: Kernel Cutover via Execution-Dispatch

### Affected Files

- `victor/src/kernel/memory/continuum-store.ts` — **new**, ~100L. Implements `ExecutionEventStore` + `LearningStore` interfaces; every method is a one-line delegator `return this.client.call("<opName>", params)`. Stateless wrapper — `client` held by reference. Budget: 100L / 150 ceiling (67%).
- `victor/src/kernel/memory/store.ts` — **modify**, ~70L. Add `createLearningStore(client)` factory and `createExecutionEventStore(client)` factory, both returning `new ContinuumStore(client)`. Keep existing `LearningStore` interface unchanged. Add `ExecutionEventStore` interface (2 methods: `record(event)`, `query(filter)`).
- `victor/src/kernel/memory/neo4j-store.ts` — **delete**. Dead code; no runtime consumer.
- `victor/src/heartbeat/runtime/dependencies.ts` — **new**, ~80L. Extracts from `runtime.ts`: `resolveWriteBackConfig`, `resolveExecutionRunner`, plus new `resolveContinuumClient` and `resolveExecutionEventStore` factories. `dependencies.ts` is the sole home for runtime wiring decisions. Budget: 80L / 150 ceiling (53%).
- `victor/src/heartbeat/runtime/tick-persistence.ts` — **new**, ~100L. Extracts from `runtime.ts`: `createTickId`, `buildRecordPath`, `persistRecord`, `persistOutcome`, `finalizeTick`, `buildExecutedResult`, `shouldRejectCompletedExecution`. Budget: 100L / 150 ceiling (67%).
- `victor/src/heartbeat/runtime.ts` — **modify**, drops to ~200L / 250 ceiling (80%). Imports from `runtime/dependencies.ts` and `runtime/tick-persistence.ts`. Invokes `executionEventStore.record(createExecutionEvent(intent, result))` via `dispatchExecution`. Construction of store happens in `dependencies.ts`, not inline.
- `victor/src/heartbeat/execution-dispatch.ts` — **modify**, ~140L. Accept optional `executionEventStore?: ExecutionEventStore` parameter. After `result` is produced (completed/quarantined/failed), call `executionEventStore.record(createExecutionEvent(intent, result))`. Non-fatal on store error (log + continue — execution path must not break on memory failure).

### Changes

**`continuum-store.ts`** is a transport adapter only. Each method forwards to the IPC op:
```typescript
record(event: ExecutionEvent) { return this.client.call("events.execution.record", { event }); }
query(filter) { return this.client.call("events.execution.query", { filter }); }
// ... and 19 existing LearningStore delegators at one line each
```
Realistic size: 2 import lines + class header + 21 three-line methods (signature, body, close brace) = ~70–100L. Budget set at 100L with decomposition fallback if overrun (split into `ContinuumLearningStore` + `ContinuumExecutionStore`).

**`store.ts`** adds two factories (`createLearningStore`, `createExecutionEventStore`) and the new `ExecutionEventStore` interface. Interfaces are kept narrow — each consumer imports only what it needs. `LearningStore` interface is **unchanged**; no existing caller breaks.

**`neo4j-store.ts`** is deleted — grep confirms no imports exist.

**`runtime/dependencies.ts`** centralizes runtime wiring. Exports:
- `resolveWriteBackConfig(ctx)` (moved as-is)
- `resolveExecutionRunner(ctx)` (moved as-is)
- `resolveContinuumClient(ctx)` (new; reads `.secrets/ipc-agents.json` token map path from env, connects to UDS socket)
- `resolveExecutionEventStore(ctx)` (new; calls `createExecutionEventStore(resolveContinuumClient(ctx))`)

**`runtime/tick-persistence.ts`** holds all tick-state file I/O and outcome shaping functions. Pure delegation from `runtime.ts`. No behavior change.

**`runtime.ts`** shrinks to the orchestration loop (`runHeartbeatTick`) plus the public entry point. Imports from `runtime/dependencies.ts` + `runtime/tick-persistence.ts`. Adds:
```typescript
const executionEventStore = resolveExecutionEventStore(ctx);
// passed to dispatchExecution
const result = await dispatchExecution(intent, runner, { executionEventStore });
```

**`execution-dispatch.ts`** gains an optional `executionEventStore` in its options bag. After producing `ExecutionResult`, if store provided, calls `executionEventStore.record(createExecutionEvent(intent, result))`. Memory-write failures are logged and swallowed — execution-dispatch must not fail because memory is down (fail-open on memory, fail-closed on governance is the existing doctrine).

**Pre-existing over-ceiling note**: The `runHeartbeatTick` function inside `runtime.ts` is ~170L, violating the 40L function ceiling. This is a **pre-existing defect** not introduced by this plan. It warrants its own remediation plan and is explicitly **out of scope** for v3. v3's extraction closes the **file ceiling** (runtime.ts ≤ 250L); the function-ceiling remediation is tracked separately.

### Unit Tests

- `victor/tests/kernel/continuum-store-delegates.test.ts` — Each `LearningStore` method forwards the exact op name + params to a mock `ContinuumClient`. `record(event)` forwards to `events.execution.record`. `query(filter)` forwards to `events.execution.query`. 23 assertions total (21 learning + 2 execution).
- `victor/tests/kernel/store-factory.test.ts` — `createLearningStore(mockClient)` returns instance implementing `LearningStore`; `createExecutionEventStore(mockClient)` returns instance implementing `ExecutionEventStore`. Structural typecheck + runtime method presence.
- `victor/tests/kernel/no-neo4j-store.test.ts` — Repository scan asserts `neo4j-store.ts` file does not exist and `Neo4jLearningStore` symbol has 0 occurrences.
- `victor/tests/heartbeat/execution-event-factory.test.ts` — `createExecutionEvent(intent, result)` is pure: same input → same output; derives `partition = "agent-private:${intent.agent}"`; Zod schema rejects event with empty partition; factory-produced event always passes schema.
- `victor/tests/heartbeat/execution-dispatch-emits.test.ts` — With mock `executionEventStore`, completed execution triggers exactly one `store.record()` call with `createExecutionEvent(intent, result)`. Quarantined execution also emits (status: "quarantined"). Without `executionEventStore`, no calls made (backwards-graceful).
- `victor/tests/heartbeat/execution-dispatch-memory-fail-open.test.ts` — `executionEventStore.record()` throws; `dispatchExecution` still returns `ExecutionResult` successfully (no propagation of memory error).
- `victor/tests/heartbeat/runtime-dependencies.test.ts` — `resolveContinuumClient(ctx)` returns the same client instance on repeated calls within a process (singleton). `resolveExecutionEventStore(ctx)` produces a store bound to the resolved client. Test file exercises `dependencies.ts` in isolation.
- `victor/tests/heartbeat/runtime-tick-persistence.test.ts` — Each extracted function from `tick-persistence.ts` tested in isolation: `createTickId` uniqueness; `buildRecordPath` format; `persistRecord` writes JSON; `shouldRejectCompletedExecution` logic matrix.
- `victor/tests/heartbeat/runtime-wiring.test.ts` — Heartbeat startup constructs exactly one `ContinuumClient`, one `ExecutionEventStore`; both passed to every `dispatchExecution` invocation in that process.

### End-to-End Verification

- `continuum/tests/e2e/victor-execution-event-roundtrip.test.ts` — Spins up Continuum IPC server + Victor heartbeat against a local Neo4j instance. Dispatches a fake completed task. Asserts: (a) IPC auth succeeds with `VICTOR_KERNEL_TOKEN`; (b) `events.execution.record` op received; (c) Neo4j `ExecutionEvent` node created with `agent_id="victor"` + `partition="agent-private:victor"`; (d) Cypher query from a different agent token cannot read the event.

---

## Razor Budget Summary (Post-Remediation)

| File | v2 Budget | v3 Budget | Ceiling | % | Source lines/method ratio |
|---|---|---|---|---|---|
| `memory/driver.ts` | 60 | 60 | 80 | 75% | — |
| `memory/partitions.ts` | 40 | 40 | 60 | 67% | — |
| `memory/access-policy.ts` | 100 | 100 | 150 | 67% | — |
| `memory/schema.ts` | 90 | 90 | 120 | 75% | — |
| `memory/ops/learning-events.ts` | 180 | 180 | 250 | 72% | 6 × ~30L |
| `memory/ops/execution-events.ts` | — | 120 | 200 | 60% | factory + schema + 2 ops × ~30L |
| `memory/ops/semantic-graph.ts` | 240 | 180 | 250 | 72% | 6 × ~30L (3 deepest delegated) |
| `memory/ops/semantic-helpers.ts` | — | 80 | 150 | 53% | 3 pure builders × ~25L |
| `memory/ops/search.ts` | 200 | 200 | 250 | 80% | 6 × ~33L + 2 cache ops |
| `memory/ops/registry.ts` | 80 | 90 | 150 | 60% | +2 execution-events entries |
| `ipc/protocol.ts` | 70 | 70 | 100 | 70% | — |
| `ipc/auth.ts` | 60 | 60 | 80 | 75% | — |
| `ipc/server.ts` | 220 | 220 | 250 | 88% | near-ceiling; decomposition target `ipc/dispatch-loop.ts` pre-declared if overrun |
| `ipc/client.ts` | 200 | 200 | 250 | 80% | — |
| `victor/kernel/memory/continuum-store.ts` | 240 | **100** | 150 | 67% | 23 × ~3L delegator; budget corrected per F1 |
| `victor/heartbeat/runtime.ts` | untracked | 200 | 250 | 80% | decomposed to `runtime/dependencies.ts` + `runtime/tick-persistence.ts` |
| `victor/heartbeat/runtime/dependencies.ts` | — | 80 | 150 | 53% | 4 resolver functions |
| `victor/heartbeat/runtime/tick-persistence.ts` | — | 100 | 150 | 67% | 7 functions extracted from runtime.ts |
| `victor/heartbeat/execution-dispatch.ts` | 140 | 140 | 250 | 56% | +optional store param |

All files ≤ 95% of ceiling except `ipc/server.ts` at 88% (near-ceiling; decomposition target pre-declared). ≤95% rule satisfied.

---

## Phase Ordering Verified

- Phase 1 imports only standard libs + `neo4j-driver`. No forward refs.
- Phase 2 imports `memory/ops/registry.ts` from Phase 1. OK.
- Phase 3 imports `memory/ops/execution-events.ts` (for `createExecutionEvent` factory + `ExecutionEventSchema`) from Phase 1, and IPC client from Phase 2. OK.

No earlier phase imports a later phase.

---

## Relationship to ARCHITECTURE_PLAN.md

This plan **extends** ARCHITECTURE_PLAN.md's Continuum section by adding the IPC boundary and agent-private partition ACL. No contradictions. No supersedes declaration required.
