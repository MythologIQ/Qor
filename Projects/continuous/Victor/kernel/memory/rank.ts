import type { CacheEntryRecord, SearchChunkHit, SemanticEdgeRecord, SemanticNodeRecord } from './types';

export function rankChunkHits(hits: SearchChunkHit[]): SearchChunkHit[] {
  return [...hits].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.chunk.index - b.chunk.index;
  });
}

export function uniqueNodes(nodes: SemanticNodeRecord[]): SemanticNodeRecord[] {
  return dedupeById(nodes).filter((node) => node.state === 'active');
}

export function uniqueEdges(edges: SemanticEdgeRecord[]): SemanticEdgeRecord[] {
  return dedupeById(edges).filter((edge) => edge.state === 'active');
}

export function rankCacheEntries(entries: CacheEntryRecord[], query: string): CacheEntryRecord[] {
  const terms = tokenizeQuery(query);

  return [...entries]
    .filter((entry) => entry.status === 'fresh')
    .sort((a, b) => scoreEntry(b.summary, terms) - scoreEntry(a.summary, terms));
}

function scoreEntry(summary: string, terms: string[]): number {
  const lower = summary.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}
