# Builder UOR Interoperability Contract

**Date:** 2026-03-17  
**Status:** design-complete  
**Phase:** UOR Grounded Memory Integration (Phase 4)  
**Task:** `task_builder_uor_interop_contract`  
**Author:** Victor Governance Agent (Agent ID: 8866a9e1-ad3d-420d-96a7-a37747d5a06e)

---

## Purpose

Define the canonical interchange envelope and cross-project reference contract that Builder Console and Victor use when exchanging grounded memory references, project state, and governance claims. This contract enables deterministic interoperability between Builder's project planning surface and Victor's memory kernel while preserving governance boundaries.

---

## Core Principle

> Cross-project references must carry UOR-backed identity, provenance chains, and dereference rules so that claims exchanged between Builder and Victor remain verifiable and fail-closed when dependencies drift.

---

## Contract Types

### 1. CrossProjectReference

**Purpose:** Reference from Builder project state to Victor memory artifacts.

**Structure:**
```typescript
interface CrossProjectReference {
  refType: 'victor-memory' | 'victor-cache' | 'victor-claim';
  uorIdentity: UORIdentity;
  sourceContext: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
    ledgerEntryId?: string;
  };
  dereferenceRules: {
    requiredConfidence: number;
    allowStale: boolean;
    fallbackBehavior: 'fail' | 'warn' | 'ignore';
    maxAgeMs?: number;
  };
}
```

**UOR ID Formula:**
```
cross_project_ref_uor_id = sha256(
  "crossref" + "|" +
  sourceProjectId + "|" +
  sourceEntityType + "|" +
  sourceEntityId + "|" +
  targetRefType + "|" +
  targetUorId + "|" +
  canonicalTimestamp
)
```

**Validation Rules:**
- **Fail-closed:** Missing UOR identity → validation fails
- **Fail-closed:** Target artifact not found in Victor → dereference fails
- **Contextual:** `allowStale=false` + stale artifact → dereference fails with StaleDependencyError
- **Governance:** Cross-project references require `governance.authorization='cross-project'`

---

### 2. BuilderStateEnvelope

**Purpose:** Export Builder project state for Victor consumption with full provenance.

**Structure:**
```typescript
interface BuilderStateEnvelope {
  envelopeId: string;                    // UOR ID of this envelope
  version: 'builder-uor-v1';
  exportedAt: string;                    // ISO timestamp
  sourceProject: {
    projectId: string;
    projectUorId: string;
    phases: PhaseSnapshot[];
    tasks: TaskSnapshot[];
    ledger: LedgerEntrySnapshot[];
  };
  crossProjectRefs: CrossProjectReference[];
  governance: {
    exportedBy: string;                  // Agent ID
    authorization: 'project-export';
    confidenceProfile: ConfidenceProfile;
  };
  uorFingerprint: string;                // SHA256 of canonical JSON
}

interface PhaseSnapshot {
  phaseId: string;
  phaseUorId: string;
  ordinal: number;
  name: string;
  objective: string;
  status: string;
  taskIds: string[];
}

interface TaskSnapshot {
  taskId: string;
  taskUorId: string;
  phaseId: string;
  title: string;
  description: string;
  status: string;
  acceptance: string[];
}

interface LedgerEntrySnapshot {
  entryId: string;
  entryUorId: string;
  type: string;
  timestamp: string;
  description: string;
  taskId?: string;
}
```

**UOR ID Formula (Envelope):**
```
envelope_uor_id = sha256(
  "builder-envelope" + "|" +
  sourceProjectId + "|" +
  exportTimestamp + "|" +
  contentFingerprint
)

contentFingerprint = sha256(
  canonical(phases) + "|" +
  canonical(tasks) + "|" +
  canonical(ledger)
)
```

**Canonical Content Serialization:**
- Phases sorted by ordinal
- Tasks sorted by phaseId, then taskId
- Ledger sorted by timestamp
- All whitespace normalized
- Field order: id, name, status, metadata

**Validation Rules:**
- **Fail-closed:** Fingerprint mismatch → envelope rejected
- **Fail-closed:** Missing `sourceProject.projectUorId` → export fails
- **Contextual:** Stale envelope (>24h) → re-export required before consumption
- **Audit:** All exports logged in Builder ledger with `type: 'project-export'`

---

### 3. VictorMemoryEnvelope

**Purpose:** Export Victor memory artifacts for Builder consumption with grounded references.

**Structure:**
```typescript
interface VictorMemoryEnvelope {
  envelopeId: string;
  version: 'victor-uor-v1';
  exportedAt: string;
  sourceContext: {
    agentId: string;
    sessionId: string;
    tier: number;
  };
  artifacts: {
    documents: DocumentReference[];
    semanticNodes: SemanticNodeReference[];
    cacheEntries: CacheEntryReference[];
    claims: ClaimReference[];
  };
  crossProjectRefs: CrossProjectReference[];
  governance: {
    exportedBy: string;
    authorization: 'memory-export';
    confidenceProfile: ConfidenceProfile;
  };
  uorFingerprint: string;
}

interface DocumentReference {
  docId: string;
  uorId: string;
  sourceUrl: string;
  contentHash: string;
  ingestionTimestamp: string;
}

interface SemanticNodeReference {
  nodeId: string;
  uorId: string;
  canonicalLabel: string;
  ontologyTerm: string;
  sourceDocUorId: string;
}

interface CacheEntryReference {
  cacheEntryId: string;
  uorId: string;
  entryType: string;
  dependencyUorIds: string[];
  computedAt: string;
}

interface ClaimReference {
  claimId: string;
  uorId: string;
  claimText: string;
  supportingUorIds: string[];
  confidence: number;
}
```

**UOR ID Formula (Envelope):**
```
envelope_uor_id = sha256(
  "victor-envelope" + "|" +
  agentId + "|" +
  sessionId + "|" +
  exportTimestamp + "|" +
  artifactFingerprint
)

artifactFingerprint = sha256(
  canonical(documents) + "|" +
  canonical(semanticNodes) + "|" +
  canonical(cacheEntries) + "|" +
  canonical(claims)
)
```

**Validation Rules:**
- **Fail-closed:** Missing `sourceContext.agentId` → export fails
- **Fail-closed:** Artifact UOR ID mismatch → validation fails
- **Contextual:** Cache entry with stale dependencies → flagged with `stale=true`
- **Audit:** All exports logged in Victor governance log

---

### 4. SyncHandshake

**Purpose:** Bidirectional synchronization checkpoint between Builder and Victor.

**Structure:**
```typescript
interface SyncHandshake {
  handshakeId: string;
  initiatedAt: string;
  initiator: 'builder' | 'victor';
  builderState: {
    projectId: string;
    envelopeUorId: string;
    exportedAt: string;
  };
  victorState: {
    agentId: string;
    envelopeUorId: string;
    exportedAt: string;
  };
  reconciliation: {
    builderOnlyRefs: CrossProjectReference[];
    victorOnlyRefs: CrossProjectReference[];
    syncedRefs: CrossProjectReference[];
    conflicts: ReferenceConflict[];
  };
  governance: {
    confidenceProfile: ConfidenceProfile;
    authorization: 'sync-handshake';
  };
  uorFingerprint: string;
}

interface ReferenceConflict {
  refUorId: string;
  builderVersion: string;
  victorVersion: string;
  conflictType: 'stale' | 'divergent' | 'missing';
  resolution: 'builder-wins' | 'victor-wins' | 'manual';
}
```

**UOR ID Formula:**
```
handshake_uor_id = sha256(
  "sync-handshake" + "|" +
  initiator + "|" +
  builderState.envelopeUorId + "|" +
  victorState.envelopeUorId + "|" +
  initiatedAt
)
```

**Validation Rules:**
- **Fail-closed:** Either envelope invalid → handshake fails
- **Contextual:** Unresolved conflicts → sync marked `incomplete`
- **Governance:** All conflicts logged with resolution strategy

---

### 5. GovernanceClaim

**Purpose:** Ontology-backed claim exchanged between projects with supporting evidence.

**Structure:**
```typescript
interface GovernanceClaim {
  claimId: string;
  uorId: string;
  claimText: string;
  claimType: 'progress' | 'blocker' | 'risk' | 'completion';
  scope: {
    projectId: string;
    phaseId?: string;
    taskId?: string;
  };
  supportingRefs: CrossProjectReference[];
  provenance: {
    assertedAt: string;
    assertedBy: string;
    evidenceUorIds: string[];
  };
  confidence: number;
  governance: {
    authorization: 'governance-claim';
    reviewStatus: 'pending' | 'confirmed' | 'rejected';
  };
}
```

**UOR ID Formula:**
```
claim_uor_id = sha256(
  "governance-claim" + "|" +
  claimType + "|" +
  scope.projectId + "|" +
  scope.taskId + "|" +
  canonical(claimText) + "|" +
  assertedAt
)
```

**Validation Rules:**
- **Fail-closed:** No supporting refs → claim marked `unverified`
- **Fail-closed:** Supporting ref invalid → cascade validation failure
- **Contextual:** All supporting refs stale → confidence reduced

---

## Builder-to-Victor Crosswalk Integration

### Shared Components

| Component | Builder Role | Victor Role |
|-----------|--------------|-------------|
| UORIdentity | References Victor artifacts | Defines identity format |
| UORFingerprint | Validates envelope integrity | Computes content hashes |
| CrossProjectReference | Creates refs to Victor memory | Dereferences for validation |
| BuilderStateEnvelope | Exports project state | Imports for memory grounding |
| VictorMemoryEnvelope | Imports for UI surfacing | Exports for cross-project use |
| SyncHandshake | Initiates reconciliation | Completes bidirectional sync |
| GovernanceClaim | Makes progress claims | Validates against memory |

### Interop Boundary Rules

1. **Builder exports → Victor imports:** BuilderStateEnvelope is the canonical format
2. **Victor exports → Builder imports:** VictorMemoryEnvelope is the canonical format
3. **Cross-project references:** Must include both source and target UOR IDs
4. **Validation cascade:** Invalid supporting reference → parent claim invalid
5. **Stale detection:** References track `maxAgeMs` and `computedAt` for TTL checks

---

## InterchangeCoordinator Interface

```typescript
interface InterchangeCoordinator {
  // Export operations
  exportBuilderState(projectId: string): BuilderStateEnvelope;
  exportVictorMemory(context: ExportContext): VictorMemoryEnvelope;
  
  // Import operations
  importBuilderState(envelope: BuilderStateEnvelope): ImportResult;
  importVictorMemory(envelope: VictorMemoryEnvelope): ImportResult;
  
  // Sync operations
  initiateSync(projectId: string): SyncHandshake;
  completeSync(handshake: SyncHandshake): SyncResult;
  
  // Reference operations
  resolveCrossProjectRef(ref: CrossProjectReference): DereferenceResult;
  validateRefChain(refs: CrossProjectReference[]): ValidationResult;
  
  // Claim operations
  submitGovernanceClaim(claim: GovernanceClaim): ClaimResult;
  validateClaim(claimUorId: string): ValidationResult;
}
```

---

## Migration Path

### Phase 1: Shadow Mode (Current)
- Envelopes generated alongside existing formats
- No consumption by receiving side
- Validation errors logged but not blocking

### Phase 2: Validation Mode
- Receiving side validates envelopes
- Mismatches logged as warnings
- Fallback to existing behavior

### Phase 3: Fail-Closed Mode
- Invalid envelopes rejected
- Missing UOR refs fail validation
- Explicit error messages for debugging

### Phase 4: Policy Externalization
- Interchange policy in project state
- Adjustable confidence thresholds
- Per-project override rules

---

## Verification Checklist

- [ ] CrossProjectReference includes UOR identity for both source and target
- [ ] BuilderStateEnvelope includes project UOR ID and phase/task/ledger snapshots
- [ ] VictorMemoryEnvelope includes artifact UOR IDs and provenance
- [ ] SyncHandshake reconciles bidirectional references
- [ ] GovernanceClaim has supporting refs with validation cascade
- [ ] UOR ID formulas are deterministic and content-addressed
- [ ] Fail-closed behavior defined for each contract type
- [ ] Migration path preserves backward compatibility
- [ ] InterchangeCoordinator interface is implementable
- [ ] Cross-project validation integrates with existing cache validation

---

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| Interchange envelope includes UOR IDs | ✓ All envelope types include UOR identity |
| Interchange envelope includes provenance | ✓ `sourceContext`, `exportedAt`, `assertedAt` fields |
| Interchange envelope includes confidence/governance state | ✓ `confidenceProfile`, `authorization` fields |
| Interchange envelope includes dereference rules | ✓ `dereferenceRules` on all reference types |
| Builder-visible contract boundaries explicit | ✓ All interfaces defined with clear inputs/outputs |
| Cross-project validation integrates with cache validation | ✓ Shared validation patterns and UOR refs |

---

## Related Documents

- `2026-03-17-uor-builder-identity-crosswalk.md` - Builder entity to UOR mapping
- `2026-03-17-uor-builder-cache-contract.md` - Builder cache validation rules
- `2026-03-17-uor-interop-contracts.md` - Victor-side interop contracts
- `2026-03-17-uor-memory-grounding-integration-plan.md` - Overall integration plan

---

## Ledger Entry

**Entry ID:** `led_1773824100000_builder_uor_interop_contract`  
**Type:** `productive-progress`  
**Timestamp:** 2026-03-17T20:45:00.000Z  
**Task:** `task_builder_uor_interop_contract` → `done`  
**Deliverables:**
- Builder UOR Interoperability Contract document created
- 5 contract types defined: CrossProjectReference, BuilderStateEnvelope, VictorMemoryEnvelope, SyncHandshake, GovernanceClaim
- UOR ID formulas for all contract types
- Deterministic validation rules with fail-closed and contextual modes
- InterchangeCoordinator interface defined
- Four-phase migration path specified
- Verification checklist with 10 items

---

*This document defines the interchange contract enabling deterministic, UOR-backed communication between Builder Console and Victor memory systems.*
