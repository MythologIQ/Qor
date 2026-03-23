# Victor Memory Architecture Simplification Plan

**Date:** 2026-03-17
**Status:** Governed plan — pending implementation
**Prerequisite:** CMHL tasks 1–3 already landed; simplification steps must account for existing temporal code
**Governance:** Each step produces a testable diff; no step changes runtime behavior until tests pass

---

## Motivation

Architectural evaluation identified 8 sources of excess compute or unnecessary complection (interleaved concerns that should be independent). These simplifications reduce surface area, eliminate dead code, and prepare the kernel for CMHL integration with fewer moving parts.

---

## Step 1: Delete premature UOR interop contracts

**Priority:** Highest — removes 90 lines of zero-consumer code
**Files:** `kernel/memory/types.ts` (lines 116–208)
**Risk:** None — no imports reference these types outside the test file created for them

### Actions
1. Delete `UORFingerprint`, `UORIdentity`, `UORGraphReference`, `UORCacheReference`, `UORClaim`, `UORInterchangeEnvelope`, `UORDereferenceResult`, `UORIdentityFactory` from `types.ts`
2. Delete `kernel/memory/uor-interop.ts` (implementation) and `kernel/memory/uor-interop.test.ts` (tests)
3. Remove the `task_victor_uor_interop_contracts` task status from phases.json or mark it `reverted`
4. Grep for any remaining imports of these types and remove them

### Verification
- `npx tsc --noEmit` passes
- All existing tests pass
- No runtime imports reference deleted types

### Rationale
These types were speculative — designed for an agent interchange envelope with zero consumers. When real interop needs arise, the types should grow from actual usage, not be pre-designed. The design docs remain as reference.

---

## Step 2: Collapse 4D ConfidenceProfile to single confidence number

**Priority:** High — removes ceremony from every governed artifact
**Files:** `types.ts`, `governance.ts`, `governance.test.ts`, `memory-governance-policy.json`, `rank.ts`, `cache.ts`, `ingest.ts`, `evaluate.ts`, `neo4j-store.ts`

### Actions
1. Replace `ConfidenceProfile` interface with `confidence: number` field on `GovernanceMetadata`
2. Update `createGovernanceMetadata()` in `governance.ts` to accept and return a single number (default 0.5)
3. Update `createConfidenceProfile()` → remove entirely, inline the default
4. Update `isDurableCandidate()` to check `metadata.confidence >= DURABLE_THRESHOLD` (single threshold from policy)
5. Update `memory-governance-policy.json`: replace `durableThresholds` object with single `durableThreshold: 0.8`
6. Update `buildNegativeConstraintSummaryCacheEntry()` in `cache.ts` — replace 4D confidence with single value
7. Update `planArtifactIngestion()` in `ingest.ts` — replace 4D confidence with single value
8. Update Neo4j property storage — store `confidence` as single float instead of 4 properties
9. Update all test files that construct `ConfidenceProfile` objects

### Verification
- All unit tests pass with single-number confidence
- `isDurableCandidate()` produces same promote/reject decisions for existing data
- Neo4j schema migration handles old 4D data (take `min()` of the 4 values)

### Rationale
The 4 dimensions (extraction, grounding, crossSource, operational) are always set to guessed constants. No code path ever sets them independently based on actual signals. A single number is honest about the current state.

---

## Step 3: Deduplicate `tokenizeQuery`

**Priority:** Medium — eliminates triple-maintained logic
**Files:** `rank.ts` (line 70), `retrieve.ts` (line 387), `evaluate.ts` (line 715)

### Actions
1. Export `tokenizeQuery` from `rank.ts` (it's already there, just not exported)
2. In `retrieve.ts`: replace local `tokenizeQuery` with `import { tokenizeQuery } from './rank'`
3. In `evaluate.ts`: replace local `tokenizeQuery` with `import { tokenizeQuery } from './rank'`
4. Delete the duplicate function bodies from `retrieve.ts` and `evaluate.ts`

### Verification
- All tests pass
- Grep confirms exactly one definition of `tokenizeQuery`

---

## Step 4: Remove `stale` from GovernanceState union

**Priority:** Medium — unifies freshness into a single mechanism
**Files:** `types.ts`, `cache.ts`, `governance.ts`

### Actions
1. Remove `'stale'` from the `GovernanceState` union type in `types.ts`
2. In `ensureGovernedCacheEntry()` (cache.ts line 31): instead of setting governance state to `'stale'`, keep governance state unchanged — staleness is already tracked by `CacheEntryRecord.status`
3. Audit any code that checks `metadata.state === 'stale'` and redirect to `entry.status === 'stale'`

### Verification
- TypeScript compilation catches any remaining references to `'stale'` governance state
- Cache staleness behavior is unchanged (still driven by `CacheEntryRecord.status`)
- Retrieval pipeline still filters stale caches correctly

### Rationale
`GovernanceState` tracks epistemic lifecycle (provisional → durable → deprecated). Cache freshness is an operational concern, not an epistemic one. Mixing them causes `stale` to appear in two orthogonal systems.

---

## Step 5: Split LearningStore interface

**Priority:** Medium — reduces coupling, enables independent evolution
**Files:** `store.ts`, `neo4j-store.ts`, `evaluate.ts` (InMemoryEvaluationStore)

### Actions
1. Define three focused interfaces in `store.ts`:
   ```typescript
   interface GraphStore {
     initialize(): Promise<void>;
     close(): Promise<void>;
     loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot>;
     upsertDocument(document: SourceDocumentRecord): Promise<void>;
     replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void>;
     upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void>;
     markSemanticNodesTombstoned(nodeIds: string[]): Promise<void>;
     upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void>;
     markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void>;
     upsertCacheEntries(entries: CacheEntryRecord[]): Promise<void>;
     markCacheEntriesStale(cacheIds: string[]): Promise<void>;
     appendIngestionRun(run: IngestionRunRecord): Promise<void>;
     appendFailureMemory(record: FailureMemoryRecord): Promise<void>;
     listFailureMemory(...): Promise<FailureMemoryRecord[]>;
     remediateFailureMemories(...): Promise<number>;
     markNegativeConstraintSummaryStale(projectId: string): Promise<void>;
   }

   interface RetrievalStore {
     searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]>;
     searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]>;
     searchSemanticNodes(projectId: string, query: string, limit: number): Promise<SemanticNodeRecord[]>;
     expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood>;
     loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]>;
   }

   interface LegacyLearningStore {
     index(packet: LearningPacket): Promise<void>;
     query(criteria: LearningQuery): Promise<LearningPacket[]>;
     update(id: string, packet: LearningPacket): Promise<void>;
     updateHeatmap(update: HeatmapUpdate): Promise<void>;
   }
   ```
2. Keep `LearningStore` as a union: `type LearningStore = GraphStore & RetrievalStore & LegacyLearningStore`
3. Update `applyIngestionPlan()` in `ingest.ts` to accept `GraphStore` instead of inline interface
4. Update `retrieveGroundedContext()` in `retrieve.ts` to accept `RetrievalStore & Pick<GraphStore, 'loadFreshCacheEntries' | ...>`
5. Neo4j store implements all three — no changes to implementation, only type annotations

### Verification
- TypeScript compiles — union type ensures backward compatibility
- All tests pass unchanged
- Callers that only need retrieval now accept `RetrievalStore` instead of full `LearningStore`

---

## Step 6: Scope previousUorId to SemanticNodeRecord only

**Priority:** Medium — prevents temporal chain fields from spreading to non-chainable records
**Files:** `types.ts`
**Status:** Partially superseded — `t0` already landed in `TemporalMetadata` via CMHL tasks 1–3. The `t0` field is now load-bearing in `computeDecayWeight()` and `createTemporalMetadata()`. Removing it would require migrating all existing temporal data. Accept `t0` as-is.

### Actions
1. When implementing CMHL temporal chaining (task_cmhl_temporal_chaining), add `previousUorId?: string` ONLY to `SemanticNodeRecord` — not as a field on `TemporalMetadata` where it currently lives
2. Move `previousUorId` from `TemporalMetadata` to `SemanticNodeRecord` directly (it's optional, so no migration needed for chunks/edges/cache entries that never set it)

### Verification
- `previousUorId` exists only on `SemanticNodeRecord`, not on `TemporalMetadata`
- TypeScript compilation passes
- Temporal chaining tests only create chains on semantic nodes

### Rationale
`previousUorId` only makes sense for semantic nodes that undergo supersession — chunks and edges don't have temporal chains. Keeping it on `TemporalMetadata` means every chunk and cache entry carries a field they'll never use.

---

## Step 7: Use GovernanceEventRecord for restake events

**Priority:** Low — only matters when CMHL restaking is implemented
**Files:** `types.ts` (when CMHL is implemented)

### Actions
1. Do NOT create a separate `RestakeEvent` type
2. Add `'memory-restaked'` to `GovernanceEventRecord.eventType` union
3. Store restake metadata in `GovernanceEventRecord.metadata` (keys: `targetUorId`, `reason`, `previousDecayWeight`, `restoredDecayWeight`, `budgetRemaining`)
4. `effectiveT0()` queries `GovernanceEventRecord` where `eventType === 'memory-restaked'` and `entityId` matches

### Verification
- Restake events appear in the same governance audit trail as other events
- No separate storage or query path needed

---

## Step 8: Remove CacheEntryRecord.status field (deferred)

**Priority:** Low — depends on UOR fingerprint cache validation being implemented first
**Files:** `types.ts`, `cache.ts`, `rank.ts`, `retrieve.ts`, `neo4j-store.ts`

### Actions
1. **Deferred until** UOR fingerprint-based cache validation (task_cmhl_uor_cache_invalidation) is complete
2. Once UOR validation is live: remove `status: 'fresh' | 'stale'` from `CacheEntryRecord`
3. Replace `entry.status === 'fresh'` checks with `isUORCacheValid(entry)`
4. Remove `markCacheEntriesStale()` from store interface — staleness is computed, not stored

### Verification
- All cache freshness decisions go through UOR fingerprint comparison
- No stored `status` field — freshness is always computed at retrieval time

---

## Execution Order

```
Step 1 (delete UOR interop)     — independent, do first
Step 2 (collapse confidence)    — independent, do second
Step 3 (dedupe tokenizeQuery)   — independent, can parallel with 1-2
Step 4 (remove stale state)     — after Step 2 (touches governance types)
Step 5 (split LearningStore)    — after Steps 2, 4 (types stabilized)
Step 6 (CMHL field decisions)   — before CMHL implementation begins
Step 7 (restake via events)     — before CMHL restaking task begins
Step 8 (remove cache status)    — after CMHL UOR cache validation ships
```

Steps 1–3 can be done immediately and in parallel. Steps 4–5 follow once governance types are simplified. Steps 6–7 are constraints on future CMHL work. Step 8 is deferred.

---

## Impact on CMHL Plan

CMHL tasks 1–3 (decay fields, lazy retrieval, ingestion assignment) are already complete. Remaining CMHL tasks should incorporate:

- **task_cmhl_temporal_chaining**: Move `previousUorId` from `TemporalMetadata` to `SemanticNodeRecord` directly (Step 6)
- **task_cmhl_restaking**: Use `GovernanceEventRecord` with `'memory-restaked'` event type, not separate `RestakeEvent` entity (Step 7)
- **task_cmhl_uor_cache_invalidation**: After completion, triggers Step 8 (remove `CacheEntryRecord.status` field)
- **Confidence collapse** (Step 2): Will require updating the hardcoded 4D confidence values in `createTemporalMetadata` and `planArtifactIngestion` to single numbers
