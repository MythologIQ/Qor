# Plan: Issue #37 — Qora/Forge Direct Continuum IPC Consumption (v7)

**Issue:** #37 — Qora/Forge kernels direct Continuum IPC consumption
**Supersedes:** `docs/plans/2026-04-28-qor-issue-37-qora-forge-kernels-v6.md` (VETO, 3 MAJOR — `record-veto` ungated / unrefactored / ghost-ledger recreation)
**Blocks:** Agents running as governed tenants in their own partitions
**Risk Grade:** L3 (kernel standup + service-config cutover + new server op family + route migration)
**Depends On:** Phase 3 v5.1 seal (`d48264f8…`)

## Open Questions

None. All locked through v1–v7 design dialogues. New in v7:

- **M-1/M-2/M-3 (v6) = prescribed** — Sweep `qora-routes.ts` for all `LEDGER_PATH` writers, not just named routes. Both `handleAppendEntry` and `handleRecordVeto` receive identical treatment: maintenance-mode gate + kernel delegation + post-archive safety.
- **VETO entry type handling = A** — Single `appendEntry` method on kernel handles all types including `type: "VETO"`. No dedicated `recordVeto` method. Route-level validation (requires `target`, `reason`) stays in the route handler.

All prior locked answers inherited unchanged (see Inherited Design Decisions below).

## Audit Remediation Crosswalk (v6 → v7)

| v6 Finding | Severity | v7 Resolution Location |
|---|---|---|
| **M-1 (v6)** `QORA_MAINTENANCE` gate covers only `POST /api/qora/append-entry`. `POST /api/qora/record-veto` (`qora-routes.ts:76-99`) remains ungated. | MAJOR | Phase 3 §Affected Files — `handleRecordVeto` receives identical `QORA_MAINTENANCE` guard at top of function. Phase 3 step 3a-3 quiesce probe extended to BOTH `/append-entry` AND `/record-veto`. |
| **M-2 (v6)** `handleRecordVeto` not refactored to call kernel. `:LedgerEntry` Neo4j chain missing all VETO entries post-cutover. | MAJOR | Phase 3 §Changes step 6 — `handleRecordVeto` refactored to call `getQoraMemoryStore().appendEntry({type: "VETO", payload: vetoPayload, provenance})`. Single `appendEntry` handles all types (design Q=A). |
| **M-3 (v6)** Post-archive, `/record-veto` recreates `ledger.jsonl` as parallel chain. Status verifier (Neo4j-only) cannot observe divergence. Silent split-brain. | MAJOR | Closed by M-2: once `handleRecordVeto` delegates to kernel, `writeFileSync(LEDGER_PATH, ...)` line 97 is eliminated. Post-refactor grep `writeFileSync.*LEDGER_PATH` returns zero matches across entire file. No ghost-ledger possible. Phase 3 §Changes adds acceptance gate: `grep -c "writeFileSync.*LEDGER_PATH" continuum/src/service/api/qora-routes.ts` must equal 0. |

## Inherited Design Decisions (v1–v6, all locked)

From v6 (maintenance-mode quiesce):
- **M-1 (v5→v6) = A** — Maintenance-mode quiesce closes cutover atomicity gap + seq-collision regression.

From v5 → v6:
- **R-1 (v4) = bundled** — `AgentContext` test fixtures inline.
- **R-2 (v4) = bundled** — Migration timestamp normalization.

From v3 → v4:
- **M-1 (v3) = A** — Op namespace: `events.ledger.*`.
- **M-2 (v3) = A** — Phase 1 canary via `events.execution.query`.
- **M-3 (v3) = A** — Two-test cross-agent isolation.
- **R-1/R-2/R-3 (v3) = approve** — Explicit cutover, unique constraint, schema location.

From v2 → v3:
- **Q1 = A** — New `events.ledger.*` ops + `:LedgerEntry` schema.
- **Q2 = A** — Server stamps partition; bare names.
- **Q3 = A + aii** — `mode: "live" | "import"`; `QOR_LEDGER_IMPORT=1`; genesis sentinel.
- **Q4 = A** — Phase 3 migrates Qora only.

From v1:
- **Q1-original = A** — Minimal identity inline.
- **Q2-original = A** — Enable IPC on `qor` service.
- **Q3-original = A** — Mirror Victor's pattern.

## Context

Qora and Forge currently have no memory kernel. Qora routes (`continuum/src/service/api/qora-routes.ts`) persist hash-chained ledger entries to `qora/data/ledger.jsonl` via `computeHash(prevHash, type, payload)` → base64 first 32 chars. **Two write sites** share identical semantics: `handleAppendEntry` (line 52-74) and `handleRecordVeto` (line 76-99). Both allocate `seq = entries.length + 1`, compute `prevHash` from last entry, and call `writeFileSync(LEDGER_PATH, ...)`. Forge routes write a flat untyped log via `forge/src/governance/ledger.ts`.

Victor owns the only kernel today. IPC was deliberately deferred on the `qor` service at Phase 3 seal.

This plan closes the gap by:
1. Standing up a new server-side `events.ledger.*` op family with its own `:LedgerEntry` Cypher schema;
2. Enabling IPC on the live `qor` service with bare-name agent IDs;
3. Building independent Qora + Forge kernels exposing both `events.*` and `events.ledger.*` surfaces;
4. Migrating **both** Qora ledger write sites (`handleAppendEntry` + `handleRecordVeto`) to kernel delegation;
5. Seeding the Qora chain at cutover via `events.ledger.append({mode:"import"})`;
6. Closing the cutover atomicity gap with maintenance-mode write quiesce applied to **all** write endpoints.

---

## Phase 1: Identity + IPC Token Infra + Service Cutover (L2)

**Goal:** Enable IPC on the `qor` service, provision bare-name agent tokens, prove Victor still works over live UDS via `events.execution.query` roundtrip.

### Affected Files

- `.secrets/ipc-agents.json` (new) — 0600-permission JSON: `{"victor":"<token>","qora":"<token>","forge":"<token>"}`. Tokens generated as 32-byte base64 via `openssl rand -base64 32`.
- `.secrets/README.md` (new) — one-paragraph doc on file's role + regeneration procedure.
- `.gitignore` — add `/.secrets/` (exclude secrets from git).
- `qor/qor-live-canary.sh` — narrow default `QOR_IPC_SOCKET_PATHS` list; add positive assertion block for `/tmp/qor.sock`; add assertion 8 (Victor IPC roundtrip via `events.execution.query`).
- `scripts/ipc-canary-victor.ts` (new) — ≤40-LOC canary: constructs `ContinuumClient` with `VICTOR_KERNEL_TOKEN` env, invokes `events.execution.query` with `{filter:{limit:1}}`, asserts OK.
- `docs/SYSTEM_STATE.md` — Phase 1 artifacts + canary expansion.
- `docs/META_LEDGER.md` — IMPLEMENT entry.

### Changes

1. **Pre-cutover service reconfirmation.** `list_user_services` → assert `qor` has id `svc_2syCkir_MDw`.
2. **Generate tokens.** `openssl rand -base64 32` × 3 → `.secrets/ipc-agents.json`, `chmod 600`.
3. **Update `qor` service env_vars** — add `QOR_IPC_SOCKET` + `QOR_IPC_TOKEN_MAP`.
4. **Verify config-layer** — `list_user_services` → confirm keys present.
5. **Restart service** — supervisor picks up new env vars.
6. **Canary edits** — narrow default socket list; add assertion 8 (Victor IPC roundtrip).

### Unit Tests

- `scripts/tests/ipc-canary-victor.test.ts` — mock IPC: auth + op dispatch returns OK.

---

## Phase 2: Server-Side `events.ledger.*` Op Family + Kernel Standup (L3)

**Goal:** New `:LedgerEntry` Cypher schema, `events.ledger.*` ops, Qora + Forge kernels, cross-agent isolation tests.

### Affected Files

- `continuum/src/memory/ops/ledger-events.ts` (new, ≤200 LOC) — `appendLedgerEntry`, `queryLedgerEntries`, `getLastLedgerHash`. Server auto-stamps `partition = agentPrivate(ctx.agentId)`. `append` has `mode: "live" | "import"` discriminator; `import` gated by `QOR_LEDGER_IMPORT=1`.
- `continuum/src/memory/ops/registry.ts` — register `events.ledger.append`, `events.ledger.query`, `events.ledger.getLastHash`.
- `continuum/src/memory/schema.ts` — add `:LedgerEntry` label + constraint `(partition, seq) IS UNIQUE` + index on `(partition, seq DESC)`.
- `continuum/src/shared/hash-chain.ts` (new, ≤30 LOC) — `computeHash(prevHash, type, payload): string` extracted from `qora/src/api/append-entry.ts:17`.

#### Qora kernel

- `qora/src/kernel/identity.ts` (new, ≤40 LOC) — `QORA_IDENTITY: {agentId:"qora", ipcToken: process.env.QORA_KERNEL_TOKEN}`.
- `qora/src/kernel/memory/continuum-store.ts` (new, ≤200 LOC) — events + ledger + import surfaces.
- `qora/src/kernel/memory/store.ts` (new, ≤50 LOC) — factory.
- `qora/src/kernel/index.ts` (new, ≤20 LOC) — barrel.

#### Forge kernel (identical structure)

- `forge/src/kernel/identity.ts` (new, ≤40 LOC)
- `forge/src/kernel/memory/continuum-store.ts` (new, ≤200 LOC)
- `forge/src/kernel/memory/store.ts` (new, ≤50 LOC)
- `forge/src/kernel/index.ts` (new, ≤20 LOC)

### Kernel Surface

```ts
class QoraMemoryStore {
  // LearningPacket surface (Victor-parity)
  index(packet: LearningPacket): Promise<{ id: string }>;
  queryRecent(query: LearningQuery): Promise<LearningPacket[]>;

  // Ledger surface (used by Qora routes in Phase 3)
  appendEntry(args: { type: string; payload: unknown; provenance?: unknown }):
    Promise<{ id: string; seq: number; hash: string; prevHash: string; timestamp: number }>;
  queryRecentLedgerEntries(args: { limit?: number; orderBy?: "seq ASC" | "seq DESC" }):
    Promise<LedgerEntry[]>;
  getLastEntryHash(): Promise<{ hash: string | null; seq: number | null }>;

  // Migration-only (Phase 3, behind QOR_LEDGER_IMPORT=1)
  importEntry(args: { seq: number; hash: string; prevHash: string;
    timestamp: number; type: string; payload: unknown; provenance?: unknown }):
    Promise<{ id: string }>;
}
```

`appendEntry` handles all types including `type: "VETO"` — no dedicated VETO method (design Q=A).

### Server-side Unit Tests

- `continuum/tests/memory/ledger-entries.test.ts` (new, ≤300 LOC):
  - Live append: empty → `seq=1`, `prevHash="genesis"`.
  - Live append: second → `seq=2`, chain valid.
  - Concurrent 5-parallel writers → linearized chain with valid seq.
  - Import mode: accepts caller-provided values; rejects without flag.
  - `queryLedgerEntries`: partition-scoped, ordered, limit honored.
  - `getLastLedgerHash`: empty partition vs populated.
- `continuum/tests/shared/hash-chain.test.ts` (new) — determinism, sensitivity, length.

### Cross-Agent Isolation Tests

- **Direct ACL unit** — `continuum/tests/memory/access-policy-cross-agent.test.ts` (≤80 LOC):
  - Fixtures: `{agentId:"victor", partitions:[]}` / `{agentId:"qora", partitions:[]}` / `{agentId:"forge", partitions:[]}`.
  - Cross-agent read denied; same-agent read succeeds.
- **Derived integration** — `continuum/tests/ipc/cross-agent-isolation.test.ts` (≤120 LOC):
  - Each agent writes 2 entries via `events.ledger.append`.
  - Cypher inspection: 3 partitions, each count=2.

---

## Phase 3: Qora Route Migration + Cutover (L3)

**Goal:** Replace **all** JSONL write sites in `qora-routes.ts` with kernel delegation. Migrate status verifier to Neo4j-backed reads. Execute idempotent chain-seed migration with maintenance-mode quiesce.

### Affected Files

- `continuum/src/service/api/qora-routes.ts` — **v7 critical changes:**
  - Add `QORA_MAINTENANCE` guard to **both** `handleAppendEntry` and `handleRecordVeto` (identical 503 pattern).
  - Refactor `handleAppendEntry` to call `getQoraMemoryStore().appendEntry(...)` — eliminates `writeFileSync(LEDGER_PATH, ...)`.
  - Refactor `handleRecordVeto` to call `getQoraMemoryStore().appendEntry({type: "VETO", payload: vetoPayload, provenance})` — eliminates second `writeFileSync(LEDGER_PATH, ...)`.
  - Remove `computeHash` function (now in `continuum/src/shared/hash-chain.ts`).
  - Remove `parseLedger` function (no longer needed — reads via kernel).
  - Remove `LEDGER_PATH` constant (no longer referenced).
  - **Acceptance gate:** `grep -c "writeFileSync.*LEDGER_PATH" continuum/src/service/api/qora-routes.ts` must equal **0** post-refactor.
- `qora/src/api/status.ts` — refactor to call `getQoraMemoryStore().queryRecentLedgerEntries()`.
- `scripts/migrate-qora-jsonl-to-ledger.ts` (new, ≤150 LOC) — reads JSONL, normalizes timestamps, calls `importEntry` per row.
- `docs/SYSTEM_STATE.md` — Qora migration section + `QORA_MAINTENANCE` env-var contract.
- `docs/META_LEDGER.md` — IMPLEMENT + SEAL entries.

### Changes

1. **Phase ordering** — Phase 2 must complete + tests green before Phase 3 starts.
2. **Pre-cutover backup**:
   - `cp qora/data/ledger.jsonl qora/data/ledger.pre-migration.jsonl.bak`
   - `git add qora/data/ledger.pre-migration.jsonl.bak && git commit -m "chore(qora): pre-migration ledger backup"` (abort if > 10MB).
3. **Pre-flight count** — `wc -l qora/data/ledger.jsonl` → `EXPECTED_COUNT`.
4. **Engage maintenance mode:**
   - **3a-1.** `update_user_service(svc_2syCkir_MDw, env_vars={...existing, QORA_MAINTENANCE:"1"})`. Wait for `/health` 200.
   - **3a-2.** Verify env: `QORA_MAINTENANCE === "1"`.
   - **3a-3. Quiesce verification — BOTH write paths:**
     - `curl -X POST http://localhost:4100/api/qora/append-entry -H 'Content-Type: application/json' -d '{"type":"maintenance-probe","payload":{}}'` → expect 503.
     - `curl -X POST http://localhost:4100/api/qora/record-veto -H 'Content-Type: application/json' -d '{"target":"maintenance-probe","reason":"probe","payload":{}}'` → expect 503.
     - **Abort cutover if EITHER returns 200/2xx** — maintenance gate not active on all write paths.
   - **3a-4.** Read-path liveness: `curl http://localhost:4100/api/qora/status` → expect 200.
5. **Import-mode cutover sequence:**
   - **4a.** `update_user_service` → add `QOR_LEDGER_IMPORT:"1"`. `QORA_MAINTENANCE` stays set.
   - **4b.** Verify both flags present.
   - **4c.** Run migration script. Verifies count matches `EXPECTED_COUNT`.
   - **4d.** Spot-check chain: first/middle/last entries.
   - **4e.** Remove `QOR_LEDGER_IMPORT`. `QORA_MAINTENANCE` stays set.
   - **4f.** Verify: `QOR_LEDGER_IMPORT` absent, `QORA_MAINTENANCE` still present.
   - **4g.** Negative test: import-mode append rejected.
6. **Cutover route migration** — single commit:
   - Both `handleAppendEntry` and `handleRecordVeto` refactored to kernel delegation.
   - Both receive `QORA_MAINTENANCE` 503 guard.
   - `LEDGER_PATH`, `parseLedger`, `computeHash` removed.
   - **Post-refactor acceptance:** `grep -n "writeFileSync.*LEDGER_PATH" continuum/src/service/api/qora-routes.ts` → **zero matches**.
   - Maintenance mode still active → writes 503 until step 7a.
7. **Verify status endpoint** — `curl /api/qora/status` → `chainValid: true`, `entryCount === EXPECTED_COUNT`, `source: "continuum"`.
8. **Disengage maintenance mode:**
   - **7a.** Remove `QORA_MAINTENANCE` from service env_vars. Wait for `/health` 200.
   - **7b.** Verify env absent.
   - **7c. Live-write proof — BOTH write paths:**
     - `/api/qora/append-entry` → `seq === EXPECTED_COUNT + 1`, chain valid.
     - `/api/qora/record-veto` → `seq === EXPECTED_COUNT + 2`, `type === "VETO"`, chain valid.
     - Proves both paths route through kernel, no ghost JSONL, no seq collision.
   - **7d.** Status re-verify: `entryCount === EXPECTED_COUNT + 2`, `source: "continuum"`.
   - **7e. Ghost-ledger negative check:** `test -e qora/data/ledger.jsonl` → must fail (file absent or archived, not recreated).
9. **Archive JSONL** — `mv qora/data/ledger.jsonl qora/data/ledger-2026-04-29.jsonl.archive`.
10. **Run canary** — `bash qor/qor-live-canary.sh` → 9/9 pass.

### Unit Tests

- `continuum/tests/api/qora-routes.test.ts` — mock kernel:
  - `handleAppendEntry` calls `appendEntry` with correct args; response shape matches legacy.
  - `handleRecordVeto` calls `appendEntry` with `type: "VETO"` + veto payload; response shape matches legacy.
  - **Maintenance-mode gate — BOTH paths:** `QORA_MAINTENANCE=1` → `/append-entry` returns 503. `/record-veto` returns 503. Without flag, both return 200. Read paths (`/status`, `/entries`) return 200 regardless.
  - **Post-refactor invariant:** test file contains zero `writeFileSync` references to `LEDGER_PATH`.
- `qora/tests/api/status.test.ts` — mock chain → `chainValid: true`, `source: "continuum"`.
- `scripts/tests/migrate-qora.test.ts` — synthetic JSONL (3 entries); import + idempotency + mixed timestamps.
- `tests/e2e/qora-lifecycle.test.ts` (gated on `RUN_E2E=1`) — full append + veto + status flow through kernel → Neo4j.

### Canary Expansion

Phase 3 canary: **9/9 pass**.

---

## Dependency Chain

```
Phase 3 v5.1 P2 SEAL       d48264f8…
  ↓ #37 Phase 1 (IPC on, canary 8/8, bare-name token map)
  ↓ #37 Phase 2 (events.ledger.* ops, kernel standup, ACL + isolation tests green)
  ↓ #37 Phase 3 (maintenance quiesce on BOTH write paths, both routes migrated, ghost-ledger eliminated, canary 9/9)
```

## Risk Summary

| Phase | Primary Risk | Mitigation |
|---|---|---|
| 1 | Token-map agentId name drift | Single source: `.secrets/ipc-agents.json`; ACL unit test confirms partitions |
| 1 | Service restart breaks orphan probe | Canary assertion 7; `start.sh` orphan probe auto-reaps |
| 1 | Canary requires Neo4j live | `{filter:{limit:1}}` — empty result is success |
| 2 | Cross-agent partition leak | Two tests: direct ACL unit + derived integration with Cypher inspection |
| 2 | `:LedgerEntry` schema collision with `:LearningEvent` | Distinct label + constraint + index |
| 2 | Hash-chain divergence | `computeHash` extraction is refactor-only; test covers determinism |
| 2 | Concurrent seq collision | DB UNIQUE constraint + kernel retry; 5-parallel-writers test |
| 3 | Migration fails partway | Idempotent design; pre/post-flight count; rollback procedure |
| 3 | Import mode left enabled | Explicit cutover sequence + negative test (step 4g) |
| 3 | Status verifier vacuously valid | Canary requires `entryCount > 0` AND `chainValid: true` AND `source: "continuum"` |
| 3 | Route response-shape regression | Compat layer + integration test + canary |
| 3 | **Cutover atomicity gap** | Maintenance-mode quiesce on **both** write paths (`/append-entry` + `/record-veto`). Dual-path quiesce probe (step 3a-3). Single counter source. |
| 3 | **Ghost-ledger recreation (M-3 from v6)** | Both `writeFileSync(LEDGER_PATH)` calls eliminated. Post-refactor grep acceptance gate. Step 7e negative check: `ledger.jsonl` must not exist post-archive. |
| 3 | **VETO entries missing from Neo4j chain (M-2 from v6)** | `handleRecordVeto` delegates to kernel `appendEntry({type:"VETO"})`. Live-write proof step 7c verifies VETO entry gets `seq === EXPECTED_COUNT + 2` in Neo4j. |
| 3 | Timestamp parsing ambiguity | Script normalizes ISO/numeric → epoch ms; mixed-format test |

## Explicit Non-Goals

- **Forge route migration** — Deferred to follow-up issue.
- **Forge kernel canary** — Ships in Phase 2, no production caller this phase.
- Cache/graph/search kernel surface for Qora/Forge.
- Combining kernels.
- External IPC exposure.
- Forge JSONL backfill.
- Full agent-identity-registry primitive.
- Governance/heartbeat/cost-governance inside Qora/Forge kernels.
- Server-side `resolvePartition` default change.
- Chain-integrity carve-out.
- Step-6.5 idempotent re-migration sweep (rejected in v5).
- Pre-seed Neo4j counter (rejected in v5).
- Atomic deploy reorder (rejected in v5).
