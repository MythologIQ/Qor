# QOR Architecture Decision Record

**Date**: 2026-03-31
**Status**: ACCEPTED
**Related**: FailSafe-Pro (mythologiq/FailSafe-Pro)

---

## Decision

QOR operates as a **standalone governance system on zo.space**. It does NOT mirror FailSafe Pro's Rust/Tauri substrate. Instead, QOR implements the same governance philosophy — Shadow Genome, evidence contracts, trust stages, workcell orchestration — in TypeScript/Node.js, targeting the web-native zo.space environment.

FailSafe Pro is the **desktop evolution of Forge** — heavier GraphRAG (CozoDB + sqlite-vec + GG-CORE ONNX embeddings), native Tauri desktop daemon, full evidence bundle infrastructure. QOR is Forge's **web-native foundation**, building the same concepts without the Rust complexity.

---

## Governance Philosophy (Shared)

Both systems share:
- **Shadow Genome**: Every governance decision is recorded with its causal checkpoint and failure context. QOR uses JSONL + in-memory graph (JS). FailSafe Pro uses CozoDB + GG-CORE.
- **Evidence Contracts**: Decisions are structured receipts, not prose logs. Each entry is typed (`CapabilityReceipt`, `PolicyDecision`, `TestResult`, `CodeDelta`, `ReviewRecord`, `MemoryRecall`).
- **Trust Stages**: CBT (Capability-Based Trust) → KBT (Knowledge-Based Trust) → IBT (Identity-Based Trust). Strictness decreases as trust builds.
- **Workcell Orchestration**: Governance-gated execution cells. Plans are validated before work begins.
- **Append-Only Evidence**: No deletion. Audit trail is the source of truth.

---

## QOR vs FailSafe Pro Comparison

| Concern | QOR (zo.space) | FailSafe Pro (Tauri/Rust) |
|---------|----------------|--------------------------|
| **Runtime** | Bun (mono-service) | Rust native |
| **Hosting** | qor service (port 4100) + zo.space proxy | Desktop daemon |
| **Memory** | Neo4j graph + Continuum IPC | GG-CORE ONNX embeddings |
| **Graph** | Neo4j (Cypher) | CozoDB / Kuzu |
| **Vectors** | Neo4j vector indexes (1024-dim cosine) | sqlite-vec + GG-CORE |
| **Evidence** | evidence/ledger.jsonl + Neo4j :LedgerEntry | Append-only log files |
| **Orchestration** | governed-build-runner + workcell policy | Rust workcell planner |
| **IPC** | UDS (unix domain socket) + token auth | axum on localhost:7777 |
| **SDK** | ContinuumClient (IPC facade) | @failsafe/client TypeScript |

---

## QOR Essential Patterns to Implement

QOR must implement these from scratch in JS — they are non-negotiable for standalone governance:

### 1. EvidenceLog (JSONL)
```
{ timestamp, kind, work_cell_id, source, payload, confidence }
Kinds: CapabilityReceipt | PolicyDecision | TestResult | CodeDelta | ReviewRecord | ReleaseRecord | MemoryRecall
```
File-based JSONL in workspace. No deletion. Session-scoped.

### 2. GovernanceMemory (recall + record)
- `record(decision, request)` — store with causal checkpoint hash
- `recall_similar(action, top_k)` — hash-based similarity search (phase 1)
- `evaluate_with_memory(request)` — augment decision with memory context
- Upgrade path: real vectors when embedding API available

### 3. Governance Contracts
```typescript
Decision: Allow | Block | Modify | Escalate | Quarantine
EvaluationRequest: { action, agent_id, resource?, context?, trust_stage }
EvaluationResponse: { decision, risk_score, risk_category, trust_stage, mitigation?, confidence, memory_context? }
TrustStage: CBT | KBT | IBT
```

### 4. ShadowGenome (JS graph)
```typescript
Node: { id, type: 'checkpoint'|'state'|'failure'|'governance', metadata }
Edge: PRODUCED | OCCURRED_DURING | TRIGGERED_BY | APPLIES_TO
```
In-memory graph with JSONL persistence. Maps causal chains.

### 5. EvidencePolicy + BundleCompleteness
```typescript
EvidencePolicy: { require_tests, require_review, require_code_deltas }
BundleCompleteness: { has_tests, has_review, has_policy_decisions, has_code_deltas, missing[] }
```
Determines if a work cell has sufficient evidence to pass a gate.

### 6. Workcell State Machine
```typescript
WorkCell: { id, kind, state: pending|active|blocked|complete, evidence: EvidenceEntry[], policy: EvidencePolicy }
```
Governance gates at state transitions.

---

## What QOR Has Today

### Working
- `/qor` — theme system, 4-entity dashboard, settings drawer ✅
- `/qor/victor` — governance status (live API), chat, tabbed governance/audit ✅
- `/qor/victor/governance` — ledger view ✅
- `/qor/victor/audit` — audit log ✅
- `/qor/forge/*` — projects, mindmap (canvas), roadmap, risks ✅
- `/qor/evolveai` — informational showcase ✅
- Showcase pages — mobile-responsive, polished ✅

### Broken / Missing
- ❌ `/qor/forge/constellation` — renders as blank; canvas not drawing
- ❌ `/qor/victor/governance` — governance ledger not populated from real evidence
- ❌ `/qor/victor/audit` — audit entries are placeholder, not from EvidenceLog
- ❌ Victor chat — UI exists but chat API not wired to Victor agent
- ❌ Memory recall/record — no EvidenceLog, no GovernanceMemory
- ❌ Shadow Genome — no causal graph, no evidence bundles
- ❌ Workcell state — no real workcell decomposition or EvidencePolicy gates
- ❌ Evidence bundles — no bundle materialization at governance gates
- ❌ Trust stage transitions — CBT/KBT/IBT not tracked

---

## Upgrade Path

**Phase 1** (now): QOR as standalone web governance UI. EvidenceLog in JSONL. Memory as hash-map.

**Phase 2** (future): Real vector embeddings via an embedding API. QOR calls `/api/embed` → stores in memory.

**Phase 3** (desktop): Forge migrates to FailSafe Pro Tauri app. QOR pages become the web view layer on top of the Rust daemon. `@failsafe/client` SDK replaces direct zo.space route calls.

---

## Related Artifacts

- `docs/META_LEDGER.md` — QOR chain of custody
- `docs/SHADOW_GENOME.md` — failure pattern log
- `plans/2026-03-31-qor-shell-migration.md` — shell migration plan
- FailSafe-Pro `crates/failsafe-evidence/` — reference evidence implementation
- FailSafe-Pro `crates/failsafe-memory/` — reference memory implementation
- FailSafe-Pro `crates/failsafe-orchestrator/` — reference workcell implementation
