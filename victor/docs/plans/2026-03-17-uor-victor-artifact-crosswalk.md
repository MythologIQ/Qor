---
title: UOR-to-Victor Artifact Crosswalk
date: 2026-03-17
status: draft
agent_id: 8866a9e1-ad3d-420d-96a7-a37747d5a06e
task: task_victor_uor_identity_adapter
phase: phase_victor_uor_grounding
---

# UOR-to-Victor Artifact Crosswalk

## Purpose

Map the UOR Identity Adapter Design concepts to actual Victor kernel/memory implementation files, providing a governed reference for integration work.

This crosswalk enables:
- Tracing identity requirements to implementation locations
- Verification that design concepts are materialized in code
- Migration planning from current state to UOR-backed identity

## Crosswalk Matrix

| UOR Design Concept | Design Section | Victor Implementation File | Implementation Status | Migration Notes |
|-------------------|----------------|---------------------------|----------------------|-----------------|
| **Document Identity** | §1 Document Identity | `kernel/memory/provenance.ts` | Partial - needs UOR scope integration | `hashContent()` creates fingerprints; needs canonicalScope and ontologyType parameters |
| Content Hash Algorithm | §1 Fingerprint Algorithm | `kernel/memory/provenance.ts:7-14` | Present - SHA256 with newline delimiter | Compatible with UOR fingerprint base |
| Source Document Record | §1 UORDocumentIdentity | `kernel/memory/provenance.ts:40-54` | Partial - has fingerprint, needs uorId | Current `id` is hash of projectId+path; needs migration to uorId format |
| Document Ontology Type | §1 ontologyType | `kernel/memory/provenance.ts:16-29` | Partial - `inferContentType()` exists | Needs mapping to canonical ontology terms (Document, CodeFile, Conversation, Artifact) |
| **Chunk Identity** | §2 Chunk Identity | `kernel/memory/chunking.ts` | Partial - needs UOR parent anchoring | Chunks have ids but not UOR-derived from parent |
| Parent Document Reference | §2 parentDocUorId | `kernel/memory/ingest.ts:17-25` | Partial - `document.id` used, not uorId | Ingestion plan connects chunks to document |
| Chunk Span | §2 span | `kernel/memory/types.ts:36-41` | Present - `SourceSpan` with line/offset | Compatible with UOR span requirements |
| **Semantic Node Identity** | §3 Semantic Node Identity | `kernel/memory/neo4j-store.ts` | Partial - needs canonical label normalization | Nodes stored with ids, ontology type, and governance state |
| Ontology Type | §3 ontologyType | `kernel/memory/types.ts:55-61` | Partial - `EpistemicType` exists | Needs mapping to canonical ontology (Concept, Entity, Decision, Constraint) |
| Governance State | §1-3 governance.state | `kernel/memory/types.ts:48-54` | Present - `GovernanceState` enum | States match: ephemeral, provisional, durable, contested, stale, deprecated, rejected |
| Epistemic Type | §1-3 governance.epistemicType | `kernel/memory/types.ts:55-61` | Present - `EpistemicType` enum | Types align: observation, source-claim, inferred-relation, synthesis, conjecture, policy-ruling |
| Confidence Profile | §1-3 governance.confidence | `kernel/memory/types.ts:63-68` | Present - `ConfidenceProfile` | Four dimensions: extraction, grounding, crossSource, operational |
| Governance Metadata | §1-3 governance | `kernel/memory/governance.ts` | Present - `createGovernanceMetadata()` | Factory function creates governance metadata with all required fields |
| Policy Version | §1-3 governance.policyVersion | `kernel/memory/governance.ts`, `kernel/memory/types.ts:69-76` | Present | Hardcoded to 'v1' currently; needs policy file reference |
| **Provenance Chain** | §1-3 sourceAnchor | `kernel/memory/provenance.ts:44-48` | Partial - source document has path, fingerprint | Needs explicit UOR source anchor structure |
| **Ingestion Run** | Migration Plan | `kernel/memory/ingest.ts:56-72` | Present - `IngestionPlan` with governance | Run has id, documentId, fingerprint, governance metadata |
| Cache Dependency | Cache Validation | `kernel/memory/cache.ts`, `kernel/memory/types.ts` | Present - `CacheDependencyRef` | Foundation for UOR-driven cache validation |
| **Storage Schema** | All sections | `kernel/memory/neo4j-store.ts:18-45` | Present - constraints and indexes | SourceDocument, SourceChunk, SemanticNode, SemanticEdge have unique id constraints |
| Neo4j Driver | Storage | `kernel/memory/neo4j-store.ts:47-94` | Present - `Neo4jLearningStore` | Implements LearningStore interface with full CRUD |

## Implementation Gap Analysis

### Gaps Requiring Code Changes

1. **UOR ID Generation** (HIGH PRIORITY)
   - **Location:** `kernel/memory/provenance.ts`
   - **Gap:** Current `hashContent()` creates simple fingerprints; UOR requires structured `uorId = sha256(sourceUrl + "|" + contentHash + "|" + canonicalScope + "|" + ontologyType)`
   - **Migration:** Add `createUORDocumentId()`, `createUORChunkId()` functions

2. **Canonical Ontology Mapping** (MEDIUM PRIORITY)
   - **Location:** `kernel/memory/provenance.ts:16-29` (content type inference)
   - **Gap:** `inferContentType()` returns MIME types; UOR requires canonical ontology types (Document, CodeFile, Conversation, Artifact)
   - **Migration:** Add `inferOntologyType()` mapping MIME types to ontology terms

3. **Canonical Label Normalization** (MEDIUM PRIORITY)
   - **Location:** `kernel/memory/semantic-extract.ts` (assumed, not yet verified)
   - **Gap:** Semantic node labels need normalization for UOR identity
   - **Migration:** Add label normalization utility

4. **Policy Version Externalization** (LOW PRIORITY)
   - **Location:** `kernel/memory/governance.ts`
   - **Gap:** `policyVersion` is hardcoded to 'v1'
   - **Migration:** Reference external policy file `memory-governance-policy.json`

### Compatible Implementation (No Changes Needed)

1. **Governance Metadata Structure** - `types.ts` already has all required fields
2. **Confidence Profiles** - Four-dimensional confidence already implemented
3. **Governance States** - All UOR states (provisional, durable, contested, deprecated) present
4. **Storage Schema** - Neo4j constraints ensure unique identities
5. **Provenance Anchors** - Document path and fingerprint structure compatible

## Migration Path

### Phase 1: Backward-Compatible UOR ID Addition (Current → UOR-ready)

**Target:** Add UOR IDs without breaking existing identities

**Files to modify:**
1. `kernel/memory/provenance.ts`
   - Add `createUORDocumentId()` function
   - Add `createUORChunkId()` function
   - Keep existing `id` field for backward compatibility
   - Add new `uorId` field

2. `kernel/memory/types.ts`
   - Add `uorId` to `SourceDocumentRecord`
   - Add `uorId` to `SourceChunkRecord`
   - Add `parentDocUorId` to `SourceChunkRecord`

3. `kernel/memory/ingest.ts`
   - Update `planArtifactIngestion()` to populate uorId fields
   - Ensure ingestion run references UOR IDs

### Phase 2: UOR-Native Identity (UOR-ready → UOR-native)

**Target:** Make UOR IDs primary, deprecate legacy IDs

**Files to modify:**
1. `kernel/memory/neo4j-store.ts`
   - Add UOR ID constraints alongside existing constraints
   - Update MERGE statements to use uorId for node identification

2. Migration script
   - Backfill uorId for existing documents/chunks
   - Validate no collisions
   - Tombstone legacy records that cannot migrate

### Phase 3: Canonical Ontology Integration

**Target:** Full ontology-backed type system

**Files to modify:**
1. `kernel/memory/provenance.ts`
   - Replace/in augment `inferContentType()` with `inferOntologyType()`

2. New file: `kernel/memory/ontology.ts`
   - Define canonical ontology terms
   - Provide type validation utilities

## Verification Checklist

- [ ] UOR ID generation functions exist and produce deterministic outputs
- [ ] Document records contain both legacy `id` and new `uorId`
- [ ] Chunk records reference parent document by `uorId`
- [ ] Ontology types are canonical (not MIME types)
- [ ] Governance metadata includes all UOR-required fields
- [ ] Neo4j constraints enforce UOR ID uniqueness
- [ ] Migration script can backfill existing records
- [ ] No regression in existing retrieval functionality

## File References

### Primary Implementation Files
- `kernel/memory/provenance.ts` - Document/chunk identity and fingerprinting
- `kernel/memory/chunking.ts` - Document chunking strategy
- `kernel/memory/ingest.ts` - Ingestion planning and artifact creation
- `kernel/memory/neo4j-store.ts` - Graph storage implementation
- `kernel/memory/types.ts` - TypeScript type definitions
- `kernel/memory/governance.ts` - Governance metadata creation

### Supporting Files
- `kernel/memory/cache.ts` - Cache dependency tracking
- `kernel/memory/semantic-extract.ts` - Semantic graph extraction (assumed location)
- `kernel/memory/memory-governance-policy.json` - Policy configuration

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Canonical identity rules for documents mapped to code | ✓ | Documented mapping to `provenance.ts` |
| Canonical identity rules for chunks mapped to code | ✓ | Documented mapping to `chunking.ts`, `ingest.ts` |
| Canonical identity rules for semantic nodes mapped to code | ✓ | Documented mapping to `neo4j-store.ts` |
| Migration path from existing provenance documented | ✓ | Three-phase migration plan documented |
| Implementation gaps identified with priority | ✓ | Gap analysis with HIGH/MEDIUM/LOW priorities |
| Verification checklist defined | ✓ | Checklist with 8 verification items |

## Next Required Slices

1. **Implement UOR ID Generation Functions** (HIGH PRIORITY)
   - Target: `kernel/memory/provenance.ts`
   - Deliverable: `createUORDocumentId()`, `createUORChunkId()` functions with tests

2. **Update Type Definitions** (HIGH PRIORITY)
   - Target: `kernel/memory/types.ts`
   - Deliverable: uorId fields added to SourceDocumentRecord, SourceChunkRecord

3. **Begin Cache Validation Design** (MEDIUM PRIORITY)
   - Target: `task_victor_uor_cache_validation`
   - Deliverable: Cache validation contract design document

---
**End of Crosswalk Document**
