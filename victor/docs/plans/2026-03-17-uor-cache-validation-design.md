---
title: UOR Cache Validation Design
date: 2026-03-17
status: draft
agent_id: 8866a9e1-ad3d-420d-96a7-a37747d5a06e
task: task_victor_uor_cache_validation
phase: phase_victor_uor_grounding
---

# UOR Cache Validation Design

## Purpose

Define how Victor's cache system validates stored summaries, retrieval bundles, and CAG entries against current graph state using UOR fingerprints, ensuring stale memory fails closed rather than silently propagating outdated information.

This design addresses a critical gap in the memory governance architecture: the lack of deterministic cache invalidation. Current time-based expiration is insufficient for a system that claims to distinguish observation from inference and preserve provenance.

## Core Thesis

> Cache entries are claims about graph state. UOR fingerprints let us verify those claims.

When Victor stores a summary or retrieval bundle, it makes implicit claims about the source documents, chunks, and semantic nodes that produced it. Without validation, these claims become stale silently. With UOR-backed validation, stale claims are detected and rejected before they contaminate downstream reasoning.

## Design Principles

1. **Fingerprint-Anchored Dependencies**: Every cache entry names the UOR fingerprints of its source artifacts
2. **Deterministic Invalidation**: Cache validation compares stored fingerprints to current graph state, not timestamps
3. **Fail-Closed**: When validation fails, the cache entry is marked stale and not used for durable memory
4. **Auditable Validation**: Each validation produces a validation record with the comparison outcome
5. **Lazy Validation**: Validation occurs at retrieval time, not on every graph change

## Cache Entry Types

### Type 1: Source Document Cache
**Purpose**: Cached document metadata to avoid re-reading unchanged files

**Dependency Structure**:
```typescript
interface SourceDocumentCacheDeps {
  type: 'source-document';
  documentUorId: string;      // UOR ID of the source document
  contentFingerprint: string; // SHA256 of canonical content
  fileStat: {
    mtime: number;            // Modification time (advisory only)
    size: number;             // File size (advisory only)
  };
}
```

**Validation Rules**:
1. Recompute content fingerprint from current file state
2. Compare to stored `contentFingerprint`
3. Match → cache valid; Mismatch → cache stale
4. File stat changes without content change → advisory warning only

**Failure Mode**: FAIL-CLOSED (stale cache not used, document re-ingested)

---

### Type 2: Chunk Cache
**Purpose**: Cached chunk boundaries and embeddings to avoid re-chunking

**Dependency Structure**:
```typescript
interface ChunkCacheDeps {
  type: 'chunk-set';
  documentUorId: string;           // Parent document UOR ID
  documentFingerprint: string;     // Parent document content fingerprint
  chunkingStrategy: string;        // Strategy identifier (e.g., 'semantic-512')
  chunkFingerprints: string[];     // Individual chunk content hashes
}
```

**Validation Rules**:
1. Validate parent document first (Type 1 validation)
2. If parent stale → entire chunk cache stale
3. If parent valid → spot-check 10% of chunk fingerprints
4. Any mismatch → full re-chunking required

**Failure Mode**: FAIL-CLOSED (stale chunks not used, document re-chunked)

---

### Type 3: Semantic Node Cache (CAG Entries)
**Purpose**: Cached semantic graph nodes derived from documents/chunks

**Dependency Structure**:
```typescript
interface SemanticNodeCacheDeps {
  type: 'semantic-node';
  nodeUorId: string;              // UOR ID of this semantic node
  sourceUorIds: string[];         // UOR IDs of source documents/chunks
  sourceFingerprints: string[];   // Fingerprints of sources at extraction time
  extractionVersion: string;      // Extraction algorithm version
  ontologyContext: string;        // Ontology version used for typing
}
```

**Validation Rules**:
1. For each source UOR ID, validate current fingerprint matches stored
2. If any source stale → node marked provisional (not durable)
3. If extraction version outdated → node marked for re-extraction
4. If ontology context changed → node type may need re-validation

**Failure Mode**: DEGRADED (node demoted to provisional, not removed, pending re-extraction)

---

### Type 4: Retrieval Bundle Cache
**Purpose**: Cached query results (vector + graph search) for similar queries

**Dependency Structure**:
```typescript
interface RetrievalBundleCacheDeps {
  type: 'retrieval-bundle';
  queryFingerprint: string;       // Hash of canonical query
  queryIntent: string;            // Classified intent (grounded, advisory, exploratory)
  nodeUorIds: string[];         // UOR IDs of retrieved semantic nodes
  nodeFingerprints: string[];     // Node state fingerprints at retrieval time
  graphExpansionDepth: number;    // How far graph was traversed
  vectorSearchParams: {
    embeddingModel: string;
    topK: number;
    similarityThreshold: number;
  };
  retrievedAt: string;            // ISO timestamp
  ttlSeconds: number;             // Maximum cache lifetime (safety bound)
}
```

**Validation Rules**:
1. Check if `ttlSeconds` exceeded (hard time bound for safety)
2. Validate each retrieved node using Type 3 validation
3. Count stale nodes; if >20% of bundle stale → full re-retrieval
4. If query intent was `grounded` and any node stale → upgrade to `advisory`

**Failure Mode**: CONTEXTUAL (bundle may be used with degraded confidence or re-retrieval triggered)

---

### Type 5: Summary Cache
**Purpose**: LLM-generated summaries of document sets or graph regions

**Dependency Structure**:
```typescript
interface SummaryCacheDeps {
  type: 'summary';
  summaryUorId: string;           // UOR ID for this summary
  scopeUorIds: string[];          // UOR IDs of summarized documents/nodes
  scopeFingerprints: string[];     // Fingerprints of scope at summary time
  summaryFingerprint: string;     // Fingerprint of summary content
  modelVersion: string;           // LLM model used
  promptVersion: string;          // Prompt template version
  governanceState: 'durable' | 'provisional' | 'stale';
}
```

**Validation Rules**:
1. Validate all scope items (documents, nodes) using appropriate type validation
2. If any scope item stale → summary marked `stale` (not `provisional`)
3. Stale summaries are NOT used for grounded responses
4. Stale summaries MAY be shown in "stale memory" introspection UI

**Failure Mode**: FAIL-CLOSED (stale summary not used for any claims)

## Validation Orchestration

### Validation Coordinator

```typescript
interface CacheValidationCoordinator {
  // Main entry point for cache validation
  validate<T extends CacheEntry>(
    entry: T,
    depth: 'shallow' | 'deep'
  ): Promise<ValidationResult<T>>;

  // Batch validation for retrieval bundles
  validateBatch(
    entries: CacheEntry[],
    abortOnFirstStale: boolean
  ): Promise<BatchValidationResult>;
}
```

### Validation Result Structure

```typescript
interface ValidationResult<T> {
  entry: T;
  status: 'valid' | 'stale' | 'degraded' | 'error';
  checkedAt: string;              // ISO timestamp
  checkedDependencies: {
    uorId: string;
    type: CacheEntryType;
    storedFingerprint: string;
    currentFingerprint: string;
    match: boolean;
  }[];
  staleDependencies: string[];      // UOR IDs of stale deps
  recommendedAction: 'use' | 'revalidate' | 'regenerate' | 'discard';
  degradationNotes?: string[];      // Human-readable explanation
}
```

## UOR Fingerprint Comparison

### Fingerprint Canonicalization

Before comparison, fingerprints must be canonicalized:

1. **Content Normalization**: Remove trailing whitespace, normalize line endings
2. **Hash Algorithm**: SHA-256 with hex encoding (lowercase)
3. **Delimiter**: Pipe character `|` for composite fingerprints
4. **Ordering**: Lexicographic sort of set elements before hashing

### Composite Fingerprint Formula

```
uorFingerprint = sha256(
  sourceUrl + "|" + 
  canonicalContentHash + "|" + 
  canonicalScope + "|" + 
  ontologyType
)
```

## Cache Policy Configuration

```typescript
interface CacheValidationPolicy {
  version: string;
  
  // Validation depth by entry type
  validationDepth: {
    'source-document': 'deep';
    'chunk-set': 'deep';
    'semantic-node': 'shallow';
    'retrieval-bundle': 'shallow';
    'summary': 'deep';
  };
  
  // Degradation thresholds
  thresholds: {
    retrievalBundleStalePercent: number;  // Max % stale before re-retrieval
    maxCacheAgeSeconds: number;           // Hard TTL regardless of validity
  };
  
  // Intent-specific rules
  intentRules: {
    grounded: { requireAllValid: true };
    advisory: { allowDegraded: true };
    exploratory: { allowStale: true };
  };
}
```

## Integration with Existing Systems

### Integration with CAG (Context-Augmented Generation)

- CAG entries are Type 3 (Semantic Node) cache entries
- CAG retrieval triggers validation on all returned nodes
- CAG writes include full dependency metadata

### Integration with GraphRAG Retrieval

- Retrieval bundles (Type 4) wrap GraphRAG query results
- Graph traversal depth is captured in dependencies
- Neo4j node versions can serve as coarse-grained invalidation signals

### Integration with Builder Console

- Cache validation events are ledgered in Builder project state
- Stale cache discoveries are reported as "drift signals"
- Cache hit/miss metrics feed into "observation quality" signals

## Migration Path

### Phase 1: Dependency Metadata Addition

Add UOR fingerprint tracking to existing cache entries without breaking current behavior:

1. Modify cache write paths to include dependency metadata
2. Store alongside existing timestamp-based metadata
3. UOR validation runs in parallel with existing logic (shadow mode)

### Phase 2: Validation Logic Implementation

Implement validation coordinator and per-type validation rules:

1. Create `CacheValidationCoordinator` implementation
2. Add validation triggers to cache read paths
3. Log validation results without changing cache behavior

### Phase 3: Fail-Closed Activation

Enable actual fail-closed behavior based on validation results:

1. Promote UOR validation to primary cache validity check
2. Demote timestamp-based checks to advisory only
3. Activate stale cache blocking for grounded queries

### Phase 4: Policy Externalization

Move validation rules to external policy file:

1. Create `cache-validation-policy.json`
2. Load policy at runtime
3. Version policy separately from code

## Verification Checklist

- [ ] All five cache entry types have defined dependency structures
- [ ] Validation rules are deterministic (no randomness, no time-based primary checks)
- [ ] Fail-closed behavior is explicit for each entry type
- [ ] Validation results include full dependency chain for audit
- [ ] Composite fingerprint formula is documented and testable
- [ ] Integration points with CAG, GraphRAG, and Builder are specified
- [ ] Four-phase migration path preserves backward compatibility
- [ ] Policy configuration structure supports future rule changes

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Cache dependency metadata names UOR fingerprints | ✓ | Dependency structures for all 5 cache types include UOR IDs and fingerprints |
| Invalidation rules are deterministic | ✓ | All validation rules compare fingerprints, not timestamps (except safety TTL) |
| Invalidation rules are testable | ✓ | Validation results include full comparison data; rules are explicit and stateless |
| Cache validation integrates with CAG | ✓ | CAG entries defined as Type 3 (semantic node) with validation rules |
| Cache validation integrates with GraphRAG | ✓ | Retrieval bundles (Type 4) wrap GraphRAG results with dependency tracking |
| Migration path preserves existing cache behavior | ✓ | Four-phase migration with shadow mode before activation |

## Implementation Targets

Based on the UOR-to-Victor Artifact Crosswalk, the following implementation files will need modification:

| Design Component | Target File | Migration Phase |
|-----------------|-------------|-----------------|
| Dependency structures | `kernel/memory/types.ts` | Phase 1 |
| Validation coordinator | `kernel/memory/cache.ts` (new) | Phase 2 |
| CAG validation hooks | `kernel/memory/cag-store.ts` (new) | Phase 2 |
| GraphRAG bundle wrapper | `kernel/memory/retrieve.ts` | Phase 2 |
| Policy loader | `kernel/memory/policy.ts` (new) | Phase 4 |
| Cache policy JSON | `config/cache-validation-policy.json` | Phase 4 |

## Relation to Other UOR Tasks

- **task_victor_uor_identity_adapter**: This design consumes UOR IDs and fingerprints produced by the identity adapter
- **task_victor_uor_interop_contracts**: Cache validation results will be part of the interchange envelope between agents
- **task_builder_uor_cache_contract**: Builder-side cache validation will use identical dependency structures

## Next Required Slices

1. **Implement Dependency Metadata Types** (HIGH PRIORITY)
   - Target: `kernel/memory/types.ts`
   - Deliverable: TypeScript interfaces for all 5 cache dependency types

2. **Create Cache Validation Policy File** (MEDIUM PRIORITY)
   - Target: `config/cache-validation-policy.json`
   - Deliverable: JSON policy with thresholds and intent rules

3. **Begin Interoperability Contract Design** (MEDIUM PRIORITY)
   - Target: `task_victor_uor_interop_contracts`
   - Deliverable: Interchange envelope specification for UOR-backed references

---
**End of Cache Validation Design Document**
