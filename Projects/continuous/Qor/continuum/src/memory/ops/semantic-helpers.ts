/**
 * Pure Cypher-builder helpers for semantic-graph ops.
 * No session/transaction handling. Side-effect-free.
 */

export interface CypherSpec {
  readonly cypher: string;
  readonly params: Record<string, unknown>;
}

export interface SemanticNodeInput {
  readonly id: string;
  readonly documentId: string;
  readonly sourceChunkId: string;
  readonly nodeType: string;
  readonly label: string;
  readonly summary: string;
  readonly fingerprint: string;
  readonly attributes: Record<string, string>;
  readonly state: "active" | "tombstoned";
}

export interface SemanticEdgeInput {
  readonly id: string;
  readonly documentId: string;
  readonly sourceChunkId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeType: string;
  readonly fingerprint: string;
  readonly attributes: Record<string, string>;
  readonly state: "active" | "tombstoned";
}

export function buildUpsertSemanticNodesCypher(
  partition: string,
  nodes: SemanticNodeInput[],
): CypherSpec {
  return {
    cypher: `UNWIND $nodes AS n
      MERGE (s:SemanticNode {id: n.id})
      SET s.partition = $partition, s.document_id = n.documentId,
          s.source_chunk_id = n.sourceChunkId, s.node_type = n.nodeType,
          s.label = n.label, s.summary = n.summary, s.fingerprint = n.fingerprint,
          s.attributes = n.attributes, s.state = n.state`,
    params: { partition, nodes },
  };
}

export function buildUpsertSemanticEdgesCypher(
  partition: string,
  edges: SemanticEdgeInput[],
): CypherSpec {
  return {
    cypher: `UNWIND $edges AS e
      MATCH (a:SemanticNode {id: e.fromNodeId}), (b:SemanticNode {id: e.toNodeId})
      MERGE (a)-[r:SEMANTIC_EDGE {id: e.id}]->(b)
      SET r.partition = $partition, r.document_id = e.documentId,
          r.source_chunk_id = e.sourceChunkId, r.edge_type = e.edgeType,
          r.fingerprint = e.fingerprint, r.attributes = e.attributes,
          r.state = e.state`,
    params: { partition, edges },
  };
}

export function buildTombstoneCypher(
  partition: string,
  nodeIds: string[],
): CypherSpec {
  return {
    cypher: `UNWIND $nodeIds AS nid
      MATCH (s:SemanticNode {id: nid}) WHERE s.partition = $partition
      SET s.state = 'tombstoned'`,
    params: { partition, nodeIds },
  };
}

export function buildEdgeTombstoneCypher(
  partition: string,
  edgeIds: string[],
): CypherSpec {
  return {
    cypher: `UNWIND $edgeIds AS eid
      MATCH ()-[r:SEMANTIC_EDGE {id: eid}]->() WHERE r.partition = $partition
      SET r.state = 'tombstoned'`,
    params: { partition, edgeIds },
  };
}
