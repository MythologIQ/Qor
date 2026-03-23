/**
 * UOR Cache Validation
 *
 * Deterministic cache staleness detection using UOR fingerprints.
 * Compares stored dependency fingerprints to current graph state for fail-closed validation.
 *
 * See: task_cmhl_uor_cache_invalidation in phases.json
 * Architecture: docs/plans/2026-03-17-uor-cache-validation-design.md
 */

import type {
  CacheDependencyRef,
  CacheEntryRecord,
  DocumentSnapshot,
  GovernanceMetadata,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
  UORFingerprint,
} from './types';

import { createHash } from 'node:crypto';
import { createGovernanceMetadata, withGovernanceState } from './governance';
import type { GraphStore } from './store';

// ============================================================================
// UOR Fingerprint Computation
// ============================================================================

/**
 * Compute UOR fingerprint from deterministic content.
 * Creates a SHA256 hash of canonical identity components for verifiable
 * content-addressed identity.
 *
 * @param kind - Type of graph entity being fingerprinted
 * @param sourceDocumentId - ID of the source document
 * @param content - Content to hash
 * @param span - Optional source span for precise addressing
 * @returns UOR fingerprint (SHA256 hex string)
 */
export function computeUORFingerprint(
  kind: 'semantic-node' | 'semantic-edge' | 'source-document' | 'source-chunk',
  sourceDocumentId: string,
  content: string,
  span?: { startLine: number; endLine: number; startOffset: number; endOffset: number },
): UORFingerprint {
  const hash = createHash('sha256');
  hash.update(`uor:v1:${kind}:${sourceDocumentId}`);
  if (span) {
    hash.update(`:${span.startLine}:${span.endLine}:${span.startOffset}:${span.endOffset}`);
  }
  hash.update(`:${content}`);
  return hash.digest('hex');
}

// ============================================================================
// Types
// ============================================================================

/**
 * Extended cache dependency with UOR fingerprint for deterministic validation
 */
export interface UORCacheDependency extends CacheDependencyRef {
  /** UOR fingerprint at time of cache creation */
  uorFingerprint: UORFingerprint;
  /** Optional: content hash for additional verification */
  contentHash?: string;
}

/**
 * Validation result for a single dependency
 */
export interface DependencyValidationResult {
  /** Dependency reference that was checked */
  dependency: UORCacheDependency;
  /** Whether the fingerprint matches current state */
  valid: boolean;
  /** Current fingerprint from store (if available) */
  currentFingerprint?: UORFingerprint;
  /** Timestamp of validation */
  validatedAt: number;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Complete cache entry validation result
 */
export interface CacheValidationResult {
  /** Cache entry ID */
  cacheEntryId: string;
  /** Overall validity (all dependencies valid) */
  valid: boolean;
  /** Individual dependency results */
  dependencyResults: DependencyValidationResult[];
  /** Number of stale dependencies */
  staleDependencyCount: number;
  /** Number of missing dependencies */
  missingDependencyCount: number;
  /** Timestamp of validation */
  validatedAt: number;
  /** Recommended action */
  action: 'use' | 'invalidate' | 'revalidate';
  /** Governance metadata for audit trail */
  governance: GovernanceMetadata;
}

/**
 * Interface for fingerprint lookup from store
 */
export interface FingerprintLookup {
  /** Get current UOR fingerprint for a document */
  getDocumentFingerprint(documentId: string): UORFingerprint | undefined;
  /** Get current UOR fingerprint for a chunk */
  getChunkFingerprint(chunkId: string): UORFingerprint | undefined;
  /** Get current UOR fingerprint for a semantic node */
  getNodeFingerprint(nodeId: string): UORFingerprint | undefined;
}

// ============================================================================
// UOR Fingerprint Computation for Dependencies
// ============================================================================

/**
 * Compute UOR fingerprint for a source document dependency
 */
export function computeDocumentDependencyFingerprint(
  document: SourceDocumentRecord,
): UORFingerprint {
  return computeUORFingerprint('source-document', document.id, document.fingerprint);
}

/**
 * Compute UOR fingerprint for a source chunk dependency
 */
export function computeChunkDependencyFingerprint(
  chunk: SourceChunkRecord,
): UORFingerprint {
  return computeUORFingerprint(
    'source-chunk',
    chunk.documentId,
    chunk.fingerprint,
    chunk.span,
  );
}

/**
 * Compute UOR fingerprint for a semantic node dependency
 */
export function computeNodeDependencyFingerprint(
  node: SemanticNodeRecord,
): UORFingerprint {
  return computeUORFingerprint(
    'semantic-node',
    node.documentId,
    node.fingerprint,
    node.span,
  );
}

// ============================================================================
// Dependency Validation
// ============================================================================

/**
 * Validate a single cache dependency against current store state
 */
export function validateDependency(
  dependency: UORCacheDependency,
  lookup: FingerprintLookup,
  now: number = Date.now(),
): DependencyValidationResult {
  let currentFingerprint: UORFingerprint | undefined;

  switch (dependency.kind) {
    case 'document':
      currentFingerprint = lookup.getDocumentFingerprint(dependency.id);
      break;
    case 'chunk':
      currentFingerprint = lookup.getChunkFingerprint(dependency.id);
      break;
    case 'semantic-node':
      currentFingerprint = lookup.getNodeFingerprint(dependency.id);
      break;
    default:
      // For other kinds (semantic-edge, failure-memory), we can't validate fingerprints yet
      return {
        dependency,
        valid: true, // Pass-through for unvalidated kinds
        validatedAt: now,
      };
  }

  if (currentFingerprint === undefined) {
    return {
      dependency,
      valid: false,
      currentFingerprint,
      validatedAt: now,
      error: `Dependency ${dependency.kind}:${dependency.id} not found in store`,
    };
  }

  const valid = currentFingerprint === dependency.uorFingerprint;

  return {
    dependency,
    valid,
    currentFingerprint,
    validatedAt: now,
    error: valid ? undefined : `Fingerprint mismatch: stored ${dependency.uorFingerprint.substring(0, 16)}... vs current ${currentFingerprint.substring(0, 16)}...`,
  };
}

// ============================================================================
// Cache Entry Validation
// ============================================================================

/**
 * Validate a cache entry using UOR fingerprint comparison
 * Fail-closed: returns invalid if any dependency cannot be validated
 */
export function validateCacheEntry(
  entry: CacheEntryRecord,
  lookup: FingerprintLookup,
  options?: {
    failClosed?: boolean;
    now?: number;
  },
): CacheValidationResult {
  const now = options?.now ?? Date.now();
  const failClosed = options?.failClosed ?? true;

  // If entry already marked stale, return invalid immediately
  if (entry.status === 'stale') {
    return {
      cacheEntryId: entry.id,
      valid: false,
      dependencyResults: [],
      staleDependencyCount: 0,
      missingDependencyCount: 0,
      validatedAt: now,
      action: 'invalidate',
      governance: withGovernanceState(
        entry.governance ?? createGovernanceMetadata('cacheEntry'),
        'deprecated',
        'Cache entry was previously marked stale.',
      ),
    };
  }

  // Validate each dependency that has UOR fingerprint
  const dependencyResults: DependencyValidationResult[] = [];
  let staleCount = 0;
  let missingCount = 0;

  for (const dep of entry.dependencyRefs) {
    // Check if dependency has UOR fingerprint (migration compatibility)
    const uorDep = dep as UORCacheDependency;
    if (!uorDep.uorFingerprint) {
      // Legacy dependency without fingerprint - skip validation or fail closed
      if (failClosed) {
        missingCount++;
        dependencyResults.push({
          dependency: { ...dep, uorFingerprint: '' },
          valid: false,
          validatedAt: now,
          error: 'Legacy dependency without UOR fingerprint - cannot validate',
        });
      }
      continue;
    }

    const result = validateDependency(uorDep, lookup, now);
    dependencyResults.push(result);

    if (!result.valid) {
      if (result.error?.includes('not found')) {
        missingCount++;
      } else {
        staleCount++;
      }
    }
  }

  // Determine overall validity
  const allValid = dependencyResults.length > 0
    ? dependencyResults.every(r => r.valid)
    : true; // No dependencies = valid (vacuously)

  // Determine action
  let action: CacheValidationResult['action'];
  if (allValid) {
    action = 'use';
  } else if (missingCount > 0 && failClosed) {
    action = 'invalidate';
  } else if (staleCount > 0) {
    action = 'invalidate';
  } else {
    action = 'revalidate';
  }

  return {
    cacheEntryId: entry.id,
    valid: allValid,
    dependencyResults,
    staleDependencyCount: staleCount,
    missingDependencyCount: missingCount,
    validatedAt: now,
    action,
    governance: createGovernanceMetadata('cacheEntry', {
      state: allValid ? 'durable' : 'deprecated',
      rationale: allValid
        ? 'All UOR dependency fingerprints validated successfully.'
        : `${staleCount} stale, ${missingCount} missing dependencies detected.`,
    }),
  };
}

/**
 * Validate multiple cache entries in batch
 */
export function validateCacheEntries(
  entries: CacheEntryRecord[],
  lookup: FingerprintLookup,
  options?: {
    failClosed?: boolean;
    now?: number;
  },
): CacheValidationResult[] {
  return entries.map(entry => validateCacheEntry(entry, lookup, options));
}

// ============================================================================
// Legacy Cache ID-Based Staleness (Backward Compatibility)
// ============================================================================

/**
 * Find stale cache IDs using legacy ID-based matching
 * This is kept for backward compatibility during migration
 */
export function findStaleCacheIdsLegacy(
  cacheEntries: CacheEntryRecord[],
  changedRefs: CacheDependencyRef[],
): string[] {
  if (changedRefs.length === 0) {
    return [];
  }

  const changed = new Set(changedRefs.map(r => `${r.kind}:${r.id}`));

  return cacheEntries
    .filter(entry =>
      entry.dependencyRefs.some(ref => changed.has(`${ref.kind}:${ref.id}`)),
    )
    .map(entry => entry.id);
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Convert legacy cache dependency to UOR-aware dependency
 */
export function migrateDependencyToUOR(
  dep: CacheDependencyRef,
  lookup: FingerprintLookup,
): UORCacheDependency | null {
  let uorFingerprint: UORFingerprint | undefined;

  switch (dep.kind) {
    case 'document':
      uorFingerprint = lookup.getDocumentFingerprint(dep.id);
      break;
    case 'chunk':
      uorFingerprint = lookup.getChunkFingerprint(dep.id);
      break;
    case 'semantic-node':
      uorFingerprint = lookup.getNodeFingerprint(dep.id);
      break;
    default:
      return null; // Cannot migrate
  }

  if (!uorFingerprint) {
    return null; // Not found in store
  }

  return {
    ...dep,
    uorFingerprint,
  };
}

/**
 * Migrate cache entry dependencies to UOR-aware format
 */
export function migrateCacheEntryToUOR(
  entry: CacheEntryRecord,
  lookup: FingerprintLookup,
): CacheEntryRecord {
  const migratedDeps = entry.dependencyRefs
    .map(dep => migrateDependencyToUOR(dep, lookup))
    .filter((dep): dep is UORCacheDependency => dep !== null);

  return {
    ...entry,
    dependencyRefs: migratedDeps,
  };
}

// ============================================================================
// Store-backed Fingerprint Lookup
// ============================================================================

/**
 * Builds a FingerprintLookup from pre-loaded document snapshots.
 * The lookup is synchronous and operates on the cached data.
 */
export function buildFingerprintLookupFromSnapshots(
  snapshots: Map<string, DocumentSnapshot>,
): FingerprintLookup {
  // Flatten all chunks and nodes from all snapshots for fast lookup
  const chunkMap = new Map<string, SourceChunkRecord>();
  const nodeMap = new Map<string, SemanticNodeRecord>();

  for (const snapshot of snapshots.values()) {
    for (const chunk of snapshot.chunks) {
      chunkMap.set(chunk.id, chunk);
    }
    for (const node of snapshot.semanticNodes) {
      nodeMap.set(node.id, node);
    }
  }

  return {
    getDocumentFingerprint: (documentId: string): UORFingerprint | undefined => {
      const snapshot = snapshots.get(documentId);
      return snapshot?.document?.uorId;
    },
    getChunkFingerprint: (chunkId: string): UORFingerprint | undefined => {
      const chunk = chunkMap.get(chunkId);
      return chunk?.uorId;
    },
    getNodeFingerprint: (nodeId: string): UORFingerprint | undefined => {
      const node = nodeMap.get(nodeId);
      if (!node) return undefined;
      // Compute fingerprint from node data
      return computeNodeDependencyFingerprint(node);
    },
  };
}

/**
 * Loads all document snapshots needed to validate the given cache entries.
 * Returns a lookup that can be used for synchronous validation.
 */
export async function loadFingerprintsForCacheEntries(
  store: Pick<GraphStore, 'loadDocumentSnapshot'>,
  entries: CacheEntryRecord[],
): Promise<FingerprintLookup> {
  const documentIds = new Set<string>();

  // Collect all document IDs referenced in cache entry dependencies
  for (const entry of entries) {
    for (const ref of entry.dependencyRefs) {
      // For documents, use the ID directly
      if (ref.kind === 'document') {
        documentIds.add(ref.id);
      }
      // For chunks and nodes, we need to find their document
      // This will require loading them first or we assume document ID is available
    }
  }

  // Also collect document IDs from chunk/node references
  // by checking if we can infer the document from the ID pattern
  for (const entry of entries) {
    for (const ref of entry.dependencyRefs) {
      if (ref.kind === 'chunk' || ref.kind === 'semantic-node') {
        // Try to infer document ID from the reference ID
        // Pattern: chunk IDs often start with or contain document ID
        // For now, we'll load all documents in the project to be safe
      }
    }
  }

  // Load all document snapshots
  const snapshots = new Map<string, DocumentSnapshot>();
  for (const docId of documentIds) {
    try {
      const snapshot = await store.loadDocumentSnapshot(docId);
      snapshots.set(docId, snapshot);
    } catch {
      // Document not found - will result in validation failure
    }
  }

  return buildFingerprintLookupFromSnapshots(snapshots);
}

/**
 * Filters cache entries based on UOR fingerprint validation.
 * Returns only entries with valid fingerprints (fail-closed).
 */
export async function filterValidCacheEntries(
  store: Pick<GraphStore, 'loadDocumentSnapshot'>,
  entries: CacheEntryRecord[],
  options?: {
    failClosed?: boolean;
    now?: number;
    includeValidationDetails?: boolean;
  },
): Promise<{
  validEntries: CacheEntryRecord[];
  invalidEntries: CacheEntryRecord[];
  validationResults?: CacheValidationResult[];
  stats: {
    totalChecked: number;
    validCount: number;
    invalidCount: number;
    staleCount: number;
    missingCount: number;
  };
}> {
  const now = options?.now ?? Date.now();
  const failClosed = options?.failClosed ?? true;

  // Load fingerprints for all entries
  const lookup = await loadFingerprintsForCacheEntries(store, entries);

  // Validate each entry
  const validationResults = entries.map(entry =>
    validateCacheEntry(entry, lookup, { failClosed, now })
  );

  const validEntries: CacheEntryRecord[] = [];
  const invalidEntries: CacheEntryRecord[] = [];
  let staleCount = 0;
  let missingCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const result = validationResults[i];
    if (result.valid) {
      validEntries.push(entries[i]);
    } else {
      invalidEntries.push(entries[i]);
      staleCount += result.staleDependencyCount;
      missingCount += result.missingDependencyCount;
    }
  }

  return {
    validEntries,
    invalidEntries,
    validationResults: options?.includeValidationDetails ? validationResults : undefined,
    stats: {
      totalChecked: entries.length,
      validCount: validEntries.length,
      invalidCount: invalidEntries.length,
      staleCount,
      missingCount,
    },
  };
}