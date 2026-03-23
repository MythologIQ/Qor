import neo4j, { type Driver, type Session } from 'neo4j-driver';

import type { LearningPacket } from '../learning-schema';
import {
  buildNegativeConstraintSummaryCacheEntry,
  ensureGovernedCacheEntry,
} from './cache';
import type { LearningStore } from './store';
import { tokenizeQuery } from './rank';
import type {
  CacheEntryRecord,
  CacheDependencyRef,
  DocumentSnapshot,
  FailureMemoryRecord,
  GraphNeighborhood,
  HeatmapUpdate,
  IngestionRunRecord,
  LearningQuery,
  Neo4jConfig,
  SearchChunkHit,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  SourceChunkRecord,
  SourceDocumentRecord,
  SourceSpan,
  GovernanceEventRecord,
} from './types';

export const SCHEMA_STATEMENTS = [
  'CREATE CONSTRAINT learning_event_id IF NOT EXISTS FOR (event:LearningEvent) REQUIRE event.id IS UNIQUE',
  'CREATE CONSTRAINT heatmap_node_id IF NOT EXISTS FOR (node:HeatMapNode) REQUIRE node.node_id IS UNIQUE',
  'CREATE CONSTRAINT source_document_id IF NOT EXISTS FOR (document:SourceDocument) REQUIRE document.id IS UNIQUE',
  'CREATE CONSTRAINT source_chunk_id IF NOT EXISTS FOR (chunk:SourceChunk) REQUIRE chunk.id IS UNIQUE',
  'CREATE CONSTRAINT semantic_node_id IF NOT EXISTS FOR (node:SemanticNode) REQUIRE node.id IS UNIQUE',
  'CREATE CONSTRAINT semantic_edge_id IF NOT EXISTS FOR (edge:SemanticEdge) REQUIRE edge.id IS UNIQUE',
  'CREATE CONSTRAINT cache_entry_id IF NOT EXISTS FOR (entry:CacheEntry) REQUIRE entry.id IS UNIQUE',
  'CREATE CONSTRAINT ingestion_run_id IF NOT EXISTS FOR (run:IngestionRun) REQUIRE run.id IS UNIQUE',
  'CREATE CONSTRAINT governance_event_id IF NOT EXISTS FOR (event:GovernanceEvent) REQUIRE event.id IS UNIQUE',
  'CREATE CONSTRAINT failure_memory_id IF NOT EXISTS FOR (failure:FailureMemory) REQUIRE failure.id IS UNIQUE',
  'CREATE INDEX source_document_path IF NOT EXISTS FOR (document:SourceDocument) ON (document.path)',
  'CREATE INDEX semantic_node_type IF NOT EXISTS FOR (node:SemanticNode) ON (node.nodeType)',
  'CREATE INDEX source_document_governance_state IF NOT EXISTS FOR (document:SourceDocument) ON (document.governanceState)',
  'CREATE INDEX semantic_node_governance_state IF NOT EXISTS FOR (node:SemanticNode) ON (node.governanceState)',
  'CREATE INDEX semantic_node_epistemic_type IF NOT EXISTS FOR (node:SemanticNode) ON (node.epistemicType)',
  'CREATE INDEX failure_memory_status IF NOT EXISTS FOR (failure:FailureMemory) ON (failure.remediationStatus)',
  'CREATE INDEX failure_memory_mode IF NOT EXISTS FOR (failure:FailureMemory) ON (failure.failureMode)',
];

function buildSchemaStatements(): string[] {
  return [...SCHEMA_STATEMENTS];
}

export class Neo4jLearningStore implements LearningStore {
  private driver: Driver | null = null;

  constructor(private readonly config: Neo4jConfig) {}

  async initialize(): Promise<void> {
    this.driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.username, this.config.password),
    );

    await this.driver.verifyConnectivity();

    for (const statement of buildSchemaStatements()) {
      await this.executeWrite(statement);
    }

    await this.ensureVectorIndex(this.config.vectorDimensions || 1536);
  }

  async close(): Promise<void> {
    if (!this.driver) {
      return;
    }

    await this.driver.close();
    this.driver = null;
  }

  async index(packet: LearningPacket): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MERGE (event:LearningEvent {id: $id})
            SET event.timestamp = $timestamp,
                event.origin_phase = $origin_phase,
                event.context_node = $context_node,
                event.context_stack = $context_stack,
                event.project_id = $project_id,
                event.session_id = $session_id,
                event.trigger_type = $trigger_type,
                event.lesson = $lesson,
                event.audit_constraint = $audit_constraint,
                event.guardrail_pattern = $guardrail_pattern,
                event.debt_impact = $debt_impact,
                event.debt_heat = $debt_heat,
                event.frequency = $frequency,
                event.tags = $tags,
                event.universal_truth = $universal_truth,
                event.related_events = $related_events,
                event.verified_at = $verified_at,
                event.effectiveness_score = $effectiveness_score
          `,
          this.toPacketParams(packet),
        ),
      );
    } finally {
      await session.close();
    }
  }

  async query(criteria: LearningQuery): Promise<LearningPacket[]> {
    const session = this.getSession();
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (criteria.origin_phase) {
      conditions.push('event.origin_phase = $origin_phase');
      params.origin_phase = criteria.origin_phase;
    }

    if (criteria.trigger_type) {
      conditions.push('event.trigger_type = $trigger_type');
      params.trigger_type = criteria.trigger_type;
    }

    if (criteria.universal_truth !== undefined) {
      conditions.push('event.universal_truth = $universal_truth');
      params.universal_truth = criteria.universal_truth;
    }

    if (criteria.context_node) {
      conditions.push('event.context_node = $context_node');
      params.context_node = criteria.context_node;
    }

    if (typeof criteria.context_stack === 'string') {
      conditions.push('$context_stack IN coalesce(event.context_stack, [])');
      params.context_stack = criteria.context_stack;
    } else if (criteria.context_stack?.$in?.length) {
      conditions.push('ANY(item IN $context_stack_in WHERE item IN coalesce(event.context_stack, []))');
      params.context_stack_in = criteria.context_stack.$in;
    }

    if (criteria.lesson?.$regex) {
      conditions.push('event.lesson =~ $lesson_regex');
      params.lesson_regex = `(?i).*${escapeRegex(criteria.lesson.$regex)}.*`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (event:LearningEvent)
            ${whereClause}
            RETURN event
            ORDER BY event.timestamp DESC
            LIMIT 100
          `,
          params,
        ),
      );

      return result.records.map((record) => this.fromLearningNode(record.get('event').properties));
    } finally {
      await session.close();
    }
  }

  async update(id: string, packet: LearningPacket): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MATCH (event:LearningEvent {id: $id})
            SET event.timestamp = $timestamp,
                event.origin_phase = $origin_phase,
                event.context_node = $context_node,
                event.context_stack = $context_stack,
                event.project_id = $project_id,
                event.session_id = $session_id,
                event.trigger_type = $trigger_type,
                event.lesson = $lesson,
                event.audit_constraint = $audit_constraint,
                event.guardrail_pattern = $guardrail_pattern,
                event.debt_impact = $debt_impact,
                event.debt_heat = $debt_heat,
                event.frequency = $frequency,
                event.tags = $tags,
                event.universal_truth = $universal_truth,
                event.related_events = $related_events,
                event.verified_at = $verified_at,
                event.effectiveness_score = $effectiveness_score
          `,
          this.toPacketParams(packet, id),
        ),
      );
    } finally {
      await session.close();
    }
  }

  async updateHeatmap(update: HeatmapUpdate): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MERGE (node:HeatMapNode {node_id: $node_id})
            ON CREATE SET node.heat = $heat,
                          node.last_update = $last_update,
                          node.lessons = [$reason]
            ON MATCH SET node.heat = $heat,
                         node.last_update = $last_update,
                         node.lessons = coalesce(node.lessons, []) + $reason
          `,
          {
            node_id: update.node,
            heat: update.heat,
            reason: update.reason,
            last_update: Date.now(),
          },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async loadDocumentSnapshot(documentId: string): Promise<DocumentSnapshot> {
    const session = this.getSession();

    try {
      const documentResult = await session.executeRead((tx) =>
        tx.run('MATCH (document:SourceDocument {id: $id}) RETURN document', { id: documentId }),
      );
      const chunkResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (:SourceDocument {id: $id})-[:HAS_CHUNK]->(chunk:SourceChunk)
            RETURN chunk
            ORDER BY chunk.index ASC
          `,
          { id: documentId },
        ),
      );
      const nodeResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (node:SemanticNode {documentId: $id})
            RETURN node
          `,
          { id: documentId },
        ),
      );
      const edgeResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (edge:SemanticEdge {documentId: $id})
            RETURN edge
          `,
          { id: documentId },
        ),
      );
      const cacheResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (entry:CacheEntry)
            WHERE ANY(ref IN coalesce(entry.dependencyRefs, []) WHERE ref ENDS WITH ':' + $id)
            RETURN entry
          `,
          { id: documentId },
        ),
      );

      return {
        document: documentResult.records[0]
          ? this.fromSourceDocument(documentResult.records[0].get('document').properties)
          : undefined,
        chunks: chunkResult.records.map((record) => this.fromSourceChunk(record.get('chunk').properties)),
        semanticNodes: nodeResult.records.map((record) => this.fromSemanticNode(record.get('node').properties)),
        semanticEdges: edgeResult.records.map((record) => this.fromSemanticEdge(record.get('edge').properties)),
        cacheEntries: cacheResult.records.map((record) => this.fromCacheEntry(record.get('entry').properties)),
      };
    } finally {
      await session.close();
    }
  }

  async upsertDocument(document: SourceDocumentRecord): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MERGE (document:SourceDocument {id: $id})
            SET document.path = $path,
                document.projectId = $projectId,
                document.title = $title,
                document.contentType = $contentType,
                document.fingerprint = $fingerprint,
                document.contentLength = $contentLength,
                document.updatedAt = $updatedAt,
                document.governanceState = $governanceState,
                document.epistemicType = $epistemicType,
                document.provenanceComplete = $provenanceComplete,
                document.confidence = $confidence,
                document.policyVersion = $policyVersion,
                document.governanceRationale = $governanceRationale
          `,
          {
            ...document,
            ...serializeGovernance(document.governance),
          },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async replaceDocumentChunks(documentId: string, chunks: SourceChunkRecord[]): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `
            MATCH (:SourceDocument {id: $documentId})-[rel:HAS_CHUNK]->(chunk:SourceChunk)
            DELETE rel
          `,
          { documentId },
        );

        for (const chunk of chunks) {
          await tx.run(
            `
              MATCH (document:SourceDocument {id: $documentId})
              MERGE (chunk:SourceChunk {id: $id})
              SET chunk.documentId = $documentId,
                  chunk.index = $index,
                  chunk.fingerprint = $fingerprint,
                  chunk.text = $text,
                  chunk.tokenEstimate = $tokenEstimate,
                  chunk.span = $span,
                  chunk.embedding = $embedding,
                  chunk.governanceState = $governanceState,
                  chunk.epistemicType = $epistemicType,
                  chunk.provenanceComplete = $provenanceComplete,
                  chunk.confidence = $confidence,
                  chunk.policyVersion = $policyVersion,
                  chunk.governanceRationale = $governanceRationale
              MERGE (document)-[:HAS_CHUNK]->(chunk)
            `,
            {
              ...chunk,
              span: serializeSpan(chunk.span),
              embedding: chunk.embedding ?? null,
              ...serializeGovernance(chunk.governance),
            },
          );
        }
      });
    } finally {
      await session.close();
    }
  }

  async upsertSemanticNodes(nodes: SemanticNodeRecord[]): Promise<void> {
    if (nodes.length === 0) {
      return;
    }

    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        for (const node of nodes) {
          await tx.run(
            `
              MATCH (chunk:SourceChunk {id: $sourceChunkId})
              MERGE (node:SemanticNode {id: $id})
              SET node.documentId = $documentId,
                  node.sourceChunkId = $sourceChunkId,
                  node.nodeType = $nodeType,
                  node.label = $label,
                  node.summary = $summary,
                  node.fingerprint = $fingerprint,
                  node.span = $span,
                  node.attributes = $attributes,
                  node.state = $state,
                  node.governanceState = $governanceState,
                  node.epistemicType = $epistemicType,
                  node.provenanceComplete = $provenanceComplete,
                  node.confidence = $confidence,
                  node.policyVersion = $policyVersion,
                  node.governanceRationale = $governanceRationale
              MERGE (chunk)-[:SOURCES_NODE]->(node)
            `,
            {
              ...node,
              span: serializeSpan(node.span),
              attributes: JSON.stringify(node.attributes),
              ...serializeGovernance(node.governance),
            },
          );
        }
      });
    } finally {
      await session.close();
    }
  }

  async markSemanticNodesTombstoned(nodeIds: string[]): Promise<void> {
    if (nodeIds.length === 0) {
      return;
    }

    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MATCH (node:SemanticNode)
            WHERE node.id IN $nodeIds
            SET node.state = 'tombstoned'
          `,
          { nodeIds },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async upsertSemanticEdges(edges: SemanticEdgeRecord[]): Promise<void> {
    if (edges.length === 0) {
      return;
    }

    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        for (const edge of edges) {
          await tx.run(
            `
              MATCH (from:SemanticNode {id: $fromNodeId})
              MATCH (to:SemanticNode {id: $toNodeId})
              MATCH (chunk:SourceChunk {id: $sourceChunkId})
              MERGE (edge:SemanticEdge {id: $id})
              SET edge.documentId = $documentId,
                  edge.sourceChunkId = $sourceChunkId,
                  edge.fromNodeId = $fromNodeId,
                  edge.toNodeId = $toNodeId,
                  edge.edgeType = $edgeType,
                  edge.fingerprint = $fingerprint,
                  edge.attributes = $attributes,
                  edge.state = $state,
                  edge.governanceState = $governanceState,
                  edge.epistemicType = $epistemicType,
                  edge.provenanceComplete = $provenanceComplete,
                  edge.confidence = $confidence,
                  edge.policyVersion = $policyVersion,
                  edge.governanceRationale = $governanceRationale
              MERGE (from)-[:EMITS_EDGE]->(edge)
              MERGE (edge)-[:POINTS_TO]->(to)
              MERGE (chunk)-[:SOURCES_EDGE]->(edge)
            `,
            {
              ...edge,
              attributes: JSON.stringify(edge.attributes),
              ...serializeGovernance(edge.governance),
            },
          );
        }
      });
    } finally {
      await session.close();
    }
  }

  async markSemanticEdgesTombstoned(edgeIds: string[]): Promise<void> {
    if (edgeIds.length === 0) {
      return;
    }

    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        tx.run(
          `
            MATCH (edge:SemanticEdge)
            WHERE edge.id IN $edgeIds
            SET edge.state = 'tombstoned'
          `,
          { edgeIds },
        ),
      );
    } finally {
      await session.close();
    }
  }

  async upsertCacheEntries(entries: CacheEntryRecord[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const governedEntries = entries.map(ensureGovernedCacheEntry);

    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        for (const entry of governedEntries) {
          await tx.run(
            `
              MERGE (entry:CacheEntry {id: $id})
              SET entry.cacheType = $cacheType,
                  entry.summary = $summary,
                  entry.status = $status,
                  entry.dependencyRefs = $dependencyRefs,
                  entry.updatedAt = $updatedAt,
                  entry.purpose = $purpose,
                  entry.expiresAt = $expiresAt,
                  entry.governanceState = $governanceState,
                  entry.epistemicType = $epistemicType,
                  entry.provenanceComplete = $provenanceComplete,
                  entry.confidence = $confidence,
                  entry.policyVersion = $policyVersion,
                  entry.governanceRationale = $governanceRationale
            `,
            {
              ...entry,
              dependencyRefs: entry.dependencyRefs.map(serializeDependencyRef),
              expiresAt: entry.expiresAt ?? null,
              ...serializeGovernance(entry.governance),
            },
          );

          await this.appendGovernanceEventTx(tx, {
            id: `governance-cache-upsert-${entry.id}-${entry.updatedAt}`,
            eventType: 'promotion-approved',
            entityKind: 'cache-entry',
            entityId: entry.id,
            policyVersion: entry.governance?.policyVersion ?? 'unknown',
            createdAt: entry.updatedAt,
            summary: 'Cache entry persisted with governed metadata.',
            metadata: {
              cacheType: entry.cacheType,
              status: entry.status,
            },
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  async markCacheEntriesStale(cacheIds: string[]): Promise<void> {
    if (cacheIds.length === 0) {
      return;
    }

    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        (async () => {
          const updatedAt = Date.now();
          await tx.run(
            `
              MATCH (entry:CacheEntry)
              WHERE entry.id IN $cacheIds
              SET entry.status = 'stale',
                  entry.updatedAt = $updatedAt
            `,
            { cacheIds, updatedAt },
          );

          for (const cacheId of cacheIds) {
            await this.appendGovernanceEventTx(tx, {
              id: `governance-cache-stale-${cacheId}-${updatedAt}`,
              eventType: 'cache-invalidated',
              entityKind: 'cache-entry',
              entityId: cacheId,
              policyVersion: MEMORY_POLICY_FALLBACK_VERSION,
              createdAt: updatedAt,
              summary: 'Cache entry marked stale due to dependency invalidation.',
              metadata: {},
            });
          }
        })(),
      );
    } finally {
      await session.close();
    }
  }

  async appendIngestionRun(run: IngestionRunRecord): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) =>
        (async () => {
          await tx.run(
            `
              MATCH (document:SourceDocument {id: $documentId})
              MERGE (run:IngestionRun {id: $id})
              SET run.path = $path,
                  run.fingerprint = $fingerprint,
                  run.changedChunkIds = $changedChunkIds,
                  run.addedNodeIds = $addedNodeIds,
                  run.removedNodeIds = $removedNodeIds,
                  run.staleCacheIds = $staleCacheIds,
                  run.createdAt = $createdAt,
                  run.governanceState = $governanceState,
                  run.epistemicType = $epistemicType,
                  run.provenanceComplete = $provenanceComplete,
                  run.confidence = $confidence,
                  run.policyVersion = $policyVersion,
                  run.governanceRationale = $governanceRationale
              MERGE (document)-[:INGESTED_IN]->(run)
            `,
            {
              ...run,
              ...serializeGovernance(run.governance),
            },
          );

          await this.appendGovernanceEventTx(tx, {
            id: `governance-ingest-${run.id}`,
            eventType: 'ingest-completed',
            entityKind: 'document',
            entityId: run.documentId,
            policyVersion: run.governance?.policyVersion ?? MEMORY_POLICY_FALLBACK_VERSION,
            createdAt: run.createdAt,
            summary: 'Ingestion run completed and memory mutations were committed.',
            metadata: {
              runId: run.id,
              changedChunkCount: String(run.changedChunkIds.length),
              staleCacheCount: String(run.staleCacheIds.length),
            },
          });
        })(),
      );
    } finally {
      await session.close();
    }
  }

  async appendFailureMemory(record: FailureMemoryRecord): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `
            MERGE (failure:FailureMemory {id: $id})
            SET failure.projectId = $projectId,
                failure.createdAt = $createdAt,
                failure.updatedAt = $updatedAt,
                failure.sourceDocumentId = $sourceDocumentId,
                failure.sourceChunkId = $sourceChunkId,
                failure.sourceNodeId = $sourceNodeId,
                failure.summary = $summary,
                failure.failureMode = $failureMode,
                failure.causalVector = $causalVector,
                failure.negativeConstraint = $negativeConstraint,
                failure.environmentContext = $environmentContext,
                failure.remediationStatus = $remediationStatus,
                failure.remediationNotes = $remediationNotes,
                failure.supersededBy = $supersededBy,
                failure.governanceState = $governanceState,
                failure.epistemicType = $epistemicType,
                failure.provenanceComplete = $provenanceComplete,
                failure.confidence = $confidence,
                failure.policyVersion = $policyVersion,
                failure.governanceRationale = $governanceRationale
          `,
          {
            ...record,
            updatedAt: record.updatedAt ?? null,
            sourceDocumentId: record.sourceDocumentId ?? null,
            sourceChunkId: record.sourceChunkId ?? null,
            sourceNodeId: record.sourceNodeId ?? null,
            causalVector: record.causalVector ?? null,
            negativeConstraint: record.negativeConstraint ?? null,
            environmentContext: record.environmentContext ?? null,
            remediationNotes: record.remediationNotes ?? null,
            supersededBy: record.supersededBy ?? null,
            ...serializeGovernance(record.governance),
          },
        );

        await this.appendGovernanceEventTx(tx, {
          id: `governance-failure-memory-${record.id}`,
          eventType: 'promotion-approved',
          entityKind: 'failure-memory',
          entityId: record.id,
          policyVersion: record.governance?.policyVersion ?? MEMORY_POLICY_FALLBACK_VERSION,
          createdAt: record.createdAt,
          summary: 'Failure memory persisted as governed negative learning.',
          metadata: {
            failureMode: record.failureMode,
            remediationStatus: record.remediationStatus,
          },
        });

        const unresolvedResult = await tx.run(
          `
            MATCH (failure:FailureMemory {projectId: $projectId, remediationStatus: 'UNRESOLVED'})
            RETURN failure
            ORDER BY failure.createdAt DESC
            LIMIT 250
          `,
          {
            projectId: record.projectId,
          },
        );

        const unresolvedFailureMemory = unresolvedResult.records.map((entry) =>
          this.fromFailureMemory(entry.get('failure').properties),
        );
        const summaryEntry = buildNegativeConstraintSummaryCacheEntry(record.projectId, unresolvedFailureMemory);

        if (summaryEntry) {
          await tx.run(
            `
              MERGE (entry:CacheEntry {id: $id})
              SET entry.cacheType = $cacheType,
                  entry.summary = $summary,
                  entry.status = $status,
                  entry.dependencyRefs = $dependencyRefs,
                  entry.updatedAt = $updatedAt,
                  entry.purpose = $purpose,
                  entry.expiresAt = $expiresAt,
                  entry.governanceState = $governanceState,
                  entry.epistemicType = $epistemicType,
                  entry.provenanceComplete = $provenanceComplete,
                  entry.confidence = $confidence,
                  entry.policyVersion = $policyVersion,
                  entry.governanceRationale = $governanceRationale
            `,
            {
              ...summaryEntry,
              dependencyRefs: summaryEntry.dependencyRefs.map(serializeDependencyRef),
              expiresAt: summaryEntry.expiresAt ?? null,
              ...serializeGovernance(summaryEntry.governance),
            },
          );

          await this.appendGovernanceEventTx(tx, {
            id: `governance-cache-upsert-${summaryEntry.id}-${summaryEntry.updatedAt}`,
            eventType: 'promotion-approved',
            entityKind: 'cache-entry',
            entityId: summaryEntry.id,
            policyVersion: summaryEntry.governance?.policyVersion ?? 'unknown',
            createdAt: summaryEntry.updatedAt,
            summary: 'Negative constraint summary cache refreshed from unresolved failure memory.',
            metadata: {
              cacheType: summaryEntry.cacheType,
              dependencyCount: String(summaryEntry.dependencyRefs.length),
            },
          });
        }
      });
    } finally {
      await session.close();
    }
  }

  async listFailureMemory(
    projectId: string,
    status?: FailureMemoryRecord['remediationStatus'],
    limit = 50,
  ): Promise<FailureMemoryRecord[]> {
    const session = this.getSession();

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (failure:FailureMemory {projectId: $projectId})
            WHERE $status IS NULL OR failure.remediationStatus = $status
            RETURN failure
            ORDER BY failure.createdAt DESC
            LIMIT $limit
          `,
          {
            projectId,
            status: status ?? null,
            limit: neo4j.int(limit),
          },
        ),
      );

      return result.records.map((record) => this.fromFailureMemory(record.get('failure').properties));
    } finally {
      await session.close();
    }
  }

  async remediateFailureMemories(
    projectId: string,
    options: {
      negativeConstraint: string;
      remediationStatus: FailureMemoryRecord['remediationStatus'];
      remediationNotes: string;
      supersededBy?: string;
    },
  ): Promise<number> {
    const session = this.getSession();

    try {
      return await session.executeWrite(async (tx) => {
        const updatedAt = Date.now();
        const result = await tx.run(
          `
            MATCH (failure:FailureMemory {projectId: $projectId, remediationStatus: 'UNRESOLVED'})
            WHERE trim(coalesce(failure.negativeConstraint, '')) = $negativeConstraint
            SET failure.remediationStatus = $remediationStatus,
                failure.remediationNotes = $remediationNotes,
                failure.supersededBy = $supersededBy,
                failure.updatedAt = $updatedAt
            RETURN count(failure) AS count
          `,
          {
            projectId,
            negativeConstraint: options.negativeConstraint.trim(),
            remediationStatus: options.remediationStatus,
            remediationNotes: options.remediationNotes,
            supersededBy: options.supersededBy ?? null,
            updatedAt,
          },
        );

        const count = toNumber(result.records[0]?.get('count') ?? 0);
        if (count > 0) {
          await this.appendGovernanceEventTx(tx, {
            id: `governance-failure-remediation-${projectId}-${updatedAt}`,
            eventType: 'promotion-approved',
            entityKind: 'failure-memory',
            entityId: options.negativeConstraint.trim(),
            policyVersion: MEMORY_POLICY_FALLBACK_VERSION,
            createdAt: updatedAt,
            summary: 'Failure memory remediation status was updated from a grounded reconciliation pass.',
            metadata: {
              remediationStatus: options.remediationStatus,
              count: String(count),
            },
          });
        }

        return count;
      });
    } finally {
      await session.close();
    }
  }

  async markNegativeConstraintSummaryStale(projectId: string): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `
            MATCH (entry:CacheEntry {id: $id})
            SET entry.status = 'stale'
          `,
          { id: `negative-constraint-summary:${projectId}` },
        );
      });
    } finally {
      await session.close();
    }
  }

  async searchChunks(projectId: string, query: string, limit: number): Promise<SearchChunkHit[]> {
    const session = this.getSession();
    const terms = tokenizeQuery(query);

    if (terms.length === 0) {
      return [];
    }

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (document:SourceDocument {projectId: $projectId})-[:HAS_CHUNK]->(chunk:SourceChunk)
            WITH chunk,
                 reduce(score = 0.0, term IN $terms |
                   score + CASE WHEN toLower(chunk.text) CONTAINS term THEN 1.0 ELSE 0.0 END
                 ) AS score
            WHERE score > 0
            RETURN chunk, score
            ORDER BY score DESC, chunk.index ASC
            LIMIT $limit
          `,
          {
            projectId,
            terms,
            limit: neo4j.int(limit),
          },
        ),
      );

      return result.records.map((record) => ({
        chunk: this.fromSourceChunk(record.get('chunk').properties),
        score: toNumber(record.get('score')),
      }));
    } finally {
      await session.close();
    }
  }

  async searchChunksByVector(projectId: string, embedding: number[], limit: number): Promise<SearchChunkHit[]> {
    const session = this.getSession();

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            CALL db.index.vector.queryNodes('source_chunk_embedding', $limit, $embedding)
            YIELD node, score
            MATCH (document:SourceDocument {id: node.documentId, projectId: $projectId})
            RETURN node AS chunk, score
            ORDER BY score DESC
          `,
          {
            projectId,
            embedding,
            limit: neo4j.int(limit),
          },
        ),
      );

      return result.records.map((record) => ({
        chunk: this.fromSourceChunk(record.get('chunk').properties),
        score: toNumber(record.get('score')),
      }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('source_chunk_embedding')) {
        return [];
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  async searchSemanticNodes(
    projectId: string,
    query: string,
    limit: number,
  ): Promise<SemanticNodeRecord[]> {
    const session = this.getSession();
    const terms = tokenizeQuery(query);

    if (terms.length === 0) {
      return [];
    }

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (document:SourceDocument {projectId: $projectId})-[:HAS_CHUNK]->(:SourceChunk)-[:SOURCES_NODE]->(node:SemanticNode)
            WHERE node.state = 'active'
            WITH DISTINCT node,
                 reduce(score = 0.0, term IN $terms |
                   score
                   + CASE WHEN toLower(node.label) CONTAINS term THEN 2.0 ELSE 0.0 END
                   + CASE WHEN toLower(node.summary) CONTAINS term THEN 1.0 ELSE 0.0 END
                   + CASE WHEN toLower(node.nodeType) CONTAINS term THEN 1.5 ELSE 0.0 END
                 ) AS score
            WHERE score > 0
            RETURN node
            ORDER BY score DESC, node.label ASC
            LIMIT $limit
          `,
          {
            projectId,
            terms,
            limit: neo4j.int(limit),
          },
        ),
      );

      return result.records.map((record) => this.fromSemanticNode(record.get('node').properties));
    } finally {
      await session.close();
    }
  }

  async expandNeighborhood(seedNodeIds: string[], depth: number): Promise<GraphNeighborhood> {
    if (seedNodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    const session = this.getSession();
    const boundedDepth = Math.max(1, depth);

    try {
      const nodeResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (seed:SemanticNode)
            WHERE seed.id IN $seedNodeIds
            MATCH (seed)-[:EMITS_EDGE*0..${boundedDepth}]->(edge:SemanticEdge)-[:POINTS_TO]->(neighbor:SemanticNode)
            RETURN DISTINCT neighbor AS node
          `,
          { seedNodeIds },
        ),
      );
      const edgeResult = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (seed:SemanticNode)
            WHERE seed.id IN $seedNodeIds
            MATCH (seed)-[:EMITS_EDGE*0..${boundedDepth}]->(edge:SemanticEdge)
            RETURN DISTINCT edge
          `,
          { seedNodeIds },
        ),
      );

      return {
        nodes: nodeResult.records.map((record) => this.fromSemanticNode(record.get('node').properties)),
        edges: edgeResult.records.map((record) => this.fromSemanticEdge(record.get('edge').properties)),
      };
    } finally {
      await session.close();
    }
  }

  async loadFreshCacheEntries(projectId: string): Promise<CacheEntryRecord[]> {
    const session = this.getSession();

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            MATCH (entry:CacheEntry)
            WHERE entry.status = 'fresh'
              AND (
                ANY(ref IN coalesce(entry.dependencyRefs, []) WHERE ref STARTS WITH 'document:')
                OR ANY(ref IN coalesce(entry.dependencyRefs, []) WHERE ref STARTS WITH 'failure-memory:')
              )
            OPTIONAL MATCH (document:SourceDocument {projectId: $projectId})
            WHERE ANY(ref IN coalesce(entry.dependencyRefs, []) WHERE ref = 'document:' + document.id)
            OPTIONAL MATCH (failure:FailureMemory {projectId: $projectId})
            WHERE ANY(ref IN coalesce(entry.dependencyRefs, []) WHERE ref = 'failure-memory:' + failure.id)
            WITH entry, document, failure
            WHERE document IS NOT NULL OR failure IS NOT NULL
            RETURN DISTINCT entry
          `,
          { projectId },
        ),
      );

      return result.records.map((record) => this.fromCacheEntry(record.get('entry').properties));
    } finally {
      await session.close();
    }
  }

  private async executeWrite(statement: string): Promise<void> {
    const session = this.getSession();

    try {
      await session.executeWrite((tx) => tx.run(statement));
    } finally {
      await session.close();
    }
  }

  private async ensureVectorIndex(expectedDimensions: number): Promise<void> {
    const session = this.getSession();

    try {
      const result = await session.executeRead((tx) =>
        tx.run(
          `
            SHOW INDEXES
            YIELD name, type, options
            WHERE name = 'source_chunk_embedding'
            RETURN name, type, options
          `,
        ),
      );

      const existing = result.records[0];
      const existingDimensions = existing
        ? this.readVectorDimensions(existing.get('options'))
        : null;

      if (existing && existingDimensions !== expectedDimensions) {
        await session.executeWrite((tx) => tx.run('DROP INDEX source_chunk_embedding IF EXISTS'));
      }

      if (!existing || existingDimensions !== expectedDimensions) {
        await session.executeWrite((tx) =>
          tx.run(
            `
              CREATE VECTOR INDEX source_chunk_embedding IF NOT EXISTS
              FOR (chunk:SourceChunk)
              ON chunk.embedding
              OPTIONS { indexConfig: { \`vector.dimensions\`: ${expectedDimensions}, \`vector.similarity_function\`: 'cosine' } }
            `,
          ),
        );
      }
    } finally {
      await session.close();
    }
  }

  private readVectorDimensions(options: unknown): number | null {
    if (!options || typeof options !== 'object') {
      return null;
    }

    const map = options as Record<string, unknown>;
    const indexConfig = map.indexConfig;
    if (!indexConfig || typeof indexConfig !== 'object') {
      return null;
    }

    const dims = (indexConfig as Record<string, unknown>)['vector.dimensions'];
    return dims === undefined ? null : toNumber(dims);
  }

  private getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4jLearningStore is not initialized');
    }

    return this.driver.session({ database: this.config.database });
  }

  private toPacketParams(packet: LearningPacket, id = packet.id): Record<string, unknown> {
    return {
      id,
      timestamp: packet.timestamp,
      origin_phase: packet.origin_phase,
      context_node: packet.context_node ?? null,
      context_stack: packet.context_stack ?? [],
      project_id: packet.project_id,
      session_id: packet.session_id,
      trigger_type: packet.trigger_type,
      lesson: packet.lesson,
      audit_constraint: packet.audit_constraint ?? null,
      guardrail_pattern: packet.guardrail_pattern ?? null,
      debt_impact: packet.debt_impact,
      debt_heat: packet.debt_heat,
      frequency: packet.frequency ?? 0,
      tags: packet.tags,
      universal_truth: packet.universal_truth ?? false,
      related_events: packet.related_events ?? [],
      verified_at: packet.verified_at ?? null,
      effectiveness_score: packet.effectiveness_score ?? 0,
    };
  }

  private fromLearningNode(properties: Record<string, unknown>): LearningPacket {
    return {
      id: String(properties.id),
      timestamp: toNumber(properties.timestamp),
      origin_phase: String(properties.origin_phase) as LearningPacket['origin_phase'],
      context_node: optionalString(properties.context_node),
      context_stack: toStringArray(properties.context_stack),
      project_id: String(properties.project_id),
      session_id: String(properties.session_id),
      trigger_type: String(properties.trigger_type) as LearningPacket['trigger_type'],
      lesson: String(properties.lesson),
      audit_constraint: optionalString(properties.audit_constraint),
      guardrail_pattern: optionalString(properties.guardrail_pattern),
      debt_impact: toNumber(properties.debt_impact),
      debt_heat: String(properties.debt_heat) as LearningPacket['debt_heat'],
      frequency: toNumber(properties.frequency),
      tags: toStringArray(properties.tags),
      universal_truth: Boolean(properties.universal_truth),
      related_events: toStringArray(properties.related_events),
      verified_at: optionalNumber(properties.verified_at),
      effectiveness_score: optionalNumber(properties.effectiveness_score),
    };
  }

  private fromSourceDocument(properties: Record<string, unknown>): SourceDocumentRecord {
    return {
      id: String(properties.id),
      path: String(properties.path),
      projectId: String(properties.projectId),
      title: String(properties.title),
      contentType: String(properties.contentType),
      fingerprint: String(properties.fingerprint),
      contentLength: toNumber(properties.contentLength),
      updatedAt: toNumber(properties.updatedAt),
      governance: parseGovernanceMetadata(properties),
    };
  }

  private fromSourceChunk(properties: Record<string, unknown>): SourceChunkRecord {
    return {
      id: String(properties.id),
      documentId: String(properties.documentId),
      index: toNumber(properties.index),
      fingerprint: String(properties.fingerprint),
      text: String(properties.text),
      tokenEstimate: toNumber(properties.tokenEstimate),
      span: parseSpan(properties.span),
      embedding: parseEmbedding(properties.embedding),
      governance: parseGovernanceMetadata(properties),
    };
  }

  private fromSemanticNode(properties: Record<string, unknown>): SemanticNodeRecord {
    return {
      id: String(properties.id),
      documentId: String(properties.documentId),
      sourceChunkId: String(properties.sourceChunkId),
      nodeType: String(properties.nodeType) as SemanticNodeRecord['nodeType'],
      label: String(properties.label),
      summary: String(properties.summary),
      fingerprint: String(properties.fingerprint),
      span: parseSpan(properties.span),
      attributes: parseAttributes(properties.attributes),
      state: String(properties.state) as SemanticNodeRecord['state'],
      governance: parseGovernanceMetadata(properties),
    };
  }

  private fromSemanticEdge(properties: Record<string, unknown>): SemanticEdgeRecord {
    return {
      id: String(properties.id),
      documentId: String(properties.documentId),
      sourceChunkId: String(properties.sourceChunkId),
      fromNodeId: String(properties.fromNodeId),
      toNodeId: String(properties.toNodeId),
      edgeType: String(properties.edgeType) as SemanticEdgeRecord['edgeType'],
      fingerprint: String(properties.fingerprint),
      attributes: parseAttributes(properties.attributes),
      state: String(properties.state) as SemanticEdgeRecord['state'],
      governance: parseGovernanceMetadata(properties),
    };
  }

  private fromCacheEntry(properties: Record<string, unknown>): CacheEntryRecord {
    return ensureGovernedCacheEntry({
      id: String(properties.id),
      cacheType: String(properties.cacheType) as CacheEntryRecord['cacheType'],
      summary: String(properties.summary),
      status: String(properties.status) as CacheEntryRecord['status'],
      dependencyRefs: parseDependencyRefs(properties.dependencyRefs),
      updatedAt: toNumber(properties.updatedAt),
      purpose: optionalString(properties.purpose),
      expiresAt: optionalNumber(properties.expiresAt),
      governance: parseGovernanceMetadata(properties),
    });
  }

  private fromFailureMemory(properties: Record<string, unknown>): FailureMemoryRecord {
    return {
      id: String(properties.id),
      projectId: String(properties.projectId),
      createdAt: toNumber(properties.createdAt),
      updatedAt: optionalNumber(properties.updatedAt),
      sourceDocumentId: optionalString(properties.sourceDocumentId),
      sourceChunkId: optionalString(properties.sourceChunkId),
      sourceNodeId: optionalString(properties.sourceNodeId),
      summary: String(properties.summary),
      failureMode: String(properties.failureMode) as FailureMemoryRecord['failureMode'],
      causalVector: optionalString(properties.causalVector),
      negativeConstraint: optionalString(properties.negativeConstraint),
      environmentContext: optionalString(properties.environmentContext),
      remediationStatus: String(properties.remediationStatus) as FailureMemoryRecord['remediationStatus'],
      remediationNotes: optionalString(properties.remediationNotes),
      supersededBy: optionalString(properties.supersededBy),
      governance: parseGovernanceMetadata(properties),
    };
  }

  // CMHL Governance Integration: Public method to record governance events
  async appendGovernanceEvent(event: GovernanceEventRecord): Promise<void> {
    const session = this.getSession();
    try {
      await session.executeWrite((tx) => this.appendGovernanceEventTx(tx, event));
    } finally {
      await session.close();
    }
  }

  private async appendGovernanceEventTx(
    tx: Parameters<Parameters<Session['executeWrite']>[0]>[0],
    event: GovernanceEventRecord,
  ): Promise<void> {
    await tx.run(
      `
        MERGE (event:GovernanceEvent {id: $id})
        SET event.eventType = $eventType,
            event.entityKind = $entityKind,
            event.entityId = $entityId,
            event.policyVersion = $policyVersion,
            event.createdAt = $createdAt,
            event.summary = $summary,
            event.metadata = $metadata
      `,
      {
        ...event,
        metadata: JSON.stringify(event.metadata),
      },
    );
  }
}

const MEMORY_POLICY_FALLBACK_VERSION = '2026-03-15.v1';

function toNumber(value: unknown): number {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }

  return Number(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toNumber(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  return String(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item));
}

function serializeSpan(span: SourceSpan): string {
  return JSON.stringify(span);
}

function parseSpan(value: unknown): SourceSpan {
  if (typeof value !== 'string') {
    return { startLine: 1, endLine: 1, startOffset: 0, endOffset: 0 };
  }

  return JSON.parse(value) as SourceSpan;
}

function parseAttributes(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || value.length === 0) {
    return {};
  }

  return JSON.parse(value) as Record<string, string>;
}

function serializeGovernance(metadata: SourceDocumentRecord['governance']) {
  return {
    governanceState: metadata?.state ?? null,
    epistemicType: metadata?.epistemicType ?? null,
    provenanceComplete: metadata?.provenanceComplete ?? null,
    confidence: metadata ? String(metadata.confidence) : null,
    confidenceProfile: metadata?.confidenceProfile ? JSON.stringify(metadata.confidenceProfile) : null,
    policyVersion: metadata?.policyVersion ?? null,
    governanceRationale: metadata?.rationale ?? null,
  };
}

function parseGovernanceMetadata(properties: Record<string, unknown>) {
  const governanceState = optionalString(properties.governanceState);
  const epistemicType = optionalString(properties.epistemicType);
  const policyVersion = optionalString(properties.policyVersion);

  if (!governanceState || !epistemicType || !policyVersion) {
    return undefined;
  }

  return {
    state: governanceState as NonNullable<SourceDocumentRecord['governance']>['state'],
    epistemicType: epistemicType as NonNullable<SourceDocumentRecord['governance']>['epistemicType'],
    provenanceComplete: Boolean(properties.provenanceComplete),
    confidence: parseConfidence(properties.confidence),
    confidenceProfile: parseConfidenceProfile(properties.confidenceProfile, properties.confidence),
    policyVersion,
    rationale: optionalString(properties.governanceRationale),
  };
}

function parseConfidence(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) {
    return 0.5;
  }

  try {
    const parsed = JSON.parse(value);
    // Handle old 4-field format by averaging
    if (typeof parsed === 'object' && parsed !== null && 'extraction' in parsed) {
      const avg = (parsed.extraction + parsed.grounding + parsed.crossSource + parsed.operational) / 4;
      return Math.max(0, Math.min(1, avg));
    }
    // Handle new single number format
    if (typeof parsed === 'number') {
      return Math.max(0, Math.min(1, parsed));
    }
  } catch {
    // If JSON parsing fails, try direct number conversion
    const num = Number(value);
    if (!isNaN(num)) {
      return Math.max(0, Math.min(1, num));
    }
  }

  return 0.5;
}

function parseConfidenceProfile(profileValue: unknown, fallbackValue: unknown) {
  const fallback = parseConfidence(fallbackValue);
  if (typeof profileValue !== 'string' || profileValue.length === 0) {
    return {
      extraction: fallback,
      grounding: fallback,
      crossSource: fallback,
      operational: fallback,
    };
  }

  try {
    const parsed = JSON.parse(profileValue);
    if (
      typeof parsed === 'object'
      && parsed !== null
      && 'extraction' in parsed
      && 'grounding' in parsed
      && 'crossSource' in parsed
      && 'operational' in parsed
    ) {
      return {
        extraction: parseConfidenceValue(parsed.extraction, fallback),
        grounding: parseConfidenceValue(parsed.grounding, fallback),
        crossSource: parseConfidenceValue(parsed.crossSource, fallback),
        operational: parseConfidenceValue(parsed.operational, fallback),
      };
    }
  } catch {
    // fall through to default profile
  }

  return {
    extraction: fallback,
    grounding: fallback,
    crossSource: fallback,
    operational: fallback,
  };
}

function parseConfidenceValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function serializeDependencyRef(ref: CacheDependencyRef): string {
  return `${ref.kind}:${ref.id}`;
}

function parseDependencyRefs(value: unknown): CacheDependencyRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const [kind, ...rest] = String(item).split(':');
    return {
      kind: kind as CacheDependencyRef['kind'],
      id: rest.join(':'),
    };
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEmbedding(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => Number(item));
}
