import { buildRecallDecision, createGovernanceMetadata } from './governance';
import { detectContradictions } from './contradictions';
import {
  extractNegativeConstraintSummary,
  extractNegativeConstraintsFromFailureMemory,
} from './cache';
import { DECAY_RETRIEVAL_THRESHOLD, rankCacheEntries, rankChunkHits, rankSemanticNodes, tokenizeQuery, uniqueEdges, uniqueNodes } from './rank';
import { resolveTemporalChain } from './temporal-chaining';
import type { GraphStore, RetrievalStore } from './store';
import type { GroundedContextBundle, RetrievalTrace, SearchChunkHit, SemanticNodeRecord } from './types';
import { filterValidCacheEntries } from './uor-cache-validation';

const DEFAULT_LIMIT = 6;

export async function retrieveGroundedContext(
  store: GraphStore & RetrievalStore,
  projectId: string,
  query: string,
  options?: {
    embedQuery?: (query: string) => Promise<number[]>;
    skipCacheValidation?: boolean;
  },
  limit = DEFAULT_LIMIT,
): Promise<GroundedContextBundle> {
  const expectedTypes = inferExpectedNodeTypes(query);
  const now = Date.now();
  const initialChunkResolution = await resolveChunkHits(store, projectId, query, options?.embedQuery, limit);
  const initialChunkHits = initialChunkResolution.hits;
  
  // Apply decay threshold filtering to chunks (permanent-profile memories exempt)
  const filteredInitialChunks = filterByDecayThreshold(initialChunkHits, now);
  const decayFilteredCount = initialChunkHits.length - filteredInitialChunks.length;
  
  const directSemanticNodes = rankSemanticNodes(
    filterNodesByDecayThreshold(await store.searchSemanticNodes(projectId, query, limit), now), 
    query, 
    now
  );
  
  const semanticChunkHits = await inferChunkHitsFromSemanticNodes(store, directSemanticNodes, query);
  
  // Combine and rank chunk hits with decay scoring
  const chunkHits = rankChunkHits(
    uniqueChunkHits([
      ...filteredInitialChunks,
      ...semanticChunkHits,
    ]),
    query,
    now,
  ).slice(0, limit);
  
  // Track additional decay filtering from semantic-node-derived chunks
  const semanticChunkIds = new Set(semanticChunkHits.map(h => h.chunk.id));
  const filteredSemanticChunks = semanticChunkHits.filter(hit => 
    hit.chunk.temporal?.decayProfile === 'permanent' || 
    computeDecayWeightForChunk(hit, now) >= DECAY_RETRIEVAL_THRESHOLD
  );
  const additionalDecayFiltered = semanticChunkHits.length - filteredSemanticChunks.length;
  
  const seedNodes = uniqueNodes(rankSemanticNodes([
    ...directSemanticNodes,
    ...(await inferSeedNodes(store, chunkHits)),
  ], query, now));
  
  const seedNodeIds = seedNodes.map((node) => node.id);
  const neighborhood = await store.expandNeighborhood(seedNodeIds, 2);
  
  // Filter neighborhood nodes by decay threshold (permanent memories exempt)
  const filteredNeighborhoodNodes = filterNodesByDecayThreshold(neighborhood.nodes, now);
  const neighborhoodDecayFiltered = neighborhood.nodes.length - filteredNeighborhoodNodes.length;
  
  // Load and validate cache entries using UOR fingerprint validation
  const rawCacheEntries = rankCacheEntries(await store.loadFreshCacheEntries(projectId), query).slice(0, 3);
  
  let cacheEntries = rawCacheEntries;
  let cacheValidationStats = {
    validated: 0,
    invalidated: 0,
    stale: 0,
    missing: 0,
  };
  
  // Filter cache entries by decay threshold
  let filteredCacheEntries = filterCacheEntriesByDecayThreshold(rawCacheEntries, now);
  const cacheDecayFiltered = rawCacheEntries.length - filteredCacheEntries.length;
  
  // Perform UOR fingerprint validation unless skipped
  if (!options?.skipCacheValidation) {
    const validation = await filterValidCacheEntries(store, filteredCacheEntries, {
      failClosed: true,
      now,
    });
    cacheEntries = validation.validEntries;
    cacheValidationStats = {
      validated: validation.stats.validCount,
      invalidated: validation.stats.invalidCount,
      stale: validation.stats.staleCount,
      missing: validation.stats.missingCount,
    };
  }
  
  const cachedNegativeConstraints = extractNegativeConstraintSummary(cacheEntries);
  const unresolvedFailureMemory = cachedNegativeConstraints.length > 0
    ? []
    : await store.listFailureMemory(projectId, 'UNRESOLVED', 10);
  const unresolvedNegativeConstraints = cachedNegativeConstraints.length > 0
    ? cachedNegativeConstraints
    : extractNegativeConstraintsFromFailureMemory(unresolvedFailureMemory);
  const expectedTypeNodes = await inferExpectedTypeNodes(store, chunkHits, seedNodes, expectedTypes, now);
  
  // Combine all semantic nodes before temporal chain resolution
  const allSemanticNodes = uniqueNodes([
    ...seedNodes,
    ...expectedTypeNodes,
    ...filteredNeighborhoodNodes,
  ]);
  
  // Resolve temporal chains to filter superseded predecessors
  const temporalResolution = resolveTemporalChain(allSemanticNodes, neighborhood.edges, now);
  const semanticNodes = temporalResolution.currentNodes;
  const supersededFilteredCount = temporalResolution.supersededNodeIds.length;
  const supersededNodes = temporalResolution.deprecatedNodes;
  
  // Include temporal-supersedes edges in the semantic edges
  const semanticEdges = uniqueEdges([
    ...neighborhood.edges,
    ...temporalResolution.chainLinks.map(link => link.edge),
  ]);
  
  const contradictions = detectContradictions(semanticNodes).map((item) => ({
    ...item,
    governance: createGovernanceMetadata(undefined, {
      state: 'contested',
      epistemicType: 'source-claim',
      provenanceComplete: true,
      confidence: 0.56,
      rationale: 'Contradiction surfaced from retrieved semantic claims that remain simultaneously grounded.',
    }),
  }));
  const missingInformation = inferMissingInformation(
    query,
    chunkHits,
    semanticNodes,
    contradictions,
    expectedTypes,
    unresolvedNegativeConstraints,
  );
  const recommendedNextActions = inferNextActions(
    query,
    chunkHits,
    semanticNodes,
    semanticEdges,
    contradictions,
    missingInformation,
    unresolvedNegativeConstraints,
  );
  const recallDecision = buildRecallDecision({
    chunkHitCount: chunkHits.length,
    semanticNodeCount: semanticNodes.length,
    contradictions,
    missingInformation,
  });
  
  // Total decay filtered count across all memory types
  const totalDecayFiltered = decayFilteredCount + additionalDecayFiltered + neighborhoodDecayFiltered + cacheDecayFiltered;
  
  const retrievalTrace: RetrievalTrace = {
    expectedNodeTypes: [...expectedTypes],
    chunkStrategy: initialChunkResolution.strategy,
    initialChunkHitCount: initialChunkHits.length,
    semanticChunkHitCount: semanticChunkHits.length,
    directSemanticNodeCount: directSemanticNodes.length,
    seedNodeCount: seedNodes.length,
    neighborhoodNodeCount: filteredNeighborhoodNodes.length,
    cacheEntryCount: cacheEntries.length,
    negativeConstraintSource: cachedNegativeConstraints.length > 0
      ? 'cache'
      : unresolvedNegativeConstraints.length > 0
        ? 'failure-memory'
        : 'none',
    negativeConstraintCount: unresolvedNegativeConstraints.length,
    decayFilteredCount: totalDecayFiltered,
    supersededFilteredCount,
    // UOR cache validation metrics
    cacheValidatedCount: cacheValidationStats.validated,
    cacheInvalidatedCount: cacheValidationStats.invalidated,
    cacheStaleDependencyCount: cacheValidationStats.stale,
    cacheMissingDependencyCount: cacheValidationStats.missing,
    recallMode: recallDecision.mode,
  };

  return {
    query,
    chunkHits,
    semanticNodes,
    semanticEdges,
    cacheEntries,
    contradictions,
    missingInformation,
    recommendedNextActions,
    recallDecision,
    retrievalTrace,
  };
}

// Import computeDecayWeight for filtering logic
function computeDecayWeightForChunk(hit: SearchChunkHit, now: number): number {
  if (!hit.chunk.temporal || hit.chunk.temporal.lambda === 0) {
    return 1.0;
  }
  const elapsedMs = now - hit.chunk.temporal.t0;
  if (elapsedMs <= 0) {
    return hit.chunk.temporal.w0;
  }
  const elapsedSeconds = elapsedMs / 1000;
  const weight = hit.chunk.temporal.w0 * Math.exp(-hit.chunk.temporal.lambda * elapsedSeconds);
  return Math.max(0, Math.min(1.0, weight));
}

function computeDecayWeightForNode(node: SemanticNodeRecord, now: number): number {
  if (!node.temporal || node.temporal.lambda === 0) {
    return 1.0;
  }
  const elapsedMs = now - node.temporal.t0;
  if (elapsedMs <= 0) {
    return node.temporal.w0;
  }
  const elapsedSeconds = elapsedMs / 1000;
  const weight = node.temporal.w0 * Math.exp(-node.temporal.lambda * elapsedSeconds);
  return Math.max(0, Math.min(1.0, weight));
}

function computeDecayWeightForCacheEntry(entry: import('./types').CacheEntryRecord, now: number): number {
  if (!entry.temporal || entry.temporal.lambda === 0) {
    return 1.0;
  }
  const elapsedMs = now - entry.temporal.t0;
  if (elapsedMs <= 0) {
    return entry.temporal.w0;
  }
  const elapsedSeconds = elapsedMs / 1000;
  const weight = entry.temporal.w0 * Math.exp(-entry.temporal.lambda * elapsedSeconds);
  return Math.max(0, Math.min(1.0, weight));
}

function filterByDecayThreshold(hits: SearchChunkHit[], now: number): SearchChunkHit[] {
  return hits.filter(hit => {
    // Permanent memories never decay
    if (hit.chunk.temporal?.decayProfile === 'permanent') {
      return true;
    }
    const weight = computeDecayWeightForChunk(hit, now);
    return weight >= DECAY_RETRIEVAL_THRESHOLD;
  });
}

function filterNodesByDecayThreshold(nodes: SemanticNodeRecord[], now: number): SemanticNodeRecord[] {
  return nodes.filter(node => {
    // Permanent memories never decay
    if (node.temporal?.decayProfile === 'permanent') {
      return true;
    }
    const weight = computeDecayWeightForNode(node, now);
    return weight >= DECAY_RETRIEVAL_THRESHOLD;
  });
}

function filterCacheEntriesByDecayThreshold(entries: import('./types').CacheEntryRecord[], now: number): import('./types').CacheEntryRecord[] {
  return entries.filter(entry => {
    // Permanent memories never decay
    if (entry.temporal?.decayProfile === 'permanent') {
      return true;
    }
    const weight = computeDecayWeightForCacheEntry(entry, now);
    return weight >= DECAY_RETRIEVAL_THRESHOLD;
  });
}

async function resolveChunkHits(
  store: GraphStore & RetrievalStore,
  projectId: string,
  query: string,
  embedQuery: ((query: string) => Promise<number[]>) | undefined,
  limit: number,
): Promise<{
  hits: SearchChunkHit[];
  strategy: RetrievalTrace['chunkStrategy'];
}> {
  if (embedQuery) {
    const embedding = await embedQuery(query);
    const vectorHits = await store.searchChunksByVector(projectId, embedding, limit);
    if (vectorHits.length > 0) {
      return {
        hits: vectorHits,
        strategy: 'vector',
      };
    }
  }

  return {
    hits: await store.searchChunks(projectId, query, limit),
    strategy: 'lexical',
  };
}

async function inferSeedNodes(
  store: GraphStore & RetrievalStore,
  chunkHits: SearchChunkHit[],
): Promise<SemanticNodeRecord[]> {
  const documentIds = [...new Set(chunkHits.map((hit) => hit.chunk.documentId))];
  const snapshots = await Promise.all(documentIds.map((documentId) => store.loadDocumentSnapshot(documentId)));
  const chunkIds = new Set(chunkHits.map((hit) => hit.chunk.id));

  return snapshots
    .flatMap((snapshot) => snapshot.semanticNodes)
    .filter((node) => chunkIds.has(node.sourceChunkId) && node.state === 'active');
}

async function inferExpectedTypeNodes(
  store: GraphStore & RetrievalStore,
  chunkHits: SearchChunkHit[],
  seedNodes: SemanticNodeRecord[],
  expectedTypes: Set<SemanticNodeRecord['nodeType']>,
  now: number,
): Promise<SemanticNodeRecord[]> {
  if (expectedTypes.size === 0) {
    return [];
  }

  const presentTypes = new Set(seedNodes.map((node) => node.nodeType));
  const missingTypes = [...expectedTypes].filter((nodeType) => !presentTypes.has(nodeType));
  if (missingTypes.length === 0) {
    return [];
  }

  const documentIds = [...new Set([
    ...chunkHits.map((hit) => hit.chunk.documentId),
    ...seedNodes.map((node) => node.documentId),
  ])];

  if (documentIds.length === 0) {
    return [];
  }

  const snapshots = await Promise.all(documentIds.map((documentId) => store.loadDocumentSnapshot(documentId)));
  return rankSemanticNodes(
    snapshots
      .flatMap((snapshot) => snapshot.semanticNodes)
      .filter((node) => node.state === 'active' && missingTypes.includes(node.nodeType)),
    [...missingTypes, ...seedNodes.map((node) => node.label)].join(' '),
    now,
  ).slice(0, missingTypes.length * 2);
}

function inferMissingInformation(
  query: string,
  chunkHits: SearchChunkHit[],
  semanticNodes: SemanticNodeRecord[],
  contradictions: GroundedContextBundle['contradictions'],
  expectedTypes = inferExpectedNodeTypes(query),
  unresolvedNegativeConstraints: string[] = [],
): string[] {
  const missing: string[] = [];

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

  for (const negativeConstraint of unresolvedNegativeConstraints) {
    missing.push(`Unresolved negative constraint: ${negativeConstraint}`);
  }

  return missing;
}

function inferNextActions(
  query: string,
  chunkHits: SearchChunkHit[],
  semanticNodes: SemanticNodeRecord[],
  semanticEdges: GroundedContextBundle['semanticEdges'],
  contradictions: GroundedContextBundle['contradictions'],
  missingInformation: string[],
  unresolvedNegativeConstraints: string[] = [],
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

  const activeTaskAction = inferActiveTaskNextAction(query, semanticNodes, semanticEdges);
  if (activeTaskAction) {
    actions.push(activeTaskAction);
  }

  for (const negativeConstraint of unresolvedNegativeConstraints) {
    actions.push(`Honor unresolved failure constraint: ${negativeConstraint}`);
  }

  return actions;
}

function inferActiveTaskNextAction(
  query: string,
  semanticNodes: SemanticNodeRecord[],
  semanticEdges: GroundedContextBundle['semanticEdges'],
): string | null {
  const taskNodes = semanticNodes.filter((node) => node.nodeType === 'Task');
  if (taskNodes.length === 0) {
    return null;
  }

  const normalizedQuery = normalizeText(query);
  const activeTask = taskNodes.find((node) => isTaskInProgress(node) && queryReferencesTask(normalizedQuery, node))
    ?? taskNodes.find(isTaskInProgress)
    ?? taskNodes.find((node) => queryReferencesTask(normalizedQuery, node))
    ?? null;
  if (!activeTask) {
    return null;
  }

  const taskTitles = new Set(taskNodes.map((node) => normalizeText(node.label)));
  const supportedGoalIds = new Set(
    semanticEdges
      .filter((edge) => edge.fromNodeId === activeTask.id && edge.edgeType === 'supports')
      .map((edge) => edge.toNodeId),
  );
  const supportedGoals = semanticNodes.filter(
    (node) => node.nodeType === 'Goal' && supportedGoalIds.has(node.id),
  );

  for (const goal of supportedGoals) {
    const recommendation = goalToAction(goal.label);
    if (!recommendation) {
      continue;
    }
    if (taskTitles.has(normalizeText(recommendation))) {
      continue;
    }
    if (normalizeText(recommendation) === normalizeText(activeTask.label)) {
      continue;
    }
    return recommendation;
  }

  return null;
}

async function inferChunkHitsFromSemanticNodes(
  store: GraphStore & RetrievalStore,
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
  const terms = tokenizeQuery(stripQuotedSegments(query));
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

function stripQuotedSegments(value: string): string {
  return value.replace(/"[^"]*"/g, ' ');
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isTaskInProgress(node: SemanticNodeRecord): boolean {
  return node.nodeType === 'Task' && node.attributes?.['status'] === 'active';
}

function queryReferencesTask(normalizedQuery: string, node: SemanticNodeRecord): boolean {
  if (!normalizedQuery) {
    return false;
  }

  const title = normalizeText(node.label);
  if (title && normalizedQuery.includes(title)) {
    return true;
  }

  const taskId = normalizeText(String(node.attributes?.taskId ?? ''));
  return Boolean(taskId) && normalizedQuery.includes(taskId);
}

function goalToAction(goalLabel: string): string | null {
  const normalized = normalizeText(goalLabel);
  if (!normalized) {
    return null;
  }

  const compactDisplayMatch = goalLabel.match(/compact operations display/i);
  const provenanceMatch = goalLabel.match(/prompt construction\/?provenance|prompt construction/i);
  if (compactDisplayMatch && provenanceMatch) {
    return 'Build prompt-construction operations display';
  }

  if (/reduced to normal chat input output|standard chat input output/i.test(normalized)) {
    return 'Reduce comms tab to standard chat input/output';
  }

  if (/prompt building logic is automated/i.test(normalized)) {
    return 'Build backend prompt-construction pipeline';
  }

  const stripped = goalLabel
    .trim()
    .replace(/[.?!]+$/g, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\bis reduced to\b/i, ' -> ')
    .replace(/\bis standard\b/i, ' -> standard')
    .replace(/\bshows\b/i, 'for')
    .replace(/\bis automated\b/i, 'automation');
  if (!stripped) {
    return null;
  }

  return `Implement ${stripped.charAt(0).toLowerCase()}${stripped.slice(1)}`;
}
