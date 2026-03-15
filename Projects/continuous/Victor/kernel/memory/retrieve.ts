import { detectContradictions } from './contradictions';
import { rankCacheEntries, rankChunkHits, uniqueEdges, uniqueNodes } from './rank';
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
  const chunkHits = rankChunkHits(
    await resolveChunkHits(store, projectId, query, options?.embedQuery, limit),
  );
  const directSemanticNodes = await store.searchSemanticNodes(projectId, query, limit);
  const seedNodes = uniqueNodes([
    ...directSemanticNodes,
    ...(await inferSeedNodes(store, chunkHits)),
  ]);
  const seedNodeIds = seedNodes.map((node) => node.id);
  const neighborhood = await store.expandNeighborhood(seedNodeIds, 2);
  const cacheEntries = rankCacheEntries(await store.loadFreshCacheEntries(projectId), query).slice(0, 3);
  const semanticNodes = uniqueNodes([
    ...seedNodes,
    ...neighborhood.nodes,
  ]);
  const semanticEdges = uniqueEdges(neighborhood.edges);
  const contradictions = detectContradictions(semanticNodes);
  const missingInformation = inferMissingInformation(chunkHits, semanticNodes, contradictions);
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
    .filter((node) => chunkIds.has(node.sourceChunkId) && node.state === 'active')
}

function inferMissingInformation(
  chunkHits: SearchChunkHit[],
  semanticNodes: SemanticNodeRecord[],
  contradictions: GroundedContextBundle['contradictions'],
): string[] {
  const missing: string[] = [];

  if (chunkHits.length === 0) {
    missing.push('No matching source chunks were found for this query.');
  }

  if (!semanticNodes.some((node) => node.nodeType === 'Decision')) {
    missing.push('No explicit decision node was found in the retrieved context.');
  }

  if (!semanticNodes.some((node) => node.nodeType === 'Task')) {
    missing.push('No active task node was found in the retrieved context.');
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
