# GATE TRIBUNAL — QOR Issue #37 v2 — Qora/Forge Direct Continuum IPC Consumption

**Phase**: GATE
**Plan**: `docs/plans/2026-04-23-qor-issue-37-qora-forge-kernels-v2.md`
**Plan Content Hash**: `5d11692729ba9e9775db160401e83b4272ea16fc7be564f114f72e7e89a1d3a4`
**Supersedes Verdict**: VETO chain `285c39134e88…` (v1, 3 MAJOR findings)
**Verdict**: ❌ **VETO**
**Risk Grade**: L3
**Date**: 2026-04-23

---

## Verdict Summary

5 **MAJOR** findings + 5 MINOR R-findings.

The v2 plan closes v1's stated MAJOR findings (T1 canary, T2 partition stamping, T3 hash chain) at the wrong layer of abstraction. It treats `events.index` as an opaque event store accepting `{ type, payload, provenance }` — but the existing op is a **domain-specific LearningPacket store** with strict input validation and a fixed Neo4j MERGE schema. Every MAJOR finding below traces to this misreading.

---

## Audit Passes

| Pass | Status |
|---|---|
| Security | PASS — no placeholder auth, no hardcoded creds (token map referenced from `.secrets/`), no bypassed checks |
| Ghost UI | PASS — N/A (backend-only) |
| Simplicity Razor | PASS — file/function ceilings stated and reasonable; no nested ternaries |
| Dependency | PASS — `openssl` (system), no new npm deps |
| Macro-Architecture | PASS in design intent; **VETO via M-1 below** in code-contract reality |
| Build-Path / Orphan | PASS — every proposed file has named importer |
| Adversarial / Reality Check | **VETO** (5 MAJOR findings) |

---

## MAJOR Findings (Each Mandates VETO)

### M-1 — `events.index` shape mismatch (catastrophic kernel failure)

Plan §Phase 2 line 154: kernel `writeEvent` dispatches:
```ts
const enriched = { type, payload: { ...payload, hash, prevHash }, provenance };
return this.client.call("events.index", enriched);
```

**Reality** (`continuum/src/memory/ops/learning-events.ts:70-74`):
```ts
export async function indexLearningEvent(
  params: { packet: unknown },
  ctx: AgentContext,
): Promise<{ id: string }> {
  const packet = validatePacket(params.packet);
```

`validatePacket` (lines 61-68) requires `packet.id: string`, `packet.timestamp: number`, `packet.lesson: string`. The kernel's `{ type, payload, provenance }` envelope has no `packet` key — **first call would throw `"packet must be object"`** before reaching any chain logic.

**Cross-check**: Victor's existing kernel (`victor/src/kernel/memory/continuum-store.ts:35`) calls correctly:
```ts
index(packet: LearningPacket): Promise<void> { return this.client.call("events.index", { packet }) ... }
```

The plan invents an envelope shape that does not exist server-side.

**Severity**: MAJOR. Plan is structurally non-functional; no kernel test would pass at integration tier. Phase 2 §Tests "writeEvent with empty store → prevHash === ''" cannot be satisfied because the call never reaches the chain logic.

---

### M-2 — No payload schema for hash/prevHash (chain fields silently discarded)

Plan §Phase 2 line 140: "Events carry `payload.hash` + `payload.prevHash` as opaque strings (server doesn't interpret; kernel owns chain semantics)."

**Reality** (`learning-events.ts:79-85` Cypher MERGE):
```cypher
MERGE (l:LearningEvent {id: $id})
ON CREATE SET l.agent_id = $agentId, l.partition = $partition,
  l.timestamp = $timestamp, l.origin_phase = $origin, l.trigger_type = $trigger,
  l.lesson = $lesson, l.debt_impact = $impact, l.debt_heat = $heat,
  l.project_id = $project, l.session_id = $session, l.tags = $tags,
  l.universal_truth = $universal, l.context_node = $contextNode,
  l.context_stack = $contextStack
```

Server explicitly destructures known LearningPacket fields. There is **no `payload` Neo4j property, no `hash` property, no `prevHash` property**. Even if M-1 were resolved, chain fields would be silently dropped.

**Severity**: MAJOR. T3 remediation (chain continuity) cannot work over the existing schema. Either (a) extend Cypher MERGE + `IndexableLearningPacket` interface to add `payload/hash/prevHash` fields, or (b) introduce a new event op that does store opaque payload. Plan v2 specifies neither.

---

### M-3 — Token-map agentId / partition naming mismatch (false isolation)

Plan §Phase 1 line 49 token-map keys: `victor-kernel`, `qora-kernel`, `forge-kernel`.
Plan §Phase 2 line 126 partition assertion: `partition: agentPrivate("qora")` → `agent-private:qora`.

**Reality** (`continuum/src/ipc/auth.ts:69-78` `resolveAgent`):
```ts
for (const [agentId, expected] of Object.entries(map)) {
  if (safeEqual(token, expected)) {
    const partitions: Partition[] = [agentPrivate(agentId), "shared-operational", "canonical", "audit"];
    return { agentId, partitions };
  }
}
```

`ctx.agentId` = the JSON map key. So `qora-kernel` token resolves to `ctx.agentId === "qora-kernel"`. Server-side `agentPrivate(ctx.agentId)` (`learning-events.ts:75`) stamps `agent-private:qora-kernel` — **not** `agent-private:qora`.

**Consequences**:
- Plan §Phase 2 §Tests "all entries have `partition: agent-private:qora`" — fails (actual: `qora-kernel`).
- #37 AC item 6 cross-agent isolation tests pass for **wrong reason**: querying `agent-private:victor` from `qora-kernel` token returns AccessDeniedError because partition owner ≠ ctx.agentId — but `agent-private:victor` has zero qora data anyway (qora data lives in `agent-private:qora-kernel`). Isolation never actually exercised.
- The kernel's `QORA_IDENTITY.partition` field is decorative/unused — server ignores it.

**Severity**: MAJOR. Either token-map keys must be `victor`/`qora`/`forge` (drop `-kernel`), or partition assertions throughout plan must update to `agent-private:*-kernel`. Plan v2 has the inconsistency baked in.

---

### M-4 — Status verifier becomes vacuous after route migration

Plan §Phase 3 line 192: "`qora/src/api/status.ts` — **no changes**. Verifier at line 55 continues working because kernel now stamps matching fields."

**Reality** (`qora/src/api/status.ts:70-88`):
```ts
export function buildQoraStatus() {
  const entries = parseLedger(PATHS.ledgerPath);
  ...
  return { ..., chainIntegrity: chain, ... };
}
```

`parseLedger(PATHS.ledgerPath)` reads `qora/data/ledger.jsonl`. Plan §Phase 3 line 191 archives the JSONL post-cutover. Post-migration:
- `parseLedger(<archived path>)` returns `[]`.
- `verifyChain([])` returns `{ valid: true }` **vacuously** (line 53-60: loop from `i=1` over 0 entries never executes).
- Canary assertion 9 (`chainValid: true` from `/api/qora/status`) passes for the wrong reason.

To preserve the verifier as a meaningful live consumer, `status.ts` must read from Neo4j (kernel `queryRecentEvents`) and re-verify chain there. Plan v2 silent on this.

**Severity**: MAJOR. T3 "live consumer keeps working" claim is false. Chain integrity becomes unobservable post-migration despite kernel doing the right thing on writes. Worse, the canary becomes a false-positive generator (`chainValid: true` always).

---

### M-5 — chain-seed prevHash semantic mismatch at genesis boundary

Plan §Phase 2 line 151: `const prevHash = await this.getLastEventHash() ?? "";`
Plan §Phase 3 line 208: chain-seed dispatches `writeEvent({ type: "migration.chain_seed", payload: { prevJsonlHash: <extracted> } })`. Kernel "sets `prevHash = prevJsonlHash` explicitly (override path in `writeEvent` for this one call)" — **but the override path is not specified anywhere in the plan**. The `writeEvent` signature in §Kernel surface (lines 108-119) has no `prevHashOverride` parameter.

Independent of M-2 (which would discard the value anyway), this is a kernel-API gap.

**Reality** (`qora/src/api/append-entry.ts:31`): `const prevHash = entries.length > 0 ? entries[entries.length - 1].hash : "genesis"`. Empty Qora ledger uses **literal string `"genesis"`** as first prevHash, **not** empty string. Plan's `?? ""` would produce a different chain than would the existing `append-entry.ts` for the same inputs at genesis.

**Severity**: MAJOR. Either:
- (a) Override path must be added to `writeEvent` signature explicitly (plan doesn't), or
- (b) Genesis sentinel must align with existing `"genesis"` (plan uses `""`).
Both gaps are unresolved. Migration boundary chain divergence guaranteed.

---

## MINOR Findings (Documented for Remediation; Do Not Mandate VETO Independently)

### R-1 — `computeHash` line number wrong
Plan §Phase 2 line 138: `qora/src/api/append-entry.ts:33`. Actual: function defined at line 17, used at line 33. Search-string still unique.

### R-2 — `learning-events.ts` partition stamp line wrong
Plan §Context line 27: claims line 72. Actual auto-stamp line 75 (within `indexLearningEvent`). Off by 3.

### R-3 — Canary edit anchor lines wrong
Plan §Phase 1 step 6 Edit A1: line 43 for `QOR_IPC_SOCKET_PATHS=`. Actual line 12. Off by 31. Edit A2 "after line 51" — line 51 is between `done` and `if (( failures == 0 ))`; insertion target is structurally workable but anchor is wrong.

### R-4 — `events.query` `orderBy` parameter is fictional
Plan §Phase 2 line 115: `client.call("events.query", { limit, orderBy: "seq DESC" })`. Actual `LearningQuery` (`learning-events.ts:34-39`) accepts `{ origin_phase, trigger_type, universal_truth, limit }` only. Server hard-codes `ORDER BY l.timestamp DESC` (line 114). `orderBy` silently dropped. `getLastEventHash()` would still return most recent by timestamp — works coincidentally, but the `orderBy: "seq DESC"` claim is fabricated.

### R-5 — No `seq` field exists in LearningEvent schema
Plan §Phase 3 line 190: "`seq` maps to Neo4j order." Neither the Cypher MERGE (lines 79-85) nor `IndexableLearningPacket` interface (lines 12-32) define a `seq` property. Plan's response-envelope claim that `seq` is preserved requires either schema extension or post-hoc count from query — neither specified.

---

## Audit Detail Tables

### Security Audit
| Check | Status |
|---|---|
| No placeholder auth | PASS |
| No hardcoded creds | PASS — token map externalized to `.secrets/` |
| No bypassed checks | PASS |
| No mock auth returns | PASS |

### Simplicity Razor Audit
| Check | Limit | Plan Proposes | Status |
|---|---|---|---|
| Max function lines | 40 | ≤ 40 stated | OK |
| Max file lines | 250 | ≤ 150 (kernel store), ≤ 30 (hash-chain), ≤ 50 (factory), ≤ 40 (identity) | OK |
| Max nesting depth | 3 | flat delegators | OK |
| Nested ternaries | 0 | 0 | OK |

### Dependency Audit
| Package | Justification | Verdict |
|---|---|---|
| `openssl` (system) | token generation | PASS |
| (no new npm deps) | — | PASS |

### Build Path Audit
| Proposed File | Entry Point Connection | Status |
|---|---|---|
| `qora/src/kernel/identity.ts` | imported by `qora/src/kernel/memory/store.ts` | Connected |
| `qora/src/kernel/memory/continuum-store.ts` | imported by `qora/src/kernel/memory/store.ts` | Connected |
| `qora/src/kernel/memory/store.ts` | imported by `qora/src/kernel/index.ts` | Connected |
| `qora/src/kernel/index.ts` | imported by `continuum/src/service/api/qora-routes.ts` (Phase 3) | Connected |
| `forge/src/kernel/*` | mirror | Connected |
| `continuum/src/shared/hash-chain.ts` | imported by both kernels + `qora/src/api/append-entry.ts` | Connected |
| `scripts/ipc-canary-victor.ts` | invoked by `qor/qor-live-canary.sh` assertion 8 | Connected |
| `.secrets/ipc-agents.json` | loaded by `continuum/src/ipc/auth.ts:loadAgentTokenMap` | Connected |

---

## Required Remediation (for v3)

### M-1 closure options
- **Option A (recommended)**: Kernel surface uses existing op contract verbatim. `writeEvent({ packet })` accepts a full `LearningPacket` (with `id, timestamp, lesson, debt_impact, debt_heat, project_id, session_id, tags`). Chain fields go into `tags` or a structured field within the packet shape that maps to existing Cypher MERGE properties. No server changes.
- **Option B**: Introduce a new server op (e.g., `events.appendChained`) with `{ type, payload, prevHash, hash, provenance }` envelope and a separate Cypher MERGE on a new node label (e.g., `:ChainedEvent`). Schema extension required.

### M-2 closure
Pick A or B from M-1; the option determines whether server schema extension is required.

### M-3 closure
Drop `-kernel` suffix from token-map keys: `{"victor": "<token>", "qora": "<token>", "forge": "<token>"}`. Update all partition references in plan to match `agent-private:victor` / `agent-private:qora` / `agent-private:forge`. Decide whether existing Victor data already lives at `agent-private:victor` (need to confirm Victor's runtime agentId today) and adjust if drift exists.

### M-4 closure
Add Phase 3 §Affected Files entry for `qora/src/api/status.ts`: refactor `buildQoraStatus()` to read from `getQoraMemoryStore().queryRecentEvents({...})` and re-verify chain. Or replace JSONL-reading path with Neo4j-reading path.

### M-5 closure
Either:
- (a) Add `prevHashOverride?: string` parameter to `writeEvent` signature, document override semantics for `migration.chain_seed`.
- (b) Change kernel genesis sentinel from `""` to `"genesis"` to match existing `append-entry.ts:31`.
Both fixes apply.

### R-1..R-5 closure
Correct line numbers; remove `orderBy: "seq DESC"` from `queryRecentEvents` (use `limit` only); document `seq` synthesis path explicitly (post-hoc count or schema extension).

---

## Chain

- **Content Hash**: `5d11692729ba9e9775db160401e83b4272ea16fc7be564f114f72e7e89a1d3a4`
- **Previous Hash (v1 VETO)**: `9e0449bb6ad144c16dce110e9ca43f38e809647a0018ba82ef229bf804316c31`
- **Chain Hash (this verdict)**: `84cda2b88a8bc2d1949a5017df2fe8bc6f204f1d3f4473ef5c31f44f09058104`

---

## Next Action

`/qor-plan` → v3 closing M-1..M-5 (5 MAJOR) + R-1..R-5 (5 MINOR). Recommend selecting Option A for M-1 (verbatim contract) to avoid server-side schema work. Re-gate after v3 written.
