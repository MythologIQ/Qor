import { detectContradictions } from './contradictions';
import { rankCacheEntries, rankChunkHits, rankSemanticNodes, uniqueEdges, uniqueNodes } from './rank';
import type { LearningStore } from './store';
import type { GroundedContextBundle, SearchChunkHit, SemanticNodeRecord } from './types';

const DEFAULT_LIMIT = 6;

export async function retrieveGroundedContext(
  store: LearningStore,
  projectId: string,
  query: string,
  options?: {
    embedQuery?: (query: string) => Promise<number[]>;
  },
  limit = DEFAULT_LIMIT,
): Promise<GroundedContextBundle> {
  const initialChunkHits = await resolveChunkHits(store, projectId, query, options?.embedQuery, limit);
  const directSemanticNodes = rankSemanticNodes(await store.searchSemanticNodes(projectId, query, limit), query);
  const semanticChunkHits = await inferChunkHitsFromSemanticNodes(store, directSemanticNodes, query);
  const chunkHits = rankChunkHits(
    uniqueChunkHits([
      ...initialChunkHits,
      ...semanticChunkHits,
    ]),
    query,
  ).slice(0, limit);
  const seedNodes = uniqueNodes(rankSemanticNodes([
    ...directSemanticNodes,
    ...(await inferSeedNodes(store, chunkHits)),
  ], query));
  const seedNodeIds = seedNodes.map((node) => node.id);
  const neighborhood = await store.expandNeighborhood(seedNodeIds, 2);
  const cacheEntries = rankCacheEntries(await store.loadFreshCacheEntries(projectId), query).slice(0, 3);
  const semanticNodes = uniqueNodes([
    ...seedNodes,
    ...neighborhood.nodes,
  ]);
  const semanticEdges = uniqueEdges(neighborhood.edges);
  const contradictions = detectContradictions(semanticNodes);
  const missingInformation = inferMissingInformation(query, chunkHits, semanticNodes, contradictions);
  const recommendedNextActions = inferNextActions(chunkHits, contradictions, missingInformation);

  return {
    query,
    chunkHits,
    semanticNodes,
    semanticEdges,
    cacheEntries,
    contradictions,
    missingInformation,
    recommendedNextActions,
  };
}

async function resolveChunkHits(
  store: LearningStore,
  projectId: string,
  query: string,
  embedQuery: ((query: string) => Promise<number[]>) | undefined,
  limit: number,
): Promise<SearchChunkHit[]> {
  if (embedQuery) {
    const embedding = await embedQuery(query);
    const vectorHits = await store.searchChunksByVector(projectId, embedding, limit);
    if (vectorHits.length > 0) {
      return vectorHits;
    }
  }

  return store.searchChunks(projectId, query, limit);
}

async function inferSeedNodes(
  store: LearningStore,
  chunkHits: SearchChunkHit[],
): Promise<SemanticNodeRecord[]> {
  const documentIds = [...new Set(chunkHits.map((hit) => hit.chunk.documentId))];
  const snapshots = await Promise.all(documentIds.map((documentId) => store.loadDocumentSnapshot(documentId)));
  const chunkIds = new Set(chunkHits.map((hit) => hit.chunk.id));

  return snapshots
    .flatMap((snapshot) => snapshot.semanticNodes)
    .filter((node) => chunkIds.has(node.sourceChunkId) && node.state === 'active');
}

function inferMissingInformation(
  query: string,
  chunkHits: SearchChunkHit[],
  semanticNodes: SemanticNodeRecord[],
  contradictions: GroundedContextBundle['contradictions'],
): string[] {
  const missing: string[] = [];
  const expectedTypes = inferExpectedNodeTypes(query);

  if (chunkHits.length === 0) {
    missing.push('No matching source chunks were found for this query.');
  }

  if (expectedTypes.has('Decision') && !semanticNodes.some((node) => node.nodeType === 'Decision')) {
    missing.push('No explicit decision node was found in the retrieved context.');
  }

  if (expectedTypes.has('Task') && !semanticNodes.some((node) => node.nodeType === 'Task')) {
    missing.push('No active task node was found in the retrieved context.');
  }

  if (expectedTypes.has('Actor') && !semanticNodes.some((node) => node.nodeType === 'Actor')) {
    missing.push('No ownership node was found in the retrieved context.');
  }

  if (expectedTypes.has('Dependency') && !semanticNodes.some((node) => node.nodeType === 'Dependency')) {
    missing.push('No dependency node was found in the retrieved context.');
  }

  if (contradictions.length > 0) {
    missing.push('Conflicting semantic assertions need resolution before acting on this result.');
  }

  return missing;
}

function inferNextActions(
  chunkHits: SearchChunkHit[],
  contradictions: GroundedContextBundle['contradictions'],
  missingInformation: string[],
): string[] {
  const actions: string[] = [];

  if (chunkHits.length === 0) {
    actions.push('Ingest the relevant workspace files before relying on this query.');
  }

  if (contradictions.length > 0) {
    actions.push('Review the contradictory nodes and decide which source remains authoritative.');
  }

  if (missingInformation.some((item) => item.includes('decision node'))) {
    actions.push('Capture the governing decision explicitly in a workspace artifact.');
  }

  if (missingInformation.some((item) => item.includes('task node'))) {
    actions.push('Create or ingest a task-bearing artifact so the kernel can track execution intent.');
  }

  return actions;
}

async function inferChunkHitsFromSemanticNodes(
  store: LearningStore,
  nodes: SemanticNodeRecord[],
  query: string,
): Promise<SearchChunkHit[]> {
  const documentIds = [...new Set(nodes.map((node) => node.documentId))];
  if (documentIds.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(documentIds.map((documentId) => store.loadDocumentSnapshot(documentId)));
  const chunksById = new Map(
    snapshots
      .flatMap((snapshot) => snapshot.chunks)
      .map((chunk) => [chunk.id, chunk] as const),
  );
  const terms = tokenizeQuery(query);

  return nodes
    .map((node) => chunksById.get(node.sourceChunkId))
    .filter((chunk): chunk is SearchChunkHit['chunk'] => Boolean(chunk))
    .map((chunk) => ({
      chunk,
      score: Math.max(1, terms.reduce((score, term) => score + (chunk.text.toLowerCase().includes(term) ? 1 : 0), 0)),
    }));
}

function uniqueChunkHits(hits: SearchChunkHit[]): SearchChunkHit[] {
  const bestByChunkId = new Map<string, SearchChunkHit>();
  for (const hit of hits) {
    const existing = bestByChunkId.get(hit.chunk.id);
    if (!existing || hit.score > existing.score) {
      bestByChunkId.set(hit.chunk.id, hit);
    }
  }
  return [...bestByChunkId.values()];
}

function inferExpectedNodeTypes(query: string): Set<SemanticNodeRecord['nodeType']> {
  const terms = tokenizeQuery(query);
  const expected = new Set<SemanticNodeRecord['nodeType']>();

  if (terms.some((term) => ['decision', 'authority', 'model', 'governance', 'boundary', 'constraint'].includes(term))) {
    expected.add('Decision');
  }
  if (terms.some((term) => ['task', 'tasks', 'phase', 'active', 'pending', 'blocked'].includes(term))) {
    expected.add('Task');
  }
  if (terms.some((term) => ['owner', 'owns', 'owned', 'who'].includes(term))) {
    expected.add('Actor');
  }
  if (terms.some((term) => ['dependency', 'depends', 'blocked', 'blocks'].includes(term))) {
    expected.add('Dependency');
  }

  return expected;
}

function tokenizeQuery(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}
