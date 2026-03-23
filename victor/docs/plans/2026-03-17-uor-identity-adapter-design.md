---
title: UOR Identity and Provenance Adapter Design
date: 2026-03-17
status: draft
agent_id: 8866a9e1-ad3d-420d-96a7-a37747d5a06e
task: task_victor_uor_identity_adapter
phase: phase_victor_uor_grounding
---

# UOR Identity and Provenance Adapter Design

## Purpose

Define how Victor's memory system (documents, chunks, semantic nodes, relations, and summaries) maps to Universal Object Reference (UOR) fingerprints and canonical ontology terms, creating deterministic identity for governance-backed memory operations.

## Scope

This adapter design covers:
- Document identity mapping to UOR
- Chunk identity with source anchoring
- Semantic node canonicalization
- Relation identity with typed endpoints
- Provenance chain integrity
- Migration path from existing provenance

## Core Principles

1. **Deterministic Identity**: Same content + same context = same UOR fingerprint
2. **Ontology-Backed**: Core types map to canonical ontology terms
3. **Provenance Preserved**: Existing source anchors maintained during migration
4. **Governance-Visible**: Identity decisions are auditable and reversible
5. **Fail-Closed**: Identity conflicts surface as blockers, not silent overwrites

## Identity Types and UOR Mapping

### 1. Document Identity

**Current State**: Documents have `sourceId`, `fingerprint`, and `provenance` metadata.

**UOR Mapping**:
```typescript
interface UORDocumentIdentity {
  // Primary UOR fingerprint
  uorId: string; // sha256(sourceUrl + contentHash + canonicalScope)
  
  // Canonical ontology reference
  ontologyType: "Document" | "CodeFile" | "Conversation" | "Artifact";
  
  // Provenance preserved
  sourceAnchor: {
    url: string;
    fingerprint: string; // original content hash
    ingestedAt: string;
  };
  
  // Governance metadata
  governance: {
    state: "provisional" | "durable" | "contested" | "deprecated";
    epistemicType: "observation" | "inference" | "synthesis";
    confidence: number; // 0-1
    policyVersion: string;
  };
}
```

**Fingerprint Algorithm**:
```
uorId = sha256(sourceUrl + "|" + contentHash + "|" + canonicalScope + "|" + ontologyType)
```

Where:
- `sourceUrl`: Normalized URL or file path
- `contentHash`: sha256 of normalized content
- `canonicalScope`: Project or domain scope (e.g., "victor-resident", "zo-qore")
- `ontologyType`: Canonical type from shared ontology

### 2. Chunk Identity

**Current State**: Chunks have `chunkId`, `sourceDocId`, `span`, and `fingerprint`.

**UOR Mapping**:
```typescript
interface UORChunkIdentity {
  // Primary UOR fingerprint
  uorId: string; // sha256(sourceDoc.uorId + span.start + span.end + contentHash)
  
  // Parent document reference
  parentDocUorId: string;
  
  // Span within parent
  span: {
    start: number;
    end: number;
    unit: "char" | "token" | "line";
  };
  
  // Canonical ontology reference
  ontologyType: "Chunk" | "Paragraph" | "CodeBlock" | "Section";
  
  // Content verification
  contentHash: string;
  
  // Governance metadata
  governance: {
    state: "provisional" | "durable" | "contested" | "deprecated";
    epistemicType: "observation" | "inference" | "synthesis";
    confidence: number;
    policyVersion: string;
  };
}
```

**Fingerprint Algorithm**:
```
uorId = sha256(parentDocUorId + "|" + span.start + "|" + span.end + "|" + contentHash + "|" + ontologyType)
```

### 3. Semantic Node Identity

**Current State**: Semantic nodes have `nodeId`, `type`, `label`, and `sourceChunks`.

**UOR Mapping**:
```typescript
interface UORSemanticNodeIdentity {
  // Primary UOR fingerprint
  uorId: string; // sha256(ontologyType + canonicalLabel + scope)
  
  // Canonical ontology reference
  ontologyType: string; // e.g., "Concept", "Entity", "Decision", "Constraint"
  
  // Canonical label (normalized)
  canonicalLabel: string;
  
  // Scope for disambiguation
  scope: string; // project or domain scope
  
  // Source provenance (multiple chunks may contribute)
  sourceAnchors: Array<{
    chunkUorId: string;
    span: { start: number; end: number };
    extractionConfidence: number;
  }>;
  
  // Governance metadata
  governance: {
    state: "provisional" | "durable" | "contested" | "deprecated";
    epistemicType: "observation" | "inference" | "synthesis";
    confidence: number;
    policyVersion: string;
  };
}
```

**Fingerprint Algorithm**:
```
uorId = sha256(ontologyType + "|" + normalize(canonicalLabel) + "|" + scope)
```

**Normalization Rules**:
- Lowercase
- Remove extra whitespace
- Standardize punctuation
- Expand common acronyms (configurable)

### 4. Relation Identity

**Current State**: Relations have `relationId`, `type`, `sourceNodeId`, `targetNodeId`.

**UOR Mapping**:
```typescript
interface UORRelationIdentity {
  // Primary UOR fingerprint
  uorId: string; // sha256(relationType + sourceUorId + targetUorId + scope)
  
  // Relation ontology type
  relationType: string; // e.g., "implements", "depends_on", "contradicts", "supports"
  
  // Endpoint identities
  sourceUorId: string;
  targetUorId: string;
  
  // Scope for context
  scope: string;
  
  // Cardinality and direction
  cardinality: "one_to_one" | "one_to_many" | "many_to_many";
  direction: "directed" | "bidirectional";
  
  // Source provenance
  sourceAnchors: Array<{
    chunkUorId: string;
    span: { start: number; end: number };
    extractionConfidence: number;
  }>;
  
  // Governance metadata
  governance: {
    state: "provisional" | "durable" | "contested" | "deprecated";
    epistemicType: "observation" | "inference" | "synthesis";
    confidence: number;
    policyVersion: string;
  };
}
```

**Fingerprint Algorithm**:
```
uorId = sha256(relationType + "|" + sourceUorId + "|" + targetUorId + "|" + scope + "|" + direction)
```

### 5. Summary Identity

**Current State**: Summaries have `summaryId`, `type`, `sourceNodeIds`, and `contentHash`.

**UOR Mapping**:
```typescript
interface UORSummaryIdentity {
  // Primary UOR fingerprint
  uorId: string; // sha256(summaryType + sourceUorIdsHash + contentHash + scope)
  
  // Summary ontology type
  summaryType: string; // e.g., "TopicSummary", "ProjectDigest", "CrossReference"
  
  // Source nodes (ordered for determinism)
  sourceUorIds: string[]; // sorted
  sourceUorIdsHash: string; // sha256 of sorted ids joined
  
  // Content verification
  contentHash: string;
  
  // Scope
  scope: string;
  
  // Cache validation metadata
  cacheValidation: {
    sourceFingerprints: Array<{
      uorId: string;
      fingerprint: string; // content hash at time of summary
    }>;
    generatedAt: string;
    validUntil: string | null; // null for indefinite
  };
  
  // Governance metadata
  governance: {
    state: "provisional" | "durable" | "contested" | "deprecated";
    epistemicType: "observation" | "inference" | "synthesis";
    confidence: number;
    policyVersion: string;
  };
}
```

**Fingerprint Algorithm**:
```
sourceUorIdsHash = sha256(sortedSourceUorIds.join("|"))
uorId = sha256(summaryType + "|" + sourceUorIdsHash + "|" + contentHash + "|" + scope)
```

## Provenance Chain Integrity

### Source Anchoring

Every UOR-backed identity must maintain a chain to original sources:

```
Summary → [Semantic Nodes] → [Chunks] → Document → Source URL/File
```

Each level carries:
- UOR ID of the parent
- Fingerprint of parent content at time of extraction
- Extraction confidence
- Extraction timestamp

### Provenance Verification

```typescript
interface ProvenanceVerification {
  // Verify chain integrity
  verifyChain(uorId: string): {
    valid: boolean;
    breaks: Array<{
      level: string;
      expectedFingerprint: string;
      actualFingerprint: string;
      uorId: string;
    }>;
    staleSources: string[]; // uorIds of changed sources
  };
}
```

## Migration from Existing Provenance

### Phase 1: Backward Compatibility (Current)

- Existing `sourceId`, `fingerprint` fields remain
- UOR fields added as `uorId`, `uorProvenance`
- Dual-identity mode: both old and new identities valid
- New ingestions get UOR identities immediately

### Phase 2: Migration (Next)

- Batch process existing documents to compute UOR IDs
- Store UOR IDs alongside existing IDs
- Verify fingerprint matches before accepting UOR ID
- Log migration events to ledger

### Phase 3: UOR-Native (Future)

- Old identity fields deprecated (still readable)
- All new writes use UOR identity exclusively
- Retrieval uses UOR IDs for cache keys
- Governance decisions reference UOR IDs

## Ontology Integration

### Canonical Types

```typescript
const ONTOLOGY_TYPES = {
  // Documents
  Document: "uor:Document",
  CodeFile: "uor:CodeFile",
  Conversation: "uor:Conversation",
  Artifact: "uor:Artifact",
  
  // Chunks
  Chunk: "uor:Chunk",
  Paragraph: "uor:Paragraph",
  CodeBlock: "uor:CodeBlock",
  Section: "uor:Section",
  
  // Semantic Nodes
  Concept: "uor:Concept",
  Entity: "uor:Entity",
  Decision: "uor:Decision",
  Constraint: "uor:Constraint",
  Goal: "uor:Goal",
  Risk: "uor:Risk",
  
  // Relations
  Implements: "uor:Implements",
  DependsOn: "uor:DependsOn",
  Contradicts: "uor:Contradicts",
  Supports: "uor:Supports",
  Refines: "uor:Refines",
  
  // Summaries
  TopicSummary: "uor:TopicSummary",
  ProjectDigest: "uor:ProjectDigest",
  CrossReference: "uor:CrossReference",
} as const;
```

### Ontology Resolution

```typescript
interface OntologyResolver {
  // Resolve a type string to canonical URI
  resolve(type: string): string;
  
  // Check if type is valid in ontology
  isValid(type: string): boolean;
  
  // Get parent type (for inheritance)
  getParent(type: string): string | null;
  
  // Get all descendants
  getDescendants(type: string): string[];
}
```

## Governance Integration

### Identity Governance States

| State | Meaning | Transition Rules |
|-------|---------|------------------|
| `provisional` | New identity, not yet verified | Auto after creation, promoted after verification |
| `durable` | Verified, may be used for recall | Requires provenance verification |
| `contested` | Conflict detected, under review | Manual resolution required |
| `deprecated` | Superseded or invalidated | May not be used for new writes |

### Governance Events

```typescript
interface IdentityGovernanceEvent {
  eventId: string;
  timestamp: string;
  uorId: string;
  eventType: "created" | "promoted" | "contested" | "deprecated" | "merged";
  fromState?: string;
  toState: string;
  reason: string;
  actor: string; // agent_id or "system"
  evidence: string[]; // ledger entry refs
}
```

## Cache Integration

### Cache Keys

Cache entries use UOR IDs for deterministic lookup:

```
cacheKey = "uor:" + uorId + ":" + retrievalPolicyVersion
```

### Cache Validation

See `task_victor_uor_cache_validation` for full design. At identity level:

- Cache entries store `sourceFingerprints` array
- Validation compares current fingerprints to stored
- Mismatch triggers cache invalidation

## API Surface

### Identity Adapter Interface

```typescript
interface UORIdentityAdapter {
  // Document identity
  computeDocumentUOR(source: SourceDoc): UORDocumentIdentity;
  
  // Chunk identity
  computeChunkUOR(parentDoc: UORDocumentIdentity, chunk: Chunk): UORChunkIdentity;
  
  // Semantic node identity
  computeNodeUOR(type: string, label: string, scope: string, sources: SourceAnchor[]): UORSemanticNodeIdentity;
  
  // Relation identity
  computeRelationUOR(type: string, source: string, target: string, scope: string): UORRelationIdentity;
  
  // Summary identity
  computeSummaryUOR(type: string, sources: string[], contentHash: string, scope: string): UORSummaryIdentity;
  
  // Verification
  verifyProvenance(uorId: string): ProvenanceVerification;
  
  // Migration
  migrateLegacy(legacyId: string, type: string): string; // returns uorId
}
```

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Canonical identity rules exist for documents | ✓ | Section 1 above |
| Canonical identity rules exist for chunks | ✓ | Section 2 above |
| Canonical identity rules exist for semantic nodes | ✓ | Section 3 above |
| Canonical identity rules exist for edges | ✓ | Section 4 above |
| Canonical identity rules exist for summaries | ✓ | Section 5 above |
| Migration plan preserves existing provenance | ✓ | Migration section above |
| Migration plan adds UOR-backed identifiers | ✓ | Migration section above |

## Next Steps

1. **Implementation**: Create `kernel/memory/uor-identity.ts` implementing the adapter interface
2. **Tests**: Add conformance tests for fingerprint determinism and provenance verification
3. **Integration**: Wire adapter into ingest pipeline for new documents
4. **Migration**: Batch process existing graph to add UOR IDs
5. **Cache Design**: Proceed to `task_victor_uor_cache_validation`

## References

- `2026-03-15-victor-memory-governance-architecture.md` - Target architecture
- `2026-03-15-victor-memory-governance-crosswalk.md` - Current vs target comparison
- `2026-03-17-uor-memory-grounding-integration-plan.md` - Integration plan
