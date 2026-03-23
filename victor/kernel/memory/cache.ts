import type { CacheDependencyRef, CacheEntryRecord, FailureMemoryRecord } from './types';
import { createGovernanceMetadata, withGovernanceState } from './governance';

const NEGATIVE_CONSTRAINT_SUMMARY_PURPOSE = 'negative-constraint-summary';

export function findStaleCacheIds(
  cacheEntries: CacheEntryRecord[],
  changedRefs: CacheDependencyRef[],
): string[] {
  if (changedRefs.length === 0) {
    return [];
  }

  const changed = new Set(changedRefs.map(serializeDependency));

  return cacheEntries
    .filter((entry) =>
      entry.dependencyRefs.some((ref) => changed.has(serializeDependency(ref))),
    )
    .map((entry) => entry.id);
}

export function ensureGovernedCacheEntry(entry: CacheEntryRecord): CacheEntryRecord {
  const base = entry.governance ?? createGovernanceMetadata('cacheEntry', {
    rationale: 'Cache entry governance defaults applied from memory policy.',
  });

  return {
    ...entry,
    purpose: entry.purpose ?? entry.cacheType,
    governance: base,
  };
}

export function buildNegativeConstraintSummaryCacheEntry(
  projectId: string,
  failureMemory: FailureMemoryRecord[],
): CacheEntryRecord | null {
  const constraints = extractNegativeConstraintsFromFailureMemory(failureMemory);
  if (constraints.length === 0) {
    return null;
  }

  return ensureGovernedCacheEntry({
    id: `negative-constraint-summary:${projectId}`,
    cacheType: 'negative-constraint-summary',
    summary: constraints.join('\n'),
    status: 'fresh',
    dependencyRefs: failureMemory.map((record) => ({
      kind: 'failure-memory',
      id: record.id,
    })),
    updatedAt: Date.now(),
    purpose: NEGATIVE_CONSTRAINT_SUMMARY_PURPOSE,
    governance: createGovernanceMetadata('cacheEntry', {
      rationale: 'Derived cache of unresolved negative constraints for fast governed recall and write arbitration.',
      confidence: 0.93,
    }),
  });
}

export function extractNegativeConstraintSummary(
  cacheEntries: CacheEntryRecord[],
): string[] {
  const summaryEntry = cacheEntries.find((entry) =>
    entry.status === 'fresh'
      && (
        entry.cacheType === 'negative-constraint-summary'
        || entry.purpose === NEGATIVE_CONSTRAINT_SUMMARY_PURPOSE
      ),
  );

  if (!summaryEntry?.summary.trim()) {
    return [];
  }

  return summaryEntry.summary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractNegativeConstraintsFromFailureMemory(
  failureMemory: FailureMemoryRecord[],
): string[] {
  const seen = new Set<string>();
  const constraints: string[] = [];

  for (const record of failureMemory) {
    const constraint = record.negativeConstraint?.trim();
    if (!constraint || seen.has(constraint)) {
      continue;
    }

    seen.add(constraint);
    constraints.push(constraint);
  }

  return constraints;
}

function serializeDependency(ref: CacheDependencyRef): string {
  return `${ref.kind}:${ref.id}`;
}
