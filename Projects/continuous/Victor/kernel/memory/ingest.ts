import type {
  CacheDependencyRef,
  DocumentInput,
  DocumentSnapshot,
  IngestionPlan,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
} from './types';
import { findStaleCacheIds } from './cache';
import { chunkDocument } from './chunking';
import { createSourceDocument, hashContent } from './provenance';
import { extractSemanticGraph } from './semantic-extract';

export function planArtifactIngestion(input: DocumentInput, snapshot: DocumentSnapshot): IngestionPlan {
  const document = createSourceDocument(input);
  const chunks = chunkDocument(document, input.content);
  const extraction = extractSemanticGraph(chunks);

  const changedChunkIds = diffChangedIds(snapshot.chunks, chunks);
  const removedChunkIds = snapshot.chunks
    .filter((chunk) => !chunks.some((nextChunk) => nextChunk.id === chunk.id))
    .map((chunk) => chunk.id);
  const addedNodeIds = diffChangedIds(snapshot.semanticNodes, extraction.nodes);
  const removedNodeIds = snapshot.semanticNodes
    .filter((node) => !extraction.nodes.some((nextNode) => nextNode.id === node.id))
    .map((node) => node.id);
  const removedEdgeIds = snapshot.semanticEdges
    .filter((edge) => !extraction.edges.some((nextEdge) => nextEdge.id === edge.id))
    .map((edge) => edge.id);

  const changedRefs: CacheDependencyRef[] = [
    { kind: 'document', id: document.id },
    ...changedChunkIds.map((id) => ({ kind: 'chunk' as const, id })),
    ...removedChunkIds.map((id) => ({ kind: 'chunk' as const, id })),
    ...addedNodeIds.map((id) => ({ kind: 'semantic-node' as const, id })),
    ...removedNodeIds.map((id) => ({ kind: 'semantic-node' as const, id })),
    ...removedEdgeIds.map((id) => ({ kind: 'semantic-edge' as const, id })),
  ];
  const staleCacheIds = findStaleCacheIds(snapshot.cacheEntries, changedRefs);

  return {
    document,
    chunks,
    semanticNodes: extraction.nodes,
    semanticEdges: extraction.edges,
    changedChunkIds,
    removedChunkIds,
    addedNodeIds,
    removedNodeIds,
    removedEdgeIds,
    staleCacheIds,
    ingestionRun: {
      id: hashContent(document.id, document.fingerprint, String(Date.now())),
      documentId: document.id,
      path: document.path,
      fingerprint: document.fingerprint,
      changedChunkIds,
      addedNodeIds,
      removedNodeIds,
      staleCacheIds,
      createdAt: Date.now(),
    },
  };
}

export function applyIngestionPlan(
  plan: IngestionPlan,
  store: {
    upsertDocument(document: IngestionPlan['document']): Promise<void>;
    replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void>;
    upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void>;
    markSemanticNodesTombstoned(nodeIds: string[]): Promise<void>;
    upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void>;
    markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void>;
    markCacheEntriesStale(cacheIds: string[]): Promise<void>;
    appendIngestionRun(run: IngestionPlan['ingestionRun']): Promise<void>;
  },
): Promise<IngestionPlan> {
  return (async () => {
    await store.upsertDocument(plan.document);
    await store.replaceDocumentChunks(plan.document.id, plan.chunks);
    await store.upsertSemanticNodes(plan.semanticNodes);
    await store.markSemanticNodesTombstoned(plan.removedNodeIds);
    await store.upsertSemanticEdges(plan.semanticEdges);
    await store.markSemanticEdgesTombstoned(plan.removedEdgeIds);
    await store.markCacheEntriesStale(plan.staleCacheIds);
    await store.appendIngestionRun(plan.ingestionRun);
    return plan;
  })();
}

function diffChangedIds<T extends { id: string; fingerprint: string }>(previous: T[], next: T[]): string[] {
  const previousById = new Map(previous.map((item) => [item.id, item.fingerprint]));
  return next
    .filter((item) => previousById.get(item.id) !== item.fingerprint)
    .map((item) => item.id);
}
