import type { CacheEntryRecord, SearchChunkHit, SemanticEdgeRecord, SemanticNodeRecord } from './types';

export function rankChunkHits(hits: SearchChunkHit[], query?: string): SearchChunkHit[] {
  const terms = query ? tokenizeQuery(query) : [];
  return [...hits].sort((a, b) => {
    const scoreDelta = scoreChunk(b, terms) - scoreChunk(a, terms);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.chunk.index - b.chunk.index;
  });
}

export function rankSemanticNodes(nodes: SemanticNodeRecord[], query: string): SemanticNodeRecord[] {
  const terms = tokenizeQuery(query);
  const queryIntent = detectQueryIntent(terms);

  return [...nodes].sort((a, b) => {
    const scoreDelta = scoreSemanticNode(b, terms, queryIntent) - scoreSemanticNode(a, terms, queryIntent);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.label.localeCompare(b.label);
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

function scoreChunk(hit: SearchChunkHit, terms: string[]): number {
  const content = hit.chunk.text.toLowerCase();
  const lexicalMatches = terms.reduce((score, term) => score + (content.includes(term) ? 1 : 0), 0);
  const phraseBoost = terms.length > 1 && content.includes(terms.join(' ')) ? 2 : 0;
  return hit.score * 10 + lexicalMatches * 3 + phraseBoost;
}

function scoreSemanticNode(
  node: SemanticNodeRecord,
  terms: string[],
  queryIntent: QueryIntent,
): number {
  const label = node.label.toLowerCase();
  const summary = node.summary.toLowerCase();
  const labelMatches = terms.reduce((score, term) => score + (label.includes(term) ? 1 : 0), 0);
  const summaryMatches = terms.reduce((score, term) => score + (summary.includes(term) ? 1 : 0), 0);
  const intentBoost = queryIntent[node.nodeType] ?? 0;
  return labelMatches * 5 + summaryMatches * 2 + intentBoost;
}

function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

type QueryIntent = Partial<Record<SemanticNodeRecord['nodeType'], number>>;

function detectQueryIntent(terms: string[]): QueryIntent {
  const intent: QueryIntent = {};

  if (terms.some((term) => ['task', 'tasks', 'phase', 'phases', 'active', 'pending', 'blocked'].includes(term))) {
    intent.Task = 5;
    intent.Goal = 2;
  }

  if (terms.some((term) => ['decision', 'decide', 'authority', 'model'].includes(term))) {
    intent.Decision = 5;
  }

  if (terms.some((term) => ['constraint', 'boundary', 'guardrail', 'governance'].includes(term))) {
    intent.Constraint = 4;
    intent.Decision = Math.max(intent.Decision ?? 0, 2);
  }

  if (terms.some((term) => ['owner', 'owns', 'owned', 'who'].includes(term))) {
    intent.Actor = 5;
  }

  if (terms.some((term) => ['dependency', 'depends', 'blocked', 'blocks'].includes(term))) {
    intent.Dependency = 5;
    intent.Task = Math.max(intent.Task ?? 0, 2);
  }

  return intent;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}
