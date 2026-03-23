---
title: CMHL Temporal Memory Integration Plan
date: 2026-03-17
status: proposed
owners:
  - Victor
  - Zo-Qore
depends_on:
  - 2026-03-15-victor-memory-governance-architecture.md
  - 2026-03-17-uor-identity-adapter-design.md
  - 2026-03-17-uor-victor-artifact-crosswalk.md
governed_targets:
  - task_cmhl_decay_fields
  - task_cmhl_lazy_decay_retrieval
  - task_cmhl_uor_cache_invalidation
  - task_cmhl_temporal_chaining
  - task_cmhl_restaking
  - task_cmhl_governance_integration
agent_consumable: true
---

# CMHL Temporal Memory Integration Plan

## Purpose

Integrate three independent, testable temporal memory capabilities into Victor's existing memory governance architecture. These capabilities address two specific gaps in the current design:

1. **Learned Forgetting** — The current architecture has no mechanism for memory to naturally lose relevance over time. Everything promoted to durable memory stays equally retrievable forever, leading to memory bloat (Failure Mode 5) and stale certainty (Failure Mode 2).

2. **Temporal Blindness** — The current architecture cannot cryptographically prove the ordering of superseding memories. When a user changes a preference, the system relies on `updatedAt` timestamps rather than a tamper-evident chain.

This plan decomposes the solution into three capabilities that can be built and tested independently.

## Architecture Fit

These capabilities slot into the existing architecture without replacing anything:

```
Existing Pipeline:
  Encounter → Stabilize → Observe → Differentiate → Recombine → Govern → Index → Reflect

CMHL additions:
  - Decay fields added at Index (Stage 6)
  - Lazy decay evaluation added at Retrieval Arbitration (between Stage 6 and response)
  - UOR cache invalidation replaces dependency-walk in cache.ts
  - Temporal chaining added at Govern (Stage 5) via SUPERSEDES edges
  - Restaking added at Reflect (Stage 7) when decayed memory proves critical
```

### Integration Points (Existing Files)

| File | What Changes |
|------|-------------|
| `kernel/memory/types.ts` | New fields: `temporalMetadata` on node/edge/cache records |
| `kernel/memory/rank.ts` | Decay weight multiplier in scoring functions |
| `kernel/memory/retrieve.ts` | Lazy decay evaluation before bundle assembly |
| `kernel/memory/cache.ts` | UOR fingerprint comparison for staleness |
| `kernel/memory/provenance.ts` | Temporal chain hash computation |
| `kernel/memory/neo4j-store.ts` | SUPERSEDES edge writes, decay field storage |
| `kernel/memory/governance.ts` | Decay-aware governance state transitions |
| `kernel/memory/ingest.ts` | Temporal chain linkage during consolidation |

### What Does NOT Change

- The 7-stage pipeline order
- The 6 governance gates
- The retrieval bundle contract
- The governance state enum
- The epistemic type system
- The confidence profile dimensions
- The existing node/edge type taxonomy

---

## Capability 1: Decay-Weighted Retrieval

### Problem

All durable memory has equal retrieval weight regardless of age. A decision from 6 months ago ranks the same as one from today if lexical/semantic scores match. This causes stale certainty (Failure Mode 2) and memory bloat (Failure Mode 5).

### Solution

Add temporal metadata to every memory object. Apply exponential decay as a score multiplier at retrieval time using lazy evaluation (compute only for the K candidates already returned by vector/lexical search).

### Data Model Changes

Add to `types.ts`:

```typescript
export interface TemporalMetadata {
  t0: number;              // Unix ms — creation or last restake
  w0: number;              // Base salience weight (default 1.0)
  lambda: number;          // Decay constant (higher = faster decay)
  decayProfile: DecayProfile;
  previousUorId?: string;  // Temporal chain link (Capability 3)
  restakeCount: number;    // How many times this memory was refreshed
  lastAccessedAt?: number; // Last retrieval timestamp
}

export type DecayProfile =
  | 'ephemeral'    // lambda ≈ 0.001 — decays in hours (logs, transient state)
  | 'session'      // lambda ≈ 0.0001 — decays in days (working context)
  | 'standard'     // lambda ≈ 0.00001 — decays in weeks (normal memory)
  | 'durable'      // lambda ≈ 0.000001 — decays in months (decisions, constraints)
  | 'permanent';   // lambda = 0 — never decays (identity, policy rules)
```

Add `temporal?: TemporalMetadata` field to:
- `SemanticNodeRecord`
- `SemanticEdgeRecord`
- `CacheEntryRecord`
- `SourceChunkRecord`

### Decay Constants Table

| Profile | Lambda | Half-Life | Use Case |
|---------|--------|-----------|----------|
| ephemeral | 0.001 | ~11.5 hours | Tool outputs, transient logs |
| session | 0.0001 | ~4.8 days | Working plans, active hypotheses |
| standard | 0.00001 | ~48 days | General knowledge, observations |
| durable | 0.000001 | ~1.3 years | Decisions, constraints, commitments |
| permanent | 0 | ∞ | Identity, governance policy, user name |

### Decay Computation (Lazy)

Add to `rank.ts`:

```typescript
export function computeDecayWeight(temporal: TemporalMetadata | undefined, now: number): number {
  if (!temporal || temporal.lambda === 0) return 1.0;
  const elapsedMs = now - temporal.t0;
  if (elapsedMs <= 0) return temporal.w0;
  const elapsedSeconds = elapsedMs / 1000;
  return temporal.w0 * Math.exp(-temporal.lambda * elapsedSeconds);
}

export const DECAY_RETRIEVAL_THRESHOLD = 0.05;
```

### Retrieval Integration

In `retrieve.ts`, after the existing `rankChunkHits` and `rankSemanticNodes` calls, apply decay filtering:

```typescript
const now = Date.now();
const decayFilteredNodes = semanticNodes.filter(node => {
  const weight = computeDecayWeight(node.temporal, now);
  return weight >= DECAY_RETRIEVAL_THRESHOLD;
});
```

In `rank.ts`, modify scoring functions to multiply by decay weight:

```typescript
// In scoreSemanticNode:
const decayMultiplier = computeDecayWeight(node.temporal, Date.now());
return (labelMatches * 5 + summaryMatches * 2 + intentBoost) * decayMultiplier
  - securityPenalty(...) * 10;
```

### Decay Profile Assignment

During ingestion (Stage 6), assign decay profiles based on epistemic type and node type:

| Epistemic Type | Default Decay Profile |
|----------------|----------------------|
| observation | standard |
| source-claim | standard |
| inferred-relation | session |
| synthesis | session |
| conjecture | ephemeral |
| policy-ruling | permanent |

| Node Type | Override Decay Profile |
|-----------|----------------------|
| Decision | durable |
| Constraint | durable |
| Task | session (active) / standard (done) |
| Project | permanent |
| Persona | permanent |

### Acceptance Criteria

- [ ] `TemporalMetadata` type exists in `types.ts`
- [ ] `computeDecayWeight` function exists in `rank.ts` with unit tests
- [ ] Decay profiles are assigned during ingestion
- [ ] Retrieval filters out memories below threshold
- [ ] Scoring functions apply decay multiplier
- [ ] Permanent memories (lambda=0) are never filtered
- [ ] Unit test: memory with `ephemeral` profile and t0=24h ago scores below threshold
- [ ] Unit test: memory with `durable` profile and t0=24h ago scores near 1.0

---

## Capability 2: UOR Content-Addressed Cache Invalidation

### Problem

The current `cache.ts` uses dependency reference lists (`CacheDependencyRef[]`) to detect staleness. When a source changes, the system must walk the dependency list and compare. This works but is O(n) in dependency count and relies on the caller to correctly enumerate dependencies.

### Solution

Use UOR fingerprints as cache keys. A cache entry's validity is a single hash comparison: if the UOR fingerprint of the source matches the fingerprint stored at cache creation time, the cache is valid. If not, the cache is instantly stale.

### Integration with Existing Cache

Extend `CacheEntryRecord` (already has `dependencyRefs`):

```typescript
export interface UORCacheValidation {
  sourceFingerprints: Array<{
    uorId: string;
    fingerprintAtCreation: string;  // Content hash when cache was built
  }>;
  generatedAt: number;
}
```

Add `uorValidation?: UORCacheValidation` to `CacheEntryRecord`.

### Staleness Check

Add to `cache.ts`:

```typescript
export function isUORCacheStale(
  entry: CacheEntryRecord,
  currentFingerprints: Map<string, string>,  // uorId → current fingerprint
): boolean {
  if (!entry.uorValidation) {
    return false; // Fall back to existing dependency-ref staleness check
  }
  return entry.uorValidation.sourceFingerprints.some(ref => {
    const current = currentFingerprints.get(ref.uorId);
    return current !== undefined && current !== ref.fingerprintAtCreation;
  });
}
```

### Migration Path

1. New cache entries get `uorValidation` populated alongside existing `dependencyRefs`
2. Old cache entries without `uorValidation` use existing `findStaleCacheIds` logic
3. Once all entries have UOR validation, `dependencyRefs` becomes secondary

### Acceptance Criteria

- [ ] `UORCacheValidation` interface exists in `types.ts`
- [ ] `isUORCacheStale` function exists in `cache.ts` with unit tests
- [ ] New cache entries populate `uorValidation` during creation
- [ ] Retrieval checks UOR staleness before including cache entries
- [ ] Unit test: cache entry with matching fingerprints returns fresh
- [ ] Unit test: cache entry with mismatched fingerprint returns stale
- [ ] Unit test: cache entry without `uorValidation` falls back to dependency-ref check

---

## Capability 3: Temporal Chaining

### Problem

When a memory supersedes another (e.g., "user prefers Rust" supersedes "user prefers Python"), the current architecture creates a `SUPERSEDES` edge but does not cryptographically prove ordering. An agent looking at both nodes in isolation cannot determine which is newer without trusting mutable timestamp fields.

### Solution

Chain superseding memories using UOR references. Each new memory that supersedes another carries `previousUorId` in its `TemporalMetadata`. The decay state of each node in the chain mathematically enforces recency: newer nodes have higher `w(t)` values.

### Data Model

Already covered in Capability 1's `TemporalMetadata.previousUorId` field.

Add a new edge type to the existing taxonomy in `types.ts`:

```typescript
// Add to SemanticEdgeRecord.edgeType union:
| 'temporal-supersedes'
```

### Chain Construction

During ingestion (Stage 5: Govern), when contradiction detection finds a supersession:

```typescript
// In governance/promotion logic:
if (contradictionKind === 'supersession') {
  const newNode = createSemanticNode({
    ...candidate,
    temporal: {
      t0: Date.now(),
      w0: 1.0,
      lambda: assignDecayLambda(candidate),
      decayProfile: assignDecayProfile(candidate),
      previousUorId: supersededNode.uorId,
      restakeCount: 0,
    },
  });

  // Mark old node as deprecated
  updateGovernanceState(supersededNode, 'deprecated',
    `Superseded by ${newNode.uorId}`);

  // Create temporal-supersedes edge
  createEdge({
    fromNodeId: newNode.id,
    toNodeId: supersededNode.id,
    edgeType: 'temporal-supersedes',
    // ... standard edge metadata
  });
}
```

### Chain Traversal

Add to `retrieve.ts`:

```typescript
export function resolveTemporalChain(
  nodes: SemanticNodeRecord[],
  now: number,
): SemanticNodeRecord[] {
  const byUorId = new Map(nodes
    .filter(n => n.uorId)
    .map(n => [n.uorId, n]));

  return nodes.filter(node => {
    // If this node is superseded by another node in our result set, drop it
    const superseder = nodes.find(n =>
      n.temporal?.previousUorId === node.uorId
    );
    if (superseder) {
      const supersederWeight = computeDecayWeight(superseder.temporal, now);
      const thisWeight = computeDecayWeight(node.temporal, now);
      // Keep superseded node only if superseder has decayed below it
      return supersederWeight < thisWeight;
    }
    return true;
  });
}
```

This means: if "user prefers Rust" (new, high weight) and "user prefers Python" (old, low weight) are both retrieved, only the Rust preference survives filtering. But if years pass and the Rust preference decays below a refreshed Python memory, the chain math reflects that.

### Acceptance Criteria

- [ ] `temporal-supersedes` edge type exists
- [ ] Supersession during governance creates temporal chain link
- [ ] `previousUorId` is populated on superseding nodes
- [ ] `resolveTemporalChain` filters stale predecessors from retrieval bundles
- [ ] Unit test: newer node in chain suppresses older node
- [ ] Unit test: if superseder decays below predecessor, predecessor resurfaces
- [ ] Deprecated governance state applied to superseded nodes

---

## Capability 4: Memory Restaking (Neuroplasticity)

### Problem

Decay is one-directional. If an old memory decays but proves critical during a retrieval, the system has no mechanism to refresh it.

### Solution

When a decayed memory is retrieved AND used successfully (confirmed by the agent or governance feedback), mint a restaking event that resets `t0` without mutating the original UOR object.

### Mechanism

Since UOR objects are content-addressed and immutable, we cannot change `t0` on the original. Instead:

```typescript
export interface RestakeEvent {
  id: string;
  targetUorId: string;       // The memory being restaked
  restakedAt: number;        // New t0
  reason: string;            // Why this memory was refreshed
  triggeredBy: string;       // Agent ID or retrieval context
  governanceApproval: boolean;
}
```

During retrieval, when computing decay weight, check for restake events:

```typescript
export function effectiveT0(
  temporal: TemporalMetadata,
  restakeEvents: RestakeEvent[],
): number {
  const latest = restakeEvents
    .filter(e => e.targetUorId === temporal.uorId && e.governanceApproval)
    .sort((a, b) => b.restakedAt - a.restakedAt)[0];

  return latest ? latest.restakedAt : temporal.t0;
}
```

### Restake Triggers

1. **Agent feedback** — Agent marks a decayed memory as critical after using it
2. **Recurrence** — Same memory is retrieved in multiple independent queries within a window
3. **Governance override** — Policy rule marks certain memory categories as restakable

### Restake Governance

Restaking is a governed action. It must:
- Pass through the governance ledger
- Record the reason and triggering context
- Not exceed a configurable restake budget per time window (prevents infinite refresh loops)
- Increment `restakeCount` on the temporal metadata

### Acceptance Criteria

- [ ] `RestakeEvent` type exists
- [ ] `effectiveT0` function computes restaked decay correctly
- [ ] Restake events are stored in Neo4j or DuckDB
- [ ] Restake triggers are implemented (agent feedback, recurrence)
- [ ] Restake budget limits prevent infinite refresh
- [ ] Governance ledger records restake events
- [ ] Unit test: restaked memory returns to full weight
- [ ] Unit test: restake budget prevents excessive refreshing

---

## Implementation Phases (Agent-Consumable)

### Phase 1: Decay Fields and Scoring (Capability 1, Part A)

**Target files:** `types.ts`, `rank.ts`

Tasks:
1. Add `TemporalMetadata` type and `DecayProfile` type to `types.ts`
2. Add `temporal?: TemporalMetadata` to `SemanticNodeRecord`, `SemanticEdgeRecord`, `CacheEntryRecord`, `SourceChunkRecord`
3. Implement `computeDecayWeight()` in `rank.ts`
4. Implement `assignDecayProfile()` helper
5. Write unit tests for decay math and profile assignment

**Verification:** `bun test rank.test.ts` passes with new decay tests.

### Phase 2: Retrieval Integration (Capability 1, Part B)

**Target files:** `retrieve.ts`, `rank.ts`

Tasks:
1. Modify `scoreChunk()` and `scoreSemanticNode()` to apply decay multiplier
2. Add decay threshold filtering in `retrieveGroundedContext()`
3. Add `decayFilteredCount` to `RetrievalTrace`
4. Write integration tests for decay-filtered retrieval

**Verification:** `bun test retrieve.test.ts` passes; decayed memories excluded from bundles.

### Phase 3: Ingestion Decay Assignment (Capability 1, Part C)

**Target files:** `ingest.ts`, `governance.ts`

Tasks:
1. Assign `temporal` metadata during `Stage 6: Index`
2. Map epistemic types and node types to decay profiles
3. Store temporal fields in Neo4j via `neo4j-store.ts`

**Verification:** Newly ingested documents have `temporal` metadata on all nodes.

### Phase 4: UOR Cache Invalidation (Capability 2)

**Target files:** `cache.ts`, `types.ts`

Tasks:
1. Add `UORCacheValidation` interface to `types.ts`
2. Add `uorValidation?: UORCacheValidation` to `CacheEntryRecord`
3. Implement `isUORCacheStale()` in `cache.ts`
4. Wire into retrieval pipeline (check UOR staleness before `rankCacheEntries`)
5. Populate `uorValidation` during cache entry creation
6. Write unit tests

**Verification:** `bun test cache.test.ts` passes with UOR staleness tests.

### Phase 5: Temporal Chaining (Capability 3)

**Target files:** `types.ts`, `retrieve.ts`, `ingest.ts`, `neo4j-store.ts`

Tasks:
1. Add `temporal-supersedes` to `SemanticEdgeRecord.edgeType`
2. During contradiction handling (supersession kind), create temporal chain
3. Implement `resolveTemporalChain()` in `retrieve.ts`
4. Wire into retrieval pipeline after node assembly
5. Write unit tests for chain resolution

**Verification:** `bun test retrieve.test.ts` passes; superseded nodes filtered correctly.

### Phase 6: Restaking (Capability 4)

**Target files:** `types.ts`, `rank.ts`, `governance.ts`, `neo4j-store.ts`

Tasks:
1. Add `RestakeEvent` type to `types.ts`
2. Implement `effectiveT0()` in `rank.ts`
3. Add restake storage to `neo4j-store.ts`
4. Add restake budget enforcement
5. Wire restake triggers into retrieval feedback loop
6. Record restake events in governance ledger
7. Write unit tests

**Verification:** `bun test rank.test.ts` and `bun test governance.test.ts` pass with restake tests.

---

## Governed Task Queue (for agent pickup)

```json
[
  {
    "taskId": "task_cmhl_decay_fields",
    "title": "Add temporal decay fields to memory types",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "high",
    "acceptance": ["TemporalMetadata type exists", "decay fields on all memory records", "unit tests pass"],
    "implementationPhase": 1
  },
  {
    "taskId": "task_cmhl_lazy_decay_retrieval",
    "title": "Implement lazy decay scoring in retrieval pipeline",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "high",
    "depends_on": ["task_cmhl_decay_fields"],
    "acceptance": ["decay multiplier in rank scoring", "threshold filtering in retrieve", "integration tests pass"],
    "implementationPhase": 2
  },
  {
    "taskId": "task_cmhl_ingestion_assignment",
    "title": "Assign decay profiles during ingestion",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "medium",
    "depends_on": ["task_cmhl_decay_fields"],
    "acceptance": ["epistemic→profile mapping implemented", "node type overrides applied", "new ingestions carry temporal metadata"],
    "implementationPhase": 3
  },
  {
    "taskId": "task_cmhl_uor_cache_invalidation",
    "title": "UOR fingerprint-based cache invalidation",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "medium",
    "depends_on": ["task_cmhl_decay_fields"],
    "acceptance": ["isUORCacheStale function exists", "retrieval uses UOR staleness check", "fallback to dependency-ref for old entries"],
    "implementationPhase": 4
  },
  {
    "taskId": "task_cmhl_temporal_chaining",
    "title": "Temporal chaining for superseding memories",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "medium",
    "depends_on": ["task_cmhl_decay_fields", "task_cmhl_lazy_decay_retrieval"],
    "acceptance": ["temporal-supersedes edge type", "chain resolution in retrieval", "deprecated state on superseded nodes"],
    "implementationPhase": 5
  },
  {
    "taskId": "task_cmhl_restaking",
    "title": "Memory restaking mechanism",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "low",
    "depends_on": ["task_cmhl_temporal_chaining"],
    "acceptance": ["RestakeEvent type", "effectiveT0 computation", "budget enforcement", "governance ledger records"],
    "implementationPhase": 6
  },
  {
    "taskId": "task_cmhl_governance_integration",
    "title": "Governance integration for temporal memory",
    "phase": "phase_cmhl_integration",
    "status": "pending",
    "priority": "low",
    "depends_on": ["task_cmhl_restaking"],
    "acceptance": ["decay-aware governance state transitions", "temporal metadata in governance events", "full pipeline substantiation"],
    "implementationPhase": 6
  }
]
```

---

## What This Does NOT Do

- Does not replace the existing governance gate system
- Does not introduce background reindexing jobs
- Does not change how embeddings are generated
- Does not require a new database or storage layer
- Does not make truth claims about data correctness (UOR proves integrity, not truth)
- Does not create an "artificial hippocampus" — it applies time-decay scoring to retrieval ranking

## Risks

| Risk | Mitigation |
|------|-----------|
| Decay constants miscalibrated | Start with conservative (slow) decay; tune from retrieval quality metrics |
| Critical memory decays before restaking | `permanent` profile for governance policy, decisions, identity |
| Restaking loops refresh everything | Budget cap per time window; governance approval required |
| UOR migration incomplete when cache check runs | Fallback to dependency-ref for entries without `uorValidation` |
| Temporal chains grow unbounded | Chain traversal only within retrieved candidate set, not full graph |

## References

- `2026-03-15-victor-memory-governance-architecture.md` — Target architecture (stages, gates, failure modes)
- `2026-03-17-uor-identity-adapter-design.md` — UOR fingerprint and identity model
- `kernel/memory/types.ts` — Current type definitions
- `kernel/memory/rank.ts` — Current scoring functions
- `kernel/memory/retrieve.ts` — Current retrieval pipeline
- `kernel/memory/cache.ts` — Current cache invalidation logic
- `kernel/memory/provenance.ts` — Current fingerprinting
