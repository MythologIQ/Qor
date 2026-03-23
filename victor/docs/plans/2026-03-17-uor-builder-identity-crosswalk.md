---
title: Builder-to-UOR Identity Crosswalk
date: 2026-03-17
status: draft
agent_id: 8866a9e1-ad3d-420d-96a7-a37747d5a06e
task: task_builder_uor_identity_crosswalk
phase: phase_victor_uor_grounding
---

# Builder-to-UOR Identity Crosswalk

## Purpose

Map Builder Console project structure (projects, phases, tasks, ledger entries) to UOR identity concepts, enabling deterministic identity for Builder planning surfaces and cross-project references.

This crosswalk enables:
- Tracing Builder planning artifacts to UOR-backed identities
- Cross-project references with integrity verification
- Cache validation for Builder Console state
- Interoperability between Victor memory and Builder project state

## Builder Domain Concepts

### Core Identity-bearing Entities

| Builder Entity | Identity Purpose | Current Identifier | UOR Mapping |
|----------------|------------------|-------------------|-------------|
| **Project** | Top-level work container | `projectId` (slug) | `project:{projectId}` |
| **Phase** | Governed work stage | `phaseId` (UUID) | `phase:{projectId}:{phaseId}` |
| **Task** | Actionable work unit | `taskId` (UUID) | `task:{projectId}:{phaseId}:{taskId}` |
| **Ledger Entry** | Immutable audit record | `entryId` (timestamp + type) | `ledger:{projectId}:{entryId}` |
| **Builder Task** | Cross-project dependency | `taskId` + `projectId` scope | `builder:{projectId}:{taskId}` |

### Supporting Entities (Referenced but not Identity-bearing)

| Entity | Role | Reference Pattern |
|--------|------|--------------------|
| Forecast | Temporal projection | References project/phase |
| Risk Register | Risk inventory | References project/phase/task |
| Dependency | Cross-project link | References project + task |
| Queue Entry | Scheduled work | References project/phase/task |

## Crosswalk Matrix

### Project Identity

| UOR Design Concept | Builder Implementation | Status | Notes |
|-------------------|------------------------|--------|-------|
| sourceUrl | `Projects/continuous/{projectId}/` path | Implicit | Workspace directory path |
| contentHash | `phases.json` SHA256 | Needs implementation | File fingerprint for project state |
| canonicalScope | `project:{projectId}` | Proposed | Explicit UOR scope |
| ontologyType | `BuilderProject` | Proposed | Canonical ontology term |

**UOR ID Formula:**
```
uorId = sha256("project:{projectId}" + "|" + phasesJsonHash + "|" + "project:{projectId}" + "|" + "BuilderProject")
```

### Phase Identity

| UOR Design Concept | Builder Implementation | Status | Notes |
|-------------------|------------------------|--------|-------|
| sourceUrl | `{projectPath}/phases.json#phase:{phaseId}` | Implicit | JSON pointer to phase |
| contentHash | Phase content canonicalization | Needs implementation | Deterministic phase serialization |
| canonicalScope | `phase:{projectId}:{phaseId}` | Proposed | Explicit scope |
| ontologyType | `BuilderPhase` | Proposed | Canonical ontology term |

**UOR ID Formula:**
```
uorId = sha256("phase:{projectId}:{phaseId}" + "|" + canonicalPhaseHash + "|" + "phase:{projectId}:{phaseId}" + "|" + "BuilderPhase")
```

### Task Identity

| UOR Design Concept | Builder Implementation | Status | Notes |
|-------------------|------------------------|--------|-------|
| sourceUrl | `{projectPath}/phases.json#task:{taskId}` | Implicit | JSON pointer to task |
| contentHash | Task content canonicalization | Needs implementation | Deterministic task serialization |
| canonicalScope | `task:{projectId}:{phaseId}:{taskId}` | Proposed | Explicit scope |
| ontologyType | `BuilderTask` | Proposed | Canonical ontology term |

**UOR ID Formula:**
```
uorId = sha256("task:{projectId}:{phaseId}:{taskId}" + "|" + canonicalTaskHash + "|" + "task:{projectId}:{phaseId}:{taskId}" + "|" + "BuilderTask")
```

### Ledger Entry Identity

| UOR Design Concept | Builder Implementation | Status | Notes |
|-------------------|------------------------|--------|-------|
| sourceUrl | `{projectPath}/phases.json#ledger:{entryId}` | Implicit | JSON pointer to ledger entry |
| contentHash | Entry content canonicalization | Needs implementation | Deterministic entry serialization |
| canonicalScope | `ledger:{projectId}:{entryId}` | Proposed | Explicit scope |
| ontologyType | `BuilderLedgerEntry` | Proposed | Canonical ontology term |

**UOR ID Formula:**
```
uorId = sha256("ledger:{projectId}:{entryId}" + "|" + canonicalEntryHash + "|" + "ledger:{projectId}:{entryId}" + "|" + "BuilderLedgerEntry")
```

## Implementation Gap Analysis

### Gaps Requiring Code Changes

1. **Canonical Content Serialization** (HIGH PRIORITY)
   - **Location:** New module: `.qore/builder-uor.ts` (proposed)
   - **Gap:** Need deterministic JSON canonicalization for phases, tasks, ledger entries
   - **Solution:** Implement `canonicalizePhase()`, `canonicalizeTask()`, `canonicalizeLedgerEntry()` functions
   - **Requirements:**
     - Sort keys alphabetically
     - Normalize whitespace
     - Exclude volatile fields (updatedAt timestamps that change on every mutation)
     - Include stable fields (id, title, description, status, acceptance criteria)

2. **UOR ID Generation Functions** (HIGH PRIORITY)
   - **Location:** New module: `.qore/builder-uor.ts` (proposed)
   - **Gap:** No UOR ID generation for Builder entities
   - **Solution:** Implement builder-specific UOR identity factory
   - **Functions needed:**
     ```typescript
     createProjectUORId(projectId: string, phasesJsonHash: string): UORFingerprint
     createPhaseUORId(projectId: string, phaseId: string, canonicalPhaseHash: string): UORFingerprint
     createTaskUORId(projectId: string, phaseId: string, taskId: string, canonicalTaskHash: string): UORFingerprint
     createLedgerEntryUORId(projectId: string, entryId: string, canonicalEntryHash: string): UORFingerprint
     ```

3. **Ontology Type Mapping** (MEDIUM PRIORITY)
   - **Location:** New module: `.qore/builder-ontology.ts` (proposed)
   - **Gap:** No canonical ontology for Builder domain
   - **Solution:** Define Builder ontology terms extending Victor's
   - **Ontology terms:**
     - `BuilderProject` - Top-level work container
     - `BuilderPhase` - Governed work stage
     - `BuilderTask` - Actionable work unit
     - `BuilderLedgerEntry` - Immutable audit record
     - `BuilderForecast` - Temporal projection
     - `BuilderRisk` - Risk register entry

4. **Phases.json Fingerprinting** (MEDIUM PRIORITY)
   - **Location:** `.qore/projects/{projectId}/path/phases.json` handling
   - **Gap:** No fingerprint tracking for project state files
   - **Solution:** Add phases.json fingerprint to ledger or metadata
   - **Pattern:** Similar to Victor's document fingerprinting in `provenance.ts`

### Compatible Implementation (No Changes Needed)

1. **Project ID Structure** - Existing slug-based IDs are compatible with UOR sourceUrl
2. **UUID Generation** - Existing UUIDs for phases/tasks are stable identifiers
3. **Ledger Timestamp Pattern** - Timestamp-based ledger IDs are unique and ordered
4. **JSON Structure** - phases.json schema is compatible with deterministic serialization

## Migration Path

### Phase 1: Backward-Compatible UOR Addition

**Target:** Add UOR IDs to Builder entities without breaking existing lookups

**Files to create/modify:**
1. **New: `.qore/builder-uor.ts`**
   ```typescript
   // UOR identity factory for Builder domain
   export function createProjectUORId(projectId: string, phasesJsonHash: string): UORFingerprint
   export function createPhaseUORId(projectId: string, phase: Phase): UORFingerprint
   export function createTaskUORId(projectId: string, phaseId: string, task: Task): UORFingerprint
   export function canonicalizePhase(phase: Phase): string
   export function canonicalizeTask(task: Task): string
   ```

2. **New: `.qore/builder-ontology.ts`**
   ```typescript
   // Canonical ontology terms for Builder domain
   export type BuilderOntologyType = 
     | 'BuilderProject'
     | 'BuilderPhase'
     | 'BuilderTask'
     | 'BuilderLedgerEntry'
     | 'BuilderForecast'
     | 'BuilderRisk'
   ```

3. **Modify: phases.json structure (optional)**
   - Add optional `uorId` field to phases, tasks, ledger entries
   - Keep existing `id` fields for backward compatibility

### Phase 2: UOR-Native Identity

**Target:** Make UOR IDs primary for cross-project references

**Changes:**
1. Cross-project dependency references use UOR IDs
2. Cache validation uses UOR fingerprints
3. Interop envelopes use Builder UOR identities

### Phase 3: Full Ontology Integration

**Target:** Complete ontology-backed type system for Builder

**Changes:**
1. All Builder entities have ontology type classification
2. Governance metadata references ontology terms
3. Victor/Builder interop uses shared ontology

## Integration with Victor UOR System

### Shared Components

| Component | Victor Location | Builder Location | Shared? |
|-----------|---------------|------------------|---------|
| UORFingerprint type | `kernel/memory/types.ts` | Re-export or duplicate | Should share |
| UORIdentity interface | `kernel/memory/types.ts` | Re-export or duplicate | Should share |
| GovernanceMetadata | `kernel/memory/types.ts` | Import from Victor | Share via import |
| SHA256 utility | `kernel/memory/uor-interop.ts` | Import or duplicate | Share via import |

### Interop Boundary

Builder Console (in Zo-Qore) and Victor (separate project) need clean interop:

```typescript
// Cross-project reference example
interface CrossProjectReference {
  sourceProject: 'victor-resident' | 'builder-console' | string
  sourceUorId: UORFingerprint
  targetProject: string
  targetUorId: UORFingerprint
  referenceType: 'depends-on' | 'blocks' | 'supports' | 'relates-to'
  governance: GovernanceMetadata
}
```

## Verification Checklist

- [ ] Canonical content serialization produces deterministic output
- [ ] UOR ID generation functions exist for all Builder entity types
- [ ] Ontology type mapping covers all Builder domain concepts
- [ ] Phases.json fingerprinting is implemented
- [ ] Cross-project references can use UOR IDs
- [ ] Victor UOR types are imported/reused where applicable
- [ ] No regression in existing Builder Console functionality
- [ ] Integration tests verify round-trip UOR ID generation

## File References

### Primary Implementation Targets
- **New:** `.qore/builder-uor.ts` - UOR identity factory for Builder domain
- **New:** `.qore/builder-ontology.ts` - Builder ontology definitions
- **New:** `.qore/builder-uor.test.ts` - Unit tests for UOR functions

### Supporting Files
- `Projects/continuous/Zo-Qore/.qore/projects/victor-resident/path/phases.json` - Example project state
- `Projects/continuous/Victor/kernel/memory/types.ts` - UOR type definitions
- `Projects/continuous/Victor/kernel/memory/uor-interop.ts` - UOR utility functions

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Project identity rules mapped to UOR | ✓ | Documented mapping with formula |
| Phase identity rules mapped to UOR | ✓ | Documented mapping with formula |
| Task identity rules mapped to UOR | ✓ | Documented mapping with formula |
| Ledger entry identity rules mapped to UOR | ✓ | Documented mapping with formula |
| Implementation gaps identified with priority | ✓ | Gap analysis with HIGH/MEDIUM/LOW priorities |
| Victor/Builder interop boundary defined | ✓ | Cross-project reference interface proposed |
| Verification checklist defined | ✓ | Checklist with 8 verification items |

## Next Required Slices

1. **Implement Builder UOR Identity Factory** (HIGH PRIORITY)
   - Target: `.qore/builder-uor.ts`
   - Deliverable: `createProjectUORId()`, `createPhaseUORId()`, `createTaskUORId()` functions with tests

2. **Implement Builder Ontology Definitions** (HIGH PRIORITY)
   - Target: `.qore/builder-ontology.ts`
   - Deliverable: Builder ontology types and mapping functions

3. **Begin Builder Cache Contract Design** (MEDIUM PRIORITY)
   - Target: `task_builder_uor_cache_contract`
   - Deliverable: Builder-side cache validation contract using UOR fingerprints

---
**End of Builder-to-UOR Identity Crosswalk Document**
