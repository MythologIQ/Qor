import type { CacheDependencyRef, CacheEntryRecord } from './types';

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

function serializeDependency(ref: CacheDependencyRef): string {
  return `${ref.kind}:${ref.id}`;
}
