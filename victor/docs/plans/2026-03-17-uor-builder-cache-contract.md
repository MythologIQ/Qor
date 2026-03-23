---
title: UOR Builder Cache Validation Contract
date: 2026-03-17
status: draft
agent_id: 8866a9e1-ad3d-420d-96a7-a37747d5a06e
task: task_builder_uor_cache_contract
phase: phase_victor_uor_grounding
---

# UOR Builder Cache Validation Contract

## Purpose

Define deterministic cache validation and invalidation rules for Builder Console project state using UOR fingerprints, ensuring cached project data fails closed when underlying sources change.

This contract extends the Victor UOR Cache Validation Design to the Builder Console project surface, enabling cross-project cache consistency and shared validation logic.

## Core Thesis

> Builder project state is a cache of the ground truth in phases.json. UOR fingerprints let us verify that cache.

When Builder loads project state, phase definitions, task queues, or ledger entries, it makes implicit claims about the current state of the phases.json source. Without validation, these claims become stale silently when phases.json is modified externally. With UOR-backed validation, stale Builder state is detected and reconciled before it contaminates downstream reasoning.

## Design Principles

1. **Fingerprint-Anchored Dependencies**: Every cached Builder entity names the UOR fingerprint of its source data
2. **Deterministic Invalidation**: Cache validation compares stored fingerprints to current phases.json state, not timestamps
3. **Fail-Closed**: When validation fails, Builder state is reloaded from source rather than using stale data
4. **Auditable Validation**: Each validation produces a record with the comparison outcome
5. **Lazy Validation**: Validation occurs at read time, not on every phases.json change

## Builder Cache Entry Types

### Type 1: Project State Cache
**Purpose**: Cached project metadata to avoid re-reading phases.json headers

**Dependency Structure**:
```typescript
interface BuilderProjectCacheDeps {
  type: 'builder-project';
  projectId: string;                    // Builder project identifier
  projectUorId: string;                  // UOR ID of the project definition
  phasesFingerprint: string;           // Fingerprint of the phases array
  ledgerFingerprint: string;             // Fingerprint of the ledger array
  builderTasksFingerprint: string;       // Fingerprint of builderTasks object
  sourcePath: string;                    // Path to phases.json file
  cachedAt: string;                     // ISO timestamp (advisory only)
}
```

**Validation Rules**:
1. Read current phases.json from `sourcePath`
2. Compute fingerprints of phases array, ledger array, and builderTasks object
3. Compare to stored fingerprints
4. All match → cache valid; Any mismatch → cache stale
5. File stat changes without content change → advisory warning only

**Failure Mode**: FAIL-CLOSED (stale cache discarded, full re-read from phases.json)

---

### Type 2: Phase Definition Cache
**Purpose**: Cached phase definitions for quick access without parsing full phases.json

**Dependency Structure**:
```typescript
interface BuilderPhaseCacheDeps {
  type: 'builder-phase';
  phaseId: string;                       // Phase identifier
  phaseUorId: string;                   // UOR ID of this phase definition
  projectUorId: string;                 // Parent project UOR ID
  tasksFingerprint: string;           // Fingerprint of the tasks array
  statusFingerprint: string;            // Fingerprint of status field
  objectiveFingerprint: string;         // Fingerprint of objective text
  sourceClusterIdsFingerprint: string;  // Fingerprint of source cluster IDs
  createdAt: string;                    // Phase creation timestamp
  updatedAt: string;                   // Phase last update timestamp
}
```

**Validation Rules**:
1. Validate parent project first (Type 1 validation)
2. If project stale → all phase caches stale
3. Locate phase in current phases.json by phaseId
4. If phase not found → cache entry orphaned, mark stale
5. Compute fingerprints of tasks, status, objective, sourceClusterIds
6. Compare to stored fingerprints
7. All match → cache valid; Any mismatch → cache stale

**Failure Mode**: FAIL-CLOSED (stale phase cache discarded, re-extracted from phases.json)

---

### Type 3: Task Definition Cache
**Purpose**: Cached task definitions for progress tracking and forecasting

**Dependency Structure**:
```typescript
interface BuilderTaskCacheDeps {
  type: 'builder-task';
  taskId: string;                       // Task identifier
  taskUorId: string;                    // UOR ID of this task definition
  phaseUorId: string;                  // Parent phase UOR ID
  titleFingerprint: string;           // Fingerprint of task title
  descriptionFingerprint: string;     // Fingerprint of task description
  acceptanceFingerprint: string;      // Fingerprint of acceptance criteria
  status: 'pending' | 'in-progress' | 'done';
  statusFingerprint: string;          // Fingerprint of status field
  updatedAt: string;                   // Last status change timestamp
}
```

**Validation Rules**:
1. Validate parent phase first (Type 2 validation)
2. If phase stale → all task caches in phase stale
3. Locate task in current phase by taskId
4. If task not found → cache entry orphaned, mark stale
5. Compute fingerprints of title, description, acceptance criteria, status
6. Compare to stored fingerprints
7. Title/description/acceptance mismatch → task changed, cache stale
8. Status mismatch → status changed, update cache status (not stale, just updated)

**Failure Mode**: CONTEXTUAL (content changes trigger reload, status changes trigger update)

---

### Type 4: Ledger Entry Cache
**Purpose**: Cached ledger entries for governance audit trails

**Dependency Structure**:
```typescript
interface BuilderLedgerCacheDeps {
  type: 'builder-ledger';
  entryId: string;                      // Ledger entry identifier
  entryUorId: string;                  // UOR ID of this ledger entry
  projectUorId: string;                // Parent project UOR ID
  entryType: 'authorization' | 'reset' | 'productive_progress' | 'heartbeat';
  timestamp: string;                   // Entry timestamp
  deliverablesFingerprint: string;     // Fingerprint of deliverables array
  statusFingerprint: string;           // Fingerprint of status field
  heartbeatId?: string;               // Associated heartbeat agent ID
  scope?: string;                     // Entry scope
  immutable: boolean;                 // Ledger entries are immutable once written
}
```

**Validation Rules**:
1. Validate parent project first (Type 1 validation)
2. Locate entry in current ledger by entryId
3. If entry not found → possible data loss, log warning
4. Compute fingerprints of deliverables and status
5. Compare to stored fingerprints
6. Ledger entries should be immutable; any mismatch indicates data corruption

**Failure Mode**: FAIL-CLOSED with CORRUPTION ALERT (ledger entry mismatch indicates data integrity issue)

---

### Type 5: Builder Task Queue Cache
**Purpose**: Cached consolidated task queue across all Builder projects

**Dependency Structure**:
```typescript
interface BuilderTaskQueueCacheDeps {
  type: 'builder-task-queue';
  queueUorId: string;                  // UOR ID of this task queue snapshot
  projectFingerprints: string[];      // Fingerprints of all included projects
  pendingCount: number;                // Count of pending tasks at snapshot
  inProgressCount: number;            // Count of in-progress tasks at snapshot
  doneCount: number;                 // Count of done tasks at snapshot
  taskFingerprints: string[];        // Fingerprints of individual task definitions
  snapshotAt: string;                // ISO timestamp of snapshot
  ttlSeconds: number;                // Maximum cache lifetime (safety bound)
}
```

**Validation Rules**:
1. Check if `ttlSeconds` exceeded (hard time bound for safety)
2. Validate each included project using Type 1 validation
3. Any project stale → full queue re-consolidation required
4. Compute fingerprints of all current tasks in queue
5. Compare to stored task fingerprints
6. Any task fingerprint mismatch → task changed, full re-consolidation

**Failure Mode**: DEGRADED with RECONCILIATION (stale queue can be used with warning, but reconciliation triggered)

## UOR ID Formulas for Builder Entities

### Project UOR ID
```
projectUorId = sha256(
  "builder:project:" +
  projectId + "|" +
  canonicalProjectName + "|" +
  projectPath
)
```

### Phase UOR ID
```
phaseUorId = sha256(
  "builder:phase:" +
  phaseId + "|" +
  projectUorId + "|" +
  canonicalPhaseName + "|" +
  ordinal
)
```

### Task UOR ID
```
taskUorId = sha256(
  "builder:task:" +
  taskId + "|" +
  phaseUorId + "|" +
  canonicalTaskTitle
)
```

### Ledger Entry UOR ID
```
entryUorId = sha256(
  "builder:ledger:" +
  entryId + "|" +
  projectUorId + "|" +
  entryType + "|" +
  timestamp
)
```

## Validation Orchestration

### Builder Cache Validation Coordinator

```typescript
interface BuilderCacheValidationCoordinator {
  // Main entry point for cache validation
  validate<T extends BuilderCacheEntry>(
    entry: T,
    depth: 'shallow' | 'deep'
  ): Promise<BuilderValidationResult<T>>;

  // Batch validation for project state
  validateProjectState(
    projectId: string,
    cachedState: BuilderProjectState
  ): Promise<ProjectValidationResult>;

  // Reconciliation for stale caches
  reconcileStaleCache(
    staleEntry: BuilderCacheEntry,
    currentSource: unknown
  ): Promise<ReconciliationResult>;
}
```

### Validation Result Structure

```typescript
interface BuilderValidationResult<T> {
  entry: T;
  status: 'valid' | 'stale' | 'corrupted' | 'orphaned' | 'error';
  checkedAt: string;                    // ISO timestamp
  checkedDependencies: {
    dependencyType: BuilderCacheEntryType;
    storedFingerprint: string;
    currentFingerprint: string;
    match: boolean;
  }[];
  staleDependencies: string[];         // UOR IDs of stale deps
  orphanedDependencies: string[];      // UOR IDs not found in source
  recommendedAction: 'use' | 'reload' | 'reconcile' | 'alert' | 'discard';
  degradationNotes?: string[];          // Human-readable explanation
  corruptionAlert?: boolean;            // True if data integrity issue detected
}
```

## Fingerprint Computation

### Canonical Content Serialization

For deterministic fingerprinting, Builder entities must be serialized canonically:

1. **JSON Serialization**: Use stable JSON stringify (sorted keys)
2. **String Encoding**: UTF-8 without BOM
3. **Hash Algorithm**: SHA-256 with lowercase hex encoding
4. **Delimiter**: Pipe character `|` for composite fingerprints
5. **Null Handling**: Omit null/undefined fields from serialization

### Fingerprint Formulas by Type

**Project State Fingerprint:**
```
phasesFingerprint = sha256(stableStringify(phasesArray))
ledgerFingerprint = sha256(stableStringify(ledgerArray))
builderTasksFingerprint = sha256(stableStringify(builderTasks))
```

**Phase Fingerprint:**
```
tasksFingerprint = sha256(stableStringify(tasks))
statusFingerprint = sha256(phase.status)
objectiveFingerprint = sha256(phase.objective)
```

**Task Fingerprint:**
```
titleFingerprint = sha256(task.title)
descriptionFingerprint = sha256(task.description)
acceptanceFingerprint = sha256(stableStringify(task.acceptance))
statusFingerprint = sha256(task.status)
```

**Ledger Entry Fingerprint:**
```
deliverablesFingerprint = sha256(stableStringify(entry.deliverables))
statusFingerprint = sha256(entry.status)
```

## Integration with Victor UOR System

### Shared Components

| Component | Victor Path | Builder Path | Shared Interface |
|-----------|-------------|--------------|------------------|
| UOR Fingerprint | `kernel/memory/uor-interop.ts` | `builder/uor-fingerprint.ts` | `computeUORFingerprint()` |
| Canonical JSON | `kernel/memory/uor-interop.ts` | `builder/uor-serialization.ts` | `stableStringify()` |
| Validation Result | `kernel/memory/types.ts` | `builder/types.ts` | `ValidationResult<T>` |

### Cross-Project Validation

When Victor references Builder state or Builder references Victor memory:

1. **Victor → Builder**: Victor uses `UORGraphReference` with `kind: 'builder-project'` to reference Builder state
2. **Builder → Victor**: Builder uses `UORGraphReference` with `kind: 'semantic-node'` to reference Victor memory
3. **Validation**: Both systems use the same `computeUORFingerprint()` for cross-project verification

### Cache Consistency

Builder and Victor cache validation should produce consistent results for shared entities:

```typescript
// Cross-project cache validation
interface CrossProjectCacheValidation {
  victorReference: UORGraphReference;
  builderReference: BuilderCacheReference;
  consistent: boolean;               // True if both views agree on entity state
  divergenceNote?: string;          // Explanation if views diverge
}
```

## Migration Path

### Phase 1: Fingerprint Tracking Addition (Current)

Add UOR fingerprint computation to Builder state loading without breaking current behavior:

1. Modify Builder project state loading to compute UOR fingerprints
2. Store fingerprints alongside existing cached data
3. Validation runs in shadow mode (logged but not blocking)
4. All existing Builder functionality preserved

**Target Files:**
- `builder/project-loader.ts` - Add fingerprint computation
- `builder/cache.ts` - Add fingerprint storage

### Phase 2: Validation Logic Implementation

Implement validation coordinator and per-type validation rules:

1. Create `BuilderCacheValidationCoordinator` implementation
2. Add validation triggers to Builder state read paths
3. Log validation results without changing cache behavior
4. Collect metrics on cache hit/stale rates

**Target Files:**
- `builder/validation-coordinator.ts` - New file
- `builder/project-loader.ts` - Add validation calls

### Phase 3: Fail-Closed Activation

Enable actual fail-closed behavior based on validation results:

1. Promote UOR validation to primary cache validity check
2. Demote timestamp-based checks to advisory only
3. Activate stale cache reloading for grounded queries
4. Add cache reconciliation UI in Builder shell

**Target Files:**
- `builder/cache.ts` - Enable fail-closed
- `builder/shell.tsx` - Add cache status indicators

### Phase 4: Policy Externalization

Move validation rules to external policy file:

1. Create `builder-cache-validation-policy.json`
2. Load policy at runtime
3. Version policy separately from code
4. Support per-project policy overrides

**Target Files:**
- `config/builder-cache-validation-policy.json` - New file
- `builder/policy-loader.ts` - New file

## Verification Checklist

- [ ] All five cache entry types have defined dependency structures
- [ ] UOR ID formulas are explicit for all Builder entity types
- [ ] Fingerprint computation is deterministic and testable
- [ ] Validation rules are deterministic (no randomness, no time-based primary checks)
- [ ] Fail-closed behavior is explicit for each entry type
- [ ] Validation results include full dependency chain for audit
- [ ] Integration points with Victor UOR system are specified
- [ ] Four-phase migration path preserves backward compatibility
- [ ] Policy configuration structure supports future rule changes
- [ ] Cross-project validation interface is defined

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Cache dependency metadata names UOR fingerprints | ✓ | Dependency structures for all 5 cache types include UOR IDs and fingerprints |
| UOR ID formulas are explicit for all entity types | ✓ | Project, phase, task, and ledger entry UOR ID formulas documented |
| Invalidation rules are deterministic | ✓ | All validation rules compare fingerprints, not timestamps (except safety TTL) |
| Invalidation rules are testable | ✓ | Validation results include full comparison data; rules are explicit and stateless |
| Fail-closed behavior is explicit | ✓ | Each cache type has explicit failure mode (fail-closed, contextual, degraded) |
| Integration with Victor UOR is specified | ✓ | Shared components and cross-project validation interface defined |
| Migration path preserves existing behavior | ✓ | Four-phase migration with shadow mode before activation |
| Builder/Victor interop boundary is defined | ✓ | Cross-project reference types and validation interface specified |

## Implementation Targets

| Design Component | Target File | Migration Phase |
|-----------------|-------------|-----------------|
| Fingerprint computation | `builder/uor-fingerprint.ts` (new) | Phase 1 |
| Canonical serialization | `builder/uor-serialization.ts` (new) | Phase 1 |
| Dependency structures | `builder/types.ts` | Phase 1 |
| Validation coordinator | `builder/validation-coordinator.ts` (new) | Phase 2 |
| Project state validation | `builder/project-loader.ts` | Phase 2 |
| Cache fail-closed logic | `builder/cache.ts` | Phase 3 |
| Policy loader | `builder/policy-loader.ts` (new) | Phase 4 |
| Cache policy JSON | `config/builder-cache-validation-policy.json` | Phase 4 |

## Relation to Other UOR Tasks

- **task_victor_uor_cache_validation**: This contract extends the Victor cache validation design to Builder Console
- **task_builder_uor_identity_crosswalk**: Uses the UOR ID formulas defined in the identity crosswalk
- **task_builder_uor_interop_contract**: Cache validation results will be part of the Builder/Victor interchange envelope
- **task_victor_uor_interop_contracts**: Builder uses the same `UORInterchangeEnvelope` format for cross-project references

## Next Required Slices

1. **Implement Builder Fingerprint Utilities** (HIGH PRIORITY)
   - Target: `builder/uor-fingerprint.ts`, `builder/uor-serialization.ts`
   - Deliverable: TypeScript utilities for UOR fingerprint computation and canonical JSON serialization

2. **Create Builder Cache Policy File** (MEDIUM PRIORITY)
   - Target: `config/builder-cache-validation-policy.json`
   - Deliverable: JSON policy with thresholds and validation rules

3. **Begin Builder Interop Contract** (MEDIUM PRIORITY)
   - Target: `task_builder_uor_interop_contract`
   - Deliverable: Interchange envelope specification for Builder/Victor cross-project references

---
**End of Builder Cache Contract Document**
**Word Count:** ~2,100 words
**Deliverable for:** task_builder_uor_cache_contract
**Productive Tick:** 6/50
