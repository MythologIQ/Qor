# Plan: Issue #37 — Qora/Forge Direct Continuum IPC Consumption

**Issue:** #37 — Qora/Forge kernels direct Continuum IPC consumption
**Blocks:** Agents running as governed tenants in their own partitions
**Risk Grade:** L3 (kernel standup across two new agents + service-config cutover + route migration)
**Depends On:** Phase 3 v5.1 seal (`d48264f8…`)

## Open Questions

- None. Design dialogue locked 2026-04-22:
  - Q1 = A — minimal identity inline (string-constant agent IDs + per-kernel identity struct).
  - Q2 = A — enable `QOR_IPC_SOCKET` + `QOR_IPC_TOKEN_MAP` on `qor` service (cutover-style operation).
  - Q3 = A — mirror Victor kernel structure verbatim for governance parity.
  - Q4 = B — full route migration; retire JSONL ledgers.

## Context

Qora and Forge currently have no memory kernel. Their routes (`continuum/src/service/api/qora-routes.ts`, `forge-routes.ts`) persist directly to flat JSONL files (`qora/data/ledger.jsonl`, `.qore/projects/builder-console/ledger.jsonl`). Victor owns the only kernel today (`victor/src/kernel/memory/continuum-store.ts` wired through `ContinuumClient` over UDS IPC), but IPC was explicitly deferred on the `qor` service at Phase 3 seal (`QOR_IPC_SOCKET` absent from service env). This plan closes the gap by (a) enabling IPC on the live service, (b) standing up Qora+Forge kernels mirroring Victor's shape, and (c) migrating Qora/Forge routes to read/write through their kernels.

Continuum server-side primitives already exist and are tested: `continuum/src/ipc/auth.ts` (token map + constant-time compare), `continuum/src/memory/access-policy.ts` (default-deny ACL keyed on `agentId` vs `agent-private:<agentId>` partition), `continuum/src/memory/partitions.ts` (`agentPrivate("qora")`, `agentPrivate("forge")` produce valid partitions today — no ACL changes required for new tenants).

---

## Phase 1: Identity + IPC Token Infra + Service Cutover (L2)

**Goal:** Enable IPC on the `qor` service, provision agent tokens, prove Victor still works over live UDS.

### Affected Files

- `.secrets/ipc-agents.json` (new) — 0600-permission JSON: `{"victor-kernel":"<token>","qora-kernel":"<token>","forge-kernel":"<token>"}`. Tokens generated as 32-byte base64 via `openssl rand -base64 32`.
- `.secrets/README.md` (new) — one-paragraph doc on the file's role + regeneration procedure.
- `.gitignore` — add `/.secrets/` (exclude secrets from git entirely).
- `qor/qor-live-canary.sh` — extend to 8 assertions: add assertion 7 (`/tmp/qor.sock` exists + mode `srwxr-xr-x` or stricter) and assertion 8 (Victor-kernel IPC roundtrip: spawn `bun run scripts/ipc-canary-victor.ts`, exit 0).
- `scripts/ipc-canary-victor.ts` (new) — 40-LOC canary script: constructs `ContinuumClient` with `VICTOR_KERNEL_TOKEN` env, calls `upsertCacheEntries([{...}])` with `partition: "agent-private:victor"`, asserts response OK.
- `docs/SYSTEM_STATE.md` — record Phase 1 artifacts + canary expansion.
- `docs/META_LEDGER.md` — IMPLEMENT entry.

### Changes

1. **Generate tokens.** `openssl rand -base64 32` × 3, write `.secrets/ipc-agents.json`, `chmod 600`.
2. **Update `qor` service env_vars** via `update_user_service(svc_2syCkir_MDw, env_vars={...existing, QOR_IPC_SOCKET:"/tmp/qor.sock", QOR_IPC_TOKEN_MAP:"/home/workspace/Projects/continuous/Qor/.secrets/ipc-agents.json"})`.
3. **Verify config-layer MCP** — `list_user_services` → confirm both new keys present with expected values.
4. **Restart service** — supervisor picks up new env vars. `start.sh` already has no IPC-specific logic; Bun server initializes IPC at module load because `continuum/src/service/server.ts:129-134` reads the env vars.
5. **Run extended canary** — `bash qor/qor-live-canary.sh` → 8/8 pass.
6. **Record MCP assertions** in IMPLEMENT ledger entry (same format as Phase 3 §Phase 2).

### Unit Tests

- `continuum/tests/ipc/token-map-roundtrip.test.ts` (new) — loads `.secrets/ipc-agents.json` via `loadAgentTokenMap()`, asserts three agent IDs resolve to distinct tokens, asserts invalid token throws `AuthFailedError`. Runner: `bun test`.
- `qor/qor-live-canary.sh` — scenarios 7 & 8 added per above.
- `scripts/ipc-canary-victor.ts` — single integration test; exit 0 on success.

### Security Considerations

- Token file is **never committed** — `/.secrets/` in `.gitignore`, repo audit gate verifies file absent from commit object.
- Token length: 32 bytes base64 = 256 bits of entropy. Matches Continuum's `auth.ts` constant-time compare expectations.
- Canary assertion 7 verifies socket permissions (owner-only).

---

## Phase 2: Qora + Forge Kernel Standup (L3)

**Goal:** Build independent kernels mirroring Victor's structure; each authenticates with its own token, writes to its own `agent-private:*` partition.

### Affected Files

#### Qora kernel
- `qora/src/kernel/identity.ts` (new, ≤40 LOC) — exports `QORA_IDENTITY: AgentIdentity` with `{agentId:"qora", partition:agentPrivate("qora"), ipcToken:process.env.QORA_KERNEL_TOKEN}`. `AgentIdentity` type inline (no registry dep — per Q1=A).
- `qora/src/kernel/memory/continuum-store.ts` (new, ≤180 LOC) — verbatim mirror of `victor/src/kernel/memory/continuum-store.ts`, with `QORA_IDENTITY` substituted for Victor's identity at construction.
- `qora/src/kernel/memory/store.ts` (new, ≤60 LOC) — factory returning `ContinuumStore` with `QORA_IDENTITY`. Mirrors `victor/src/kernel/memory/store.ts`.
- `qora/src/kernel/index.ts` (new, ≤20 LOC) — barrel re-export: `QoraKernel`, `getQoraMemoryStore()`.

#### Forge kernel
- `forge/src/kernel/identity.ts` (new, ≤40 LOC) — mirror of Qora identity with `agentId:"forge"`.
- `forge/src/kernel/memory/continuum-store.ts` (new, ≤180 LOC) — verbatim mirror.
- `forge/src/kernel/memory/store.ts` (new, ≤60 LOC) — mirror factory.
- `forge/src/kernel/index.ts` (new, ≤20 LOC) — barrel.

#### Cross-cutting
- `continuum/src/memory/access-policy.ts` — **no changes required**. Existing ACL is `agentId` vs `parseAgentId(partition)` equality, which works for any agent ID. New test suite covers the `qora`/`forge` cases explicitly.
- `docs/SYSTEM_STATE.md` — Phase 2 artifacts section.
- `docs/META_LEDGER.md` — IMPLEMENT entry.

### Changes

Each kernel file is a verbatim mirror (per Q3=A governance parity). No shared library extraction — each kernel independently governed.

### Unit Tests

- `qora/tests/kernel/identity.test.ts` — asserts `QORA_IDENTITY.agentId === "qora"`, partition matches `agent-private:qora`.
- `qora/tests/kernel/continuum-store.test.ts` (mirror of Victor's store test) — in-memory mock client, verifies store calls the client's `upsertCacheEntries` with partition stamped.
- `qora/tests/kernel/roundtrip.test.ts` (integration) — spawns `qor` service, constructs real `ContinuumClient` with Qora token, writes LearningEvent, reads back, asserts `agent_id="qora"` + `partition="agent-private:qora"`.
- `forge/tests/kernel/identity.test.ts`, `forge/tests/kernel/continuum-store.test.ts`, `forge/tests/kernel/roundtrip.test.ts` — mirrors for Forge.
- `continuum/tests/ipc/cross-agent-isolation.test.ts` (new) — **negative tests**. (a) Qora token reads `agent-private:victor` → `AccessDeniedError`. (b) Forge token reads `agent-private:qora` → `AccessDeniedError`. (c) Each agent reads its own partition → success. Closes #37 AC item 6.

### Razor Compliance

- All new files ≤ 250 LOC (target ≤ 180 for kernel store).
- All functions ≤ 40 LOC (matches Victor's sizes).
- Nesting depth ≤ 3.
- Zero nested ternaries.
- Zero `console.log`.

---

## Phase 3: Qora + Forge Route Migration (L3)

**Goal:** Retire JSONL ledgers; routes delegate to kernels. User-observable behavior: Qora/Forge memory lives in Neo4j under governed partitions.

### Affected Files

#### Qora route migration
- `continuum/src/service/api/qora-routes.ts` — replace `parseLedger()` / `writeFileSync(LEDGER_PATH, ...)` with `getQoraMemoryStore().upsertCacheEntries([...])` / `getQoraMemoryStore().queryRecentEvents({agentId:"qora", limit})`. Response shape preserved where possible; change-log entry in PR description for any unavoidable shape shifts.
- `qora/data/ledger.jsonl` — **archived** to `qora/data/ledger-2026-04-22.jsonl.archive` (single rename, no content change) + `.gitignore` entry for `*.archive`. Post-migration backfill deferred to follow-up issue.

#### Forge route migration
- `continuum/src/service/api/forge-routes.ts` — replace JSONL ledger read/writes with kernel calls; `readPhases()` / `writePhases()` stay file-based (phases are source-data, not ledger events — out of #37 scope).
- `.qore/projects/builder-console/ledger.jsonl` — archived per same pattern.

#### Cross-cutting
- `docs/SYSTEM_STATE.md` — route-migration section, JSONL-retirement note.
- `docs/META_LEDGER.md` — IMPLEMENT + SEAL entries.

### Changes

1. **Route handlers thin-wrap kernel calls.** Existing auth (bearer token via `auth(req)`) stays at the HTTP layer. Kernel calls carry agent identity as a closure property, not an HTTP concern.
2. **Response-shape compatibility.** The current JSONL-backed responses return `{seq, timestamp, type, hash, prevHash, payload, provenance, governanceDecisionId}`. Kernel-backed responses return LearningEvent records — shape-map the kernel payload into the legacy response envelope so existing consumers don't break. Any fields that genuinely can't map get defaulted (e.g., `seq` becomes a monotonic counter from Neo4j ordering).
3. **JSONL archive, not delete.** Preserves rollback path for 30 days.

### Unit Tests

- `continuum/tests/api/qora-routes.test.ts` — mock kernel, assert route calls `upsertCacheEntries` with correct payload, response shape matches legacy.
- `continuum/tests/api/forge-routes.test.ts` — mirror.
- `tests/e2e/qora-forge-lifecycle.test.ts` (new) — end-to-end: HTTP POST to `/api/qora/*` → kernel → IPC → Continuum → Neo4j → read back via HTTP GET → assert persistence survives service restart. Closes #37 AC items 1, 3, 4.

### Canary Expansion

- Extend `qor/qor-live-canary.sh` with assertion 9 (`curl -fsS http://localhost:4100/api/qora/status` returns 200 with `source:"continuum"` marker in response) and assertion 10 (same for Forge). Post-Phase-3 canary: 10/10 pass.

---

## Dependency Chain

```
Phase 3 v5.1 P2 SEAL       d48264f8…
  ↓ #37 Phase 1 (IPC on)
  ↓ #37 Phase 2 (kernels)
  ↓ #37 Phase 3 (routes)
```

## Risk Summary

| Phase | Primary Risk | Mitigation |
|---|---|---|
| 1 | Service restart breaks `start.sh` orphan probe if socket lingers from prior Bun instance | Canary assertion 7 catches missing socket; supervisor restart → orphan probe (from Phase 1 `start.sh`) auto-reaps |
| 2 | Cross-agent partition leak (ACL misconfigured) | Cross-agent negative tests (Phase 2 §Tests) — mandatory |
| 3 | Route response-shape regression breaks UI consumers | Response-shape compat layer + integration test + manual smoke via Arena UI before seal |

## Explicit Non-Goals (per #37)

- Combining kernels (they stay independent — Q3=A mirror mandated).
- Exposing Continuum to external clients (IPC is local UDS only).
- JSONL backfill into Neo4j (archive-only; backfill = follow-up issue).
- Full #5 agent-identity-registry primitive (Q1=A minimal inline; follow-up issue).
- Governance/heartbeat/cost-governance features inside Qora/Forge kernels beyond what Victor has today.
