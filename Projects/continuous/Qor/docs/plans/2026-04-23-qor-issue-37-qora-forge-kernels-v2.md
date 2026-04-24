# Plan: Issue #37 — Qora/Forge Direct Continuum IPC Consumption (v2)

**Issue:** #37 — Qora/Forge kernels direct Continuum IPC consumption
**Supersedes:** `docs/plans/2026-04-22-qor-issue-37-qora-forge-kernels.md` (VETO chain `285c39134e88…`, 3 MAJOR findings)
**Blocks:** Agents running as governed tenants in their own partitions
**Risk Grade:** L3 (kernel standup + service-config cutover + route migration)
**Depends On:** Phase 3 v5.1 seal (`d48264f8…`)

## Open Questions

None. Design dialogue locked 2026-04-22 and 2026-04-23 (VETO remediation):

- Q1 = A — minimal identity inline (string-constant agent IDs + per-kernel identity struct).
- Q2 = A — enable `QOR_IPC_SOCKET` + `QOR_IPC_TOKEN_MAP` on `qor` service (cutover-style operation).
- Q3 = A — mirror Victor kernel *structure* verbatim for governance parity (within exposed surface).
- Q4 = B — full route migration for event/ledger writes; retire JSONL ledgers.
- **T1 = A** — canary remediation: change `QOR_IPC_SOCKET_PATHS` default to `/tmp/continuum.sock` only; add separate positive block for `/tmp/qor.sock`.
- **T2 = C** — scope narrowing: kernels expose ONLY `events.*` ops (auto-partition via `agentPrivate(ctx.agentId)` at `learning-events.ts:72`). Cache/graph/search ops deferred to follow-up issue.
- **T3 = A** — kernel writes chain hash (`prevHash = <last entry hash>`, `hash = computeHash(prevHash, type, payload)`) and persists as Neo4j node properties. Cutover seeds with last JSONL entry's hash.

## Context

Qora and Forge currently have no memory kernel. Their routes (`continuum/src/service/api/qora-routes.ts`, `forge-routes.ts`) persist directly to flat JSONL files (`qora/data/ledger.jsonl`, `.qore/projects/builder-console/ledger.jsonl`). Victor owns the only kernel today (`victor/src/kernel/memory/continuum-store.ts` wired through `ContinuumClient` over UDS IPC), but IPC was explicitly deferred on the `qor` service at Phase 3 seal (`QOR_IPC_SOCKET` absent from service env).

This plan closes the gap by (a) enabling IPC on the live service, (b) standing up narrow Qora+Forge kernels that mirror Victor's structural pattern **only for `events.*` ops** (which auto-partition server-side), and (c) migrating the ledger-append/read routes to delegate to kernels. Non-event operations (cache/graph/search) remain on Victor-only until a follow-up issue adds partition-stamping.

Continuum server-side primitives already exist and are tested: `continuum/src/ipc/auth.ts` (token map + constant-time compare), `continuum/src/memory/access-policy.ts` (default-deny ACL keyed on `agentId` vs `agent-private:<agentId>` partition), `continuum/src/memory/partitions.ts` (`agentPrivate("qora")`, `agentPrivate("forge")` produce valid partitions today — no ACL changes required for new tenants), `continuum/src/memory/ops/learning-events.ts:72` (auto-stamps `partition = agentPrivate(ctx.agentId)` on every `events.index` call).

## Audit Remediation Crosswalk

| v1 Finding | Severity | v2 Resolution Location |
|---|---|---|
| **T1** canary contradiction (loop asserts `/tmp/qor.sock` ABSENT, plan wants PRESENT) | MAJOR | Phase 1 §Changes step 5 — two concrete line-level edits to `qor-live-canary.sh`: default-list narrows to `/tmp/continuum.sock`; new positive block for `/tmp/qor.sock`. |
| **T2** partition stamping gap (non-event ops default to `shared-operational`) | MAJOR | Scope narrowing locked at Q-T2=C — kernels expose ONLY `events.*` ops. Phase 2 kernel surface = `writeEvent` (chain-aware) + `queryRecentEvents`. No cache/graph/search mirror. |
| **T3** hash chain continuity silent on migration | MAJOR | Phase 2 §Kernel surface — `writeEvent` computes `prevHash + hash` and persists as Neo4j node properties. Phase 3 §Cutover seed — reads last JSONL entry hash and injects as `prevHashSeed` before first kernel write. |
| **R1** line-number off-by-2 (129-134 vs 127-135) | MINOR | Phase 1 §Changes step 4 — corrected to `server.ts:127-135`. |
| **R2** canary script `upsertCacheEntries` mismatch | MINOR | Phase 1 §Affected Files — `scripts/ipc-canary-victor.ts` calls `events.index` (event-layer op, auto-partitioned) instead of `upsertCacheEntries`. Method exists on kernel surface per T2=C. |
| **R3** `queryRecentEvents` not on Victor's `LearningStore` | MINOR | Phase 2 §Kernel surface — `queryRecentEvents` documented as deliberate extension over `events.query`, wrapping with `{ limit, orderBy: "seq DESC" }`. Added to kernel surface (not Victor's — Qora/Forge specific). |
| **R4** svc_id reconfirmation at cutover | MINOR | Phase 1 §Changes step 1.5 — explicit `list_user_services` pre-check, must match `svc_2syCkir_MDw`. |

---

## Phase 1: Identity + IPC Token Infra + Service Cutover (L2)

**Goal:** Enable IPC on the `qor` service, provision agent tokens, prove Victor still works over live UDS.

### Affected Files

- `.secrets/ipc-agents.json` (new) — 0600-permission JSON: `{"victor-kernel":"<token>","qora-kernel":"<token>","forge-kernel":"<token>"}`. Tokens generated as 32-byte base64 via `openssl rand -base64 32`.
- `.secrets/README.md` (new) — one-paragraph doc on the file's role + regeneration procedure.
- `.gitignore` — add `/.secrets/` (exclude secrets from git entirely).
- `qor/qor-live-canary.sh` — T1=A remediation: narrow `QOR_IPC_SOCKET_PATHS` default; add positive assertion block for `/tmp/qor.sock`; add assertion 8 (Victor IPC roundtrip).
- `scripts/ipc-canary-victor.ts` (new) — 40-LOC canary: constructs `ContinuumClient` with `VICTOR_KERNEL_TOKEN` env, calls `client.call("events.index", { type: "canary", payload: {...} })`, asserts response OK + `partition === "agent-private:victor"` in echo.
- `docs/SYSTEM_STATE.md` — Phase 1 artifacts + canary expansion.
- `docs/META_LEDGER.md` — IMPLEMENT entry.

### Changes

1. **Pre-cutover service reconfirmation (R4).** `list_user_services` → assert service named `qor` has id `svc_2syCkir_MDw` (matches `docs/SYSTEM_STATE.md:62`). Halt if drift.
2. **Generate tokens.** `openssl rand -base64 32` × 3 → `.secrets/ipc-agents.json`, `chmod 600`, verify mode via `stat -c %a`.
3. **Update `qor` service env_vars** via `update_user_service(svc_2syCkir_MDw, env_vars={...existing, QOR_IPC_SOCKET:"/tmp/qor.sock", QOR_IPC_TOKEN_MAP:"/home/workspace/Projects/continuous/Qor/.secrets/ipc-agents.json"})`.
4. **Verify config-layer MCP** — `list_user_services` → confirm both new keys present with expected values.
5. **Restart service** — supervisor picks up new env vars. `start.sh` has no IPC-specific logic; Bun server initializes IPC at module load because `continuum/src/service/server.ts:127-135` reads the env vars (R1 line-range corrected).
6. **T1=A canary edit.** Two concrete line-level changes to `qor/qor-live-canary.sh`:
   - **Edit A1 (line 43):** replace `QOR_IPC_SOCKET_PATHS=${QOR_IPC_SOCKET_PATHS:-/tmp/qor.sock /tmp/continuum.sock}` with `QOR_IPC_SOCKET_PATHS=${QOR_IPC_SOCKET_PATHS:-/tmp/continuum.sock}`. Default list no longer includes the active socket; loop continues to assert deprecated `/tmp/continuum.sock` is absent.
   - **Edit A2 (new block, inserted after line 51):** add assertion 7 body —
     ```bash
     # Assertion 7: /tmp/qor.sock is a socket with 0600 mode
     [[ -S /tmp/qor.sock ]] || fail "assertion 7: /tmp/qor.sock is not a socket"
     actual_mode=$(stat -c %a /tmp/qor.sock)
     [[ "$actual_mode" == "600" ]] || fail "assertion 7: /tmp/qor.sock mode $actual_mode != 600"
     pass "assertion 7: /tmp/qor.sock exists + mode 600"
     ```
   - **Edit A3 (new block, after assertion 7):** assertion 8 body —
     ```bash
     # Assertion 8: Victor kernel IPC roundtrip
     VICTOR_KERNEL_TOKEN=$(jq -r '."victor-kernel"' .secrets/ipc-agents.json) \
       bun run scripts/ipc-canary-victor.ts > /tmp/ipc-canary.log 2>&1 \
       || fail "assertion 8: Victor IPC roundtrip failed (see /tmp/ipc-canary.log)"
     pass "assertion 8: Victor IPC roundtrip"
     ```
7. **Run extended canary** — `bash qor/qor-live-canary.sh` → 8/8 pass.
8. **Record MCP assertions** in IMPLEMENT ledger entry (same format as Phase 3 §Phase 2 SEAL).

### Unit Tests

- `continuum/tests/ipc/token-map-roundtrip.test.ts` (new) — loads `.secrets/ipc-agents.json` via `loadAgentTokenMap()`, asserts three agent IDs resolve to distinct tokens, asserts invalid token throws `AuthFailedError`. Runner: `bun test`.
- `qor/qor-live-canary.sh` — assertions 7 & 8 added per T1=A edits above.
- `scripts/ipc-canary-victor.ts` — single-shot integration test; exit 0 on success, non-zero with diagnostic log on failure.

### Security Considerations

- Token file is **never committed** — `/.secrets/` in `.gitignore`; canary repo-check step asserts file absent from `git ls-files`.
- Token length: 32 bytes base64 = 256 bits entropy. Matches `auth.ts` constant-time compare expectations.
- Canary assertion 7 verifies socket permissions (owner-only, mode 600).

---

## Phase 2: Qora + Forge Kernel Standup — Events-Only Surface (L3)

**Goal:** Build independent kernels mirroring Victor's structural pattern for the narrow surface that auto-partitions server-side. Each kernel authenticates with its own token, writes to its own `agent-private:*` partition, preserves hash-chain continuity.

### Kernel Surface (T2=C scope narrowing)

Each kernel exposes **three methods**. No cache/graph/search mirror.

```
writeEvent(event: { type, payload, provenance }): Promise<PersistedEvent>
  // T3=A behavior: reads last entry's hash (via queryRecentEvents limit=1),
  // computes prevHash + hash, dispatches events.index with chain fields in payload.
  // Returns stored event with seq, hash, prevHash populated.

queryRecentEvents({ limit: number }): Promise<PersistedEvent[]>
  // R3 resolution: deliberate extension over events.query.
  // Wraps client.call("events.query", { limit, orderBy: "seq DESC" }).

getLastEventHash(): Promise<string | null>
  // Helper for T3 chain-seed during cutover. Returns null if partition empty.
```

No `upsertCacheEntries`, no `graph.*`, no `search.*`. Out of scope per T2=C. Victor's kernel is unaffected (still exposes its full surface).

### Affected Files

#### Qora kernel
- `qora/src/kernel/identity.ts` (new, ≤40 LOC) — exports `QORA_IDENTITY: AgentIdentity` with `{agentId:"qora", partition:agentPrivate("qora"), ipcToken:process.env.QORA_KERNEL_TOKEN}`. `AgentIdentity` type inline (no registry dep — per Q1=A).
- `qora/src/kernel/memory/continuum-store.ts` (new, ≤150 LOC) — events-only mirror: `writeEvent`, `queryRecentEvents`, `getLastEventHash`. Imports `computeHash` from shared helper (see cross-cutting).
- `qora/src/kernel/memory/store.ts` (new, ≤50 LOC) — factory returning `QoraMemoryStore` with `QORA_IDENTITY`.
- `qora/src/kernel/index.ts` (new, ≤20 LOC) — barrel re-export: `QoraKernel`, `getQoraMemoryStore()`.

#### Forge kernel
- `forge/src/kernel/identity.ts` (new, ≤40 LOC) — mirror with `agentId:"forge"`.
- `forge/src/kernel/memory/continuum-store.ts` (new, ≤150 LOC) — events-only mirror.
- `forge/src/kernel/memory/store.ts` (new, ≤50 LOC) — factory.
- `forge/src/kernel/index.ts` (new, ≤20 LOC) — barrel.

#### Cross-cutting
- `continuum/src/shared/hash-chain.ts` (new, ≤30 LOC) — lifts `computeHash(prevHash, type, payload): string` from `qora/src/api/append-entry.ts:33`. Shared by Qora + Forge kernel stores. Pure function; imported as `import { computeHash } from "continuum/shared/hash-chain"`.
- `qora/src/api/append-entry.ts` — refactor to re-export from `continuum/shared/hash-chain.ts`. Preserves existing callers until Phase 3 retires them.
- `continuum/src/memory/ops/learning-events.ts` — **no schema change**. Events carry `payload.hash` + `payload.prevHash` as opaque strings (server doesn't interpret; kernel owns chain semantics).
- `continuum/src/memory/access-policy.ts` — no changes. Existing `parseAgentId(partition)` equality works for `qora`/`forge`.
- `docs/SYSTEM_STATE.md` — Phase 2 artifacts section.
- `docs/META_LEDGER.md` — IMPLEMENT entry.

### Changes

1. Each kernel file mirrors Victor's **structural pattern** (identity + continuum-store + store + index) but exposes the narrow three-method surface above. Verbatim-mirror applies to pattern/layout, not method set (T2=C).
2. `writeEvent` implementation (identical in both kernels):
   ```ts
   async writeEvent({ type, payload, provenance }) {
     const prevHash = await this.getLastEventHash() ?? "";
     const hash = computeHash(prevHash, type, payload);
     const enriched = { type, payload: { ...payload, hash, prevHash }, provenance };
     return this.client.call("events.index", enriched);
   }
   ```
3. `getLastEventHash` queries with `limit: 1`, returns `events[0]?.payload?.hash ?? null`.
4. `computeHash` extraction is refactor-only — existing Qora route callers re-route through the shared helper in Phase 2; no semantic change.

### Unit Tests

- `qora/tests/kernel/identity.test.ts` — `QORA_IDENTITY.agentId === "qora"`, partition matches `agent-private:qora`.
- `qora/tests/kernel/continuum-store.test.ts` — mock `ContinuumClient`:
  - `writeEvent` with empty store → `prevHash === ""`, `hash === computeHash("", type, payload)`.
  - `writeEvent` with prior entry → `prevHash === priorEvent.hash`.
  - `queryRecentEvents` passes `limit` + `orderBy: "seq DESC"`.
  - `getLastEventHash` returns null on empty, returns most-recent hash otherwise.
- `qora/tests/kernel/roundtrip.test.ts` (integration) — live `qor` service, real `ContinuumClient` with Qora token, writes 3 events sequentially, reads back, asserts chain `hash[i] === computeHash(hash[i-1], type[i], payload[i])` and all entries have `partition: "agent-private:qora"`.
- `forge/tests/kernel/identity.test.ts`, `continuum-store.test.ts`, `roundtrip.test.ts` — mirrors.
- `continuum/tests/shared/hash-chain.test.ts` (new) — pure tests for `computeHash`: determinism, input sensitivity, hex output length.
- `continuum/tests/ipc/cross-agent-isolation.test.ts` (new) — **negative tests**. (a) Qora token reads `agent-private:victor` → `AccessDeniedError`. (b) Forge token reads `agent-private:qora` → `AccessDeniedError`. (c) Each agent reads own partition → success. Closes #37 AC item 6.

### Razor Compliance

- All new files ≤ 250 LOC (target ≤ 150 for kernel store, ≤ 30 for hash-chain).
- All functions ≤ 40 LOC.
- Nesting depth ≤ 3.
- Zero nested ternaries.
- Zero `console.log`.

---

## Phase 3: Qora + Forge Route Migration + Chain Seed (L3)

**Goal:** Retire JSONL ledgers; routes delegate to kernels. Chain continuity preserved across migration boundary. User-observable behavior: Qora/Forge ledger entries live in Neo4j under governed partitions; `/api/qora/status` verifier keeps working.

### Affected Files

#### Qora route migration
- `continuum/src/service/api/qora-routes.ts` — replace `parseLedger()` / `writeFileSync(LEDGER_PATH, ...)` with `getQoraMemoryStore().writeEvent(...)` / `getQoraMemoryStore().queryRecentEvents({limit})`. Response envelope `{seq, timestamp, type, hash, prevHash, payload, provenance, governanceDecisionId}` preserved — `seq` maps to Neo4j order, `hash`/`prevHash` sourced from `payload.hash`/`payload.prevHash` stamped by kernel.
- `qora/data/ledger.jsonl` — archived to `qora/data/ledger-2026-04-23.jsonl.archive` after chain-seed step (see Changes §1).
- `qora/src/api/status.ts` — **no changes**. Verifier at line 55 (`entries[i].prevHash !== entries[i-1].hash`) continues working because kernel now stamps matching fields.
- `qora/src/api/append-entry.ts` — already refactored in Phase 2 to re-export `computeHash` from shared; in Phase 3 this file is retired entirely (its write-path replaced by kernel).

#### Forge route migration
- `continuum/src/service/api/forge-routes.ts` — replace JSONL ledger read/writes with kernel calls; `readPhases()` / `writePhases()` stay file-based (phases are source-data, not ledger events — out of #37 scope).
- `.qore/projects/builder-console/ledger.jsonl` — archived per same pattern.

#### Cross-cutting
- `qor/qor-live-canary.sh` — add assertion 9 (`curl -fsS http://localhost:4100/api/qora/status` returns 200 with `source:"continuum"` marker and `chainValid: true`) and assertion 10 (same shape for Forge). Post-Phase-3 canary: 10/10 pass.
- `docs/SYSTEM_STATE.md` — route-migration section, JSONL-retirement note, chain-seed record.
- `docs/META_LEDGER.md` — IMPLEMENT + SEAL entries.

### Changes

1. **Chain seed (T3=A cutover step).** Before first kernel write per agent:
   - Read last line of `qora/data/ledger.jsonl`, extract its `hash`.
   - Dispatch a marker event via kernel: `writeEvent({ type: "migration.chain_seed", payload: { prevJsonlHash: <extracted> }, provenance: {...} })`. Kernel sets `prevHash = prevJsonlHash` explicitly (override path in `writeEvent` for this one call) so the first Neo4j entry's `prevHash` continues the JSONL chain.
   - Same procedure for Forge.
   - Seed step is idempotent: if marker already exists (Neo4j query), skip.
2. **Route handlers thin-wrap kernel calls.** Existing auth (bearer token via `auth(req)`) stays at the HTTP layer. Kernel identity travels as closure property.
3. **Response-shape compatibility.** Envelope preserved; any field that genuinely can't map (e.g., governance decisions) defaults to null explicitly — documented in route test assertions.
4. **JSONL archive, not delete.** Preserves rollback path for 30 days. Archived files in `.gitignore` via `*.archive` pattern.
5. **Retire `qora/src/api/append-entry.ts`** — delete after all callers switch to `getQoraMemoryStore().writeEvent`.

### Unit Tests

- `continuum/tests/api/qora-routes.test.ts` — mock kernel, assert route calls `writeEvent` with correct payload, response shape matches legacy envelope, `chainValid` field present.
- `continuum/tests/api/forge-routes.test.ts` — mirror.
- `continuum/tests/migration/chain-seed.test.ts` (new) — synthetic JSONL fixture with known last hash, run seed, assert first Neo4j entry has `payload.prevHash === <fixture last hash>`. Run seed twice, assert idempotence.
- `tests/e2e/qora-forge-lifecycle.test.ts` (new) — end-to-end: HTTP POST to `/api/qora/*` → kernel → IPC → Continuum → Neo4j → read back via HTTP GET → assert persistence survives service restart + chain verifies. Closes #37 AC items 1, 3, 4.

### Canary Expansion

- Extend `qor/qor-live-canary.sh` with assertions 9 + 10 (covered under Affected Files above). Post-Phase-3 canary: **10/10 pass**.

---

## Dependency Chain

```
Phase 3 v5.1 P2 SEAL       d48264f8…
  ↓ #37 Phase 1 (IPC on, canary 8/8)
  ↓ #37 Phase 2 (kernels, events-only surface)
  ↓ #37 Phase 3 (routes + chain seed, canary 10/10)
```

## Risk Summary

| Phase | Primary Risk | Mitigation |
|---|---|---|
| 1 | Service restart breaks `start.sh` orphan probe if socket lingers from prior Bun instance | Canary assertion 7 catches missing socket; supervisor restart → orphan probe (Phase 1 `start.sh`) auto-reaps |
| 2 | Cross-agent partition leak (ACL misconfigured) | Cross-agent negative tests (Phase 2 §Tests) — mandatory |
| 2 | Hash-chain divergence from existing `append-entry.ts` semantics | Shared `computeHash` extraction is refactor-only (identical bytes in, identical bytes out). Test covers determinism + input sensitivity. |
| 3 | Chain seed lost or duplicated on cutover retry | Seed idempotence test + marker event with known type (`migration.chain_seed`) allows detection |
| 3 | Route response-shape regression breaks UI consumers | Response-shape compat layer + integration test + canary assertion 9/10 |

## Explicit Non-Goals (per #37 + T2=C)

- Cache/graph/search kernel surface for Qora/Forge (deferred to follow-up issue; requires partition-stamping strategy).
- Combining kernels (stay independent — Q3=A).
- Exposing Continuum to external clients (IPC is local UDS only).
- JSONL backfill into Neo4j (archive-only; backfill = follow-up issue).
- Full #5 agent-identity-registry primitive (Q1=A minimal inline; follow-up issue).
- Governance/heartbeat/cost-governance features inside Qora/Forge kernels beyond what Victor has today.
- Server-side `resolvePartition` default change (T2-B rejected — breaking change for Victor).
- Chain-integrity carve-out (T3-C rejected — governance degradation).
