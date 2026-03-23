---
title: Victor Memory Governance Crosswalk
date: 2026-03-15
status: proposed
owners:
  - Victor
  - Zo-Qore
---

# Victor Memory Governance Crosswalk

## Purpose

Map the target memory-governance architecture against the current Zo-Qore and Victor implementation so remediation stays comparative instead of reinventive.

Status meanings:

- `present`: materially implemented already
- `partial`: implemented in part, but not yet explicit, enforced, or complete
- `absent`: not materially implemented in the current kernel/runtime surface

## Comparative Matrix

| Capability | Status | Current Evidence | Notes |
| --- | --- | --- | --- |
| Neo4j-backed GraphRAG long-term memory | present | `kernel/memory/neo4j-store.ts`, `kernel/memory/schema.cypher`, `kernel/README.md` | Durable graph store is already real, not conceptual. |
| Vector embeddings as mnemonic triggers | present | `kernel/memory/embed.ts`, `kernel/memory/retrieve.ts` | Vector search exists and already acts as candidate recall, with text fallback. |
| Provenance-first document identity and chunk anchoring | present | `kernel/memory/provenance.ts`, `kernel/memory/chunking.ts`, `kernel/memory/ingest.ts` | Source docs and chunks already carry stable IDs, fingerprints, and spans. |
| Selective refresh and tombstoning | present | `kernel/memory/ingest.ts`, `kernel/memory/neo4j-store.ts` | Changed chunks and removed semantic nodes/edges are already handled incrementally. |
| CAG-style dependency-tracked short-term cache | present | `kernel/memory/cache.ts`, `kernel/memory/types.ts`, `kernel/memory/retrieve.ts` | Dependency refs, governance metadata, stale/fresh state, and derived negative-constraint summary cache are now explicit. |
| Stale cache invalidation | present | `kernel/memory/cache.ts`, `kernel/memory/ingest.ts` | Deterministic staleness marking exists already. |
| Grounded retrieval bundles | present | `kernel/memory/retrieve.ts`, `kernel/memory/types.ts` | Retrieval already returns evidence, contradictions, missing information, and next actions. |
| Contradiction preservation | present | `kernel/memory/contradictions.ts`, `kernel/memory/retrieve.ts`, `kernel/memory/evaluate.ts` | Contradictions are surfaced instead of flattened. |
| Insufficient-evidence handling | present | `kernel/memory/retrieve.ts`, `kernel/memory/retrieve.test.ts`, `kernel/memory/evaluate.ts` | Kernel already degrades to “ingest more” rather than bluffing. |
| Read-oriented authority boundary | present | `kernel/README.md`, `kernel/server.ts`, `kernel/builder-console-write.ts` | Execution authority is still constrained and contradiction-aware. |
| Governance as Victor’s operating spine | present | `Projects/continuous/Victor/SOUL.md`, `Projects/continuous/Zo-Qore/docs/ZOQORE_INTENT.md` | The philosophical spine exists clearly outside the memory layer. |
| Epistemic typing for memory artifacts | absent | no explicit artifact-level type beyond structural `nodeType` | Current nodes know what they are structurally, not whether they are observation, source claim, inference, or synthesis. |
| Memory governance states (`ephemeral`, `provisional`, `durable`, `contested`, etc.) | absent | no artifact-level state beyond semantic node tombstones and cache fresh/stale | Current state tracking is storage-oriented, not epistemic. |
| Confidence profiles for memory writes and recall | absent | no explicit extraction/grounding/cross-source/operational scores | This is a clear remediation area. |
| Explicit memory promotion policy | absent | no dedicated memory promotion contract in `kernel/memory/*` | There is a `promotion-gate.ts`, but it governs runtime readiness, not memory durability. |
| Explicit recall gate / recall decision | present | `kernel/memory/governance.ts`, `kernel/memory/retrieve.ts`, `kernel/memory/types.ts` | Retrieval now returns first-class recall verdicts with reasons, blockers, and retrieval trace metadata. |
| Explicit retrieval orchestration boundary | partial | `kernel/memory/retrieve.ts`, `kernel/memory/types.ts` | Retrieval now emits a structured trace showing chunk strategy, semantic expansion, cache usage, and negative-constraint source, but the phases still live in one module rather than a dedicated orchestration layer. |
| Memory governance ledger | partial | `IngestionRunRecord`, runtime ledgers, automation audits | Ingestion runs exist, but a dedicated memory-governance event model is not yet formalized. |
| Policy file for memory promotion/recall | absent | no declarative policy artifact in `kernel/memory/` | Needs to exist if governance is to remain inspectable and tunable. |
| Observation vs inference separation in stored memory | absent | not modeled directly | This is one of the highest-value remediation items. |
| Durable contradiction objects | partial | contradiction detection exists at retrieval time | Contradictions are derived on recall, not yet persisted as governed first-class memory objects. |
| Memory deprecation and supersession lineage | partial | edge type `supersedes` exists, but deprecation lifecycle is not formalized | The graph can express supersession, but governance does not yet manage it systematically. |

## Current Strengths

The important result of this comparison is that Victor is not starting from zero.

The following are already materially in place:

- graph-backed long-term memory
- vector-triggered retrieval
- provenance and chunk anchoring
- selective refresh and tombstoning
- stale cache invalidation
- contradiction surfacing
- insufficient-evidence degradation
- read-oriented bounded authority

That means the memory system is already structurally closer to a governed epistemic kernel than a typical RAG stack.

## High-Leverage Gaps

The highest-value remediation items are not storage primitives. They are governance primitives:

1. Artifact-level epistemic typing
2. Artifact-level governance states
3. Confidence profiles
4. Declarative promotion policy
5. Dedicated memory governance ledger events
6. Explicit retrieval orchestration module split

These gaps matter because they determine whether Victor can tell the difference between:

- observed fact and extracted synthesis
- similarity and equivalence
- provisional interpretation and durable memory
- grounded recall and advisory recall

## Recommended Remediation Sequence

### 1. Add governance primitives to memory records

Add:

- `governance.state`
- `governance.epistemicType`
- `governance.confidence`
- `governance.policyVersion`
- `governance.provenanceComplete`

### 2. Add a declarative memory policy file

This should define:

- durable thresholds
- provisional thresholds
- recall modes
- contradiction rules
- stale cache rules

### 3. Add memory governance ledger events

This should record:

- promotion approvals
- promotion rejections
- contested memory writes
- recall downgrades
- stale recall blocks

### 4. Split retrieval orchestration into explicit modules

Make retrieval boundaries legible in code as:

- query intent and expected-type inference
- chunk strategy selection
- graph expansion and semantic augmentation
- cache mediation
- recall arbitration

## Bottom Line

Victor already has the storage and retrieval substrate for a serious memory system.

What is still missing is the governance layer that makes memory self-aware about:

- what kind of thing it knows
- how strongly it knows it
- whether it is allowed to trust it
- and when it must refuse certainty
