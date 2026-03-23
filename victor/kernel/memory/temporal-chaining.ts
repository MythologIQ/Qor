/**
 * CMHL Temporal Chaining
 *
 * Implements temporal supersession chains for memory versioning.
 * When a memory is superseded by a newer version, a temporal chain link
 * is created to track the relationship and enable filtering of stale predecessors.
 *
 * @module kernel/memory/temporal-chaining
 * @see task_cmhl_temporal_chaining in phases.json
 */

import type {
  ContradictionRecord,
  GovernanceMetadata,
  SemanticEdgeRecord,
  SemanticNodeRecord,
  TemporalMetadata,
} from './types';

/**
 * Represents a temporal chain link created during supersession.
 */
export interface TemporalChainLink {
  /** The superseding (newer) node ID */
  fromNodeId: string;
  /** The superseded (older) node ID */
  toNodeId: string;
  /** The temporal-supersedes edge connecting them */
  edge: SemanticEdgeRecord;
  /** Timestamp when the supersession occurred */
  supersededAt: number;
}

/**
 * Result of resolving a temporal chain for a set of nodes.
 */
export interface TemporalChainResolution {
  /** Nodes that are current (not superseded or have active superseder) */
  currentNodes: SemanticNodeRecord[];
  /** Nodes that are deprecated (have been superseded) */
  deprecatedNodes: SemanticNodeRecord[];
  /** Chain links connecting current nodes to their predecessors */
  chainLinks: TemporalChainLink[];
  /** IDs of nodes filtered out due to being superseded */
  supersededNodeIds: string[];
}

/**
 * Creates a temporal chain link during supersession handling.
 * Called when a contradiction of kind 'supersession' is detected.
 *
 * @param supersedingNode - The newer node that supersedes
 * @param supersededNode - The older node being superseded
 * @param documentId - Document ID for the edge
 * @param chunkId - Chunk ID for the edge
 * @param now - Current timestamp (for deterministic testing)
 * @returns The created temporal chain link
 */
export function createTemporalChainLink(
  supersedingNode: SemanticNodeRecord,
  supersededNode: SemanticNodeRecord,
  documentId: string,
  chunkId: string,
  now: number = Date.now(),
): TemporalChainLink {
  // Create the temporal-supersedes edge
  const edge: SemanticEdgeRecord = {
    id: generateTemporalEdgeId(supersedingNode.id, supersededNode.id),
    documentId,
    sourceChunkId: chunkId,
    fromNodeId: supersedingNode.id,
    toNodeId: supersededNode.id,
    edgeType: 'temporal-supersedes',
    fingerprint: generateTemporalEdgeFingerprint(supersedingNode.id, supersededNode.id, now),
    attributes: {
      supersededAt: String(now),
      reason: 'temporal-supersession',
    },
    state: 'active',
    governance: createDeprecatedGovernanceMetadata(),
    temporal: createTemporalMetadataForEdge(now),
  };

  // Update superseded node with previousUorId linking to the superseding node
  const updatedSupersededNode: SemanticNodeRecord = {
    ...supersededNode,
    previousUorId: supersedingNode.id,
    governance: {
      ...supersededNode.governance,
      state: 'deprecated',
      rationale: 'Superseded by newer node',
    } as GovernanceMetadata,
  };

  return {
    fromNodeId: supersedingNode.id,
    toNodeId: supersededNode.id,
    edge,
    supersededAt: now,
  };
}

/**
 * Resolves temporal chains for a set of nodes, filtering out superseded predecessors.
 * When a node has been superseded, the older version is excluded from retrieval bundles.
 *
 * @param nodes - All candidate nodes from retrieval
 * @param edges - All edges including temporal-supersedes edges
 * @param now - Current timestamp (for deterministic testing)
 * @returns Resolution with current and deprecated nodes separated
 */
export function resolveTemporalChain(
  nodes: SemanticNodeRecord[],
  edges: SemanticEdgeRecord[],
  now: number = Date.now(),
): TemporalChainResolution {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const supersededNodeIds = new Set<string>();
  const chainLinks: TemporalChainLink[] = [];

  // Find all temporal-supersedes edges and identify superseded nodes
  const temporalEdges = edges.filter(e => e.edgeType === 'temporal-supersedes');

  for (const edge of temporalEdges) {
    const supersedingNode = nodeMap.get(edge.fromNodeId);
    const supersededNode = nodeMap.get(edge.toNodeId);

    if (supersedingNode && supersededNode) {
      supersededNodeIds.add(supersededNode.id);
      chainLinks.push({
        fromNodeId: supersedingNode.id,
        toNodeId: supersededNode.id,
        edge,
        supersededAt: parseInt(edge.attributes.supersededAt || String(now), 10),
      });
    }
  }

  // Separate current nodes from deprecated nodes
  const currentNodes: SemanticNodeRecord[] = [];
  const deprecatedNodes: SemanticNodeRecord[] = [];

  for (const node of nodes) {
    if (supersededNodeIds.has(node.id)) {
      // Ensure deprecated state is set
      deprecatedNodes.push({
        ...node,
        governance: {
          ...node.governance,
          state: 'deprecated',
          rationale: node.governance?.rationale || 'Superseded by newer node',
        } as GovernanceMetadata,
      });
    } else {
      currentNodes.push(node);
    }
  }

  return {
    currentNodes,
    deprecatedNodes,
    chainLinks,
    supersededNodeIds: [...supersededNodeIds],
  };
}

/**
 * Processes contradictions to create temporal chain links for supersession cases.
 * Should be called during contradiction handling in the governance pipeline.
 *
 * @param contradictions - Detected contradictions
 * @param nodes - All nodes in the retrieval bundle
 * @param documentId - Document ID for creating edges
 * @param chunkId - Chunk ID for creating edges
 * @param now - Current timestamp (for deterministic testing)
 * @returns Array of temporal chain links created
 */
export function processSupersessionContradictions(
  contradictions: ContradictionRecord[],
  nodes: SemanticNodeRecord[],
  documentId: string,
  chunkId: string,
  now: number = Date.now(),
): TemporalChainLink[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const chainLinks: TemporalChainLink[] = [];

  for (const contradiction of contradictions) {
    if (contradiction.kind !== 'supersession') {
      continue;
    }

    // For supersession contradictions, the first node is considered the superseder
    // and subsequent nodes are superseded (based on temporal ordering)
    const nodeIds = contradiction.nodeIds;
    if (nodeIds.length < 2) {
      continue;
    }

    // Get nodes sorted by temporal metadata (if available) or assume first is newest
    const contradictionNodes = nodeIds
      .map(id => nodeMap.get(id))
      .filter((n): n is SemanticNodeRecord => !!n)
      .sort((a, b) => {
        // Sort by t0 descending (newest first), fallback to 0 if no temporal
        const t0a = a.temporal?.t0 ?? 0;
        const t0b = b.temporal?.t0 ?? 0;
        return t0b - t0a;
      });

    if (contradictionNodes.length < 2) {
      continue;
    }

    // The newest node supersedes the older ones
    const supersedingNode = contradictionNodes[0];
    for (let i = 1; i < contradictionNodes.length; i++) {
      const supersededNode = contradictionNodes[i];
      const link = createTemporalChainLink(
        supersedingNode,
        supersededNode,
        documentId,
        chunkId,
        now,
      );
      chainLinks.push(link);
    }
  }

  return chainLinks;
}

/**
 * Filters a list of nodes to exclude superseded predecessors.
 * Convenience wrapper around resolveTemporalChain.
 *
 * @param nodes - Candidate nodes
 * @param edges - All edges including temporal-supersedes
 * @param now - Current timestamp (for deterministic testing)
 * @returns Filtered list of current (non-superseded) nodes
 */
export function filterSupersededNodes(
  nodes: SemanticNodeRecord[],
  edges: SemanticEdgeRecord[],
  now: number = Date.now(),
): SemanticNodeRecord[] {
  const resolution = resolveTemporalChain(nodes, edges, now);
  return resolution.currentNodes;
}

// Helper functions

function generateTemporalEdgeId(fromNodeId: string, toNodeId: string): string {
  return `temporal-${fromNodeId}-${toNodeId}`;
}

function generateTemporalEdgeFingerprint(fromNodeId: string, toNodeId: string, now: number): string {
  // Simple hash for deterministic fingerprinting
  return `fp-${fromNodeId.slice(0, 8)}-${toNodeId.slice(0, 8)}-${now}`;
}

function createDeprecatedGovernanceMetadata(): GovernanceMetadata {
  return {
    state: 'deprecated',
    epistemicType: 'inferred-relation',
    provenanceComplete: true,
    confidence: 0.9,
    policyVersion: 'cmhl-temporal-v1',
    rationale: 'Temporal supersession chain edge',
  };
}

function createTemporalMetadataForEdge(now: number): TemporalMetadata {
  return {
    t0: now,
    w0: 1.0,
    lambda: 0, // Permanent - temporal chain edges don't decay
    decayProfile: 'permanent',
    restakeCount: 0,
  };
}
