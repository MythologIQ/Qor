/**
 * Memory Traversal and Forgetting — Governed Graph Operations
 *
 * Provides association traversal and deliberate forgetting so operators
 * can inspect or remove memory with explicit graph semantics instead of
 * brittle data surgery. All operations are auditable through governance events.
 *
 * @module Victor/kernel/memory/memory-traversal-forget
 */

import type {
  SemanticNodeRecord,
  SemanticEdgeRecord,
  GraphNeighborhood,
  GovernanceEventRecord,
  GovernanceState,
} from './types.js';

// ============================================================================
// Traversal Types
// ============================================================================

export interface TraversalOptions {
  /** Maximum depth for traversal (hops) */
  maxDepth?: number;
  /** Edge types to follow (empty = all) */
  edgeTypes?: SemanticEdgeRecord['edgeType'][];
  /** Include tombstoned nodes in results */
  includeTombstoned?: boolean;
  /** Stop traversal at these node types */
  stopAtNodeTypes?: SemanticNodeRecord['nodeType'][];
  /** Maximum total nodes to return */
  maxNodes?: number;
}

export interface TraversalResult {
  /** Starting node */
  rootNode: SemanticNodeRecord | null;
  /** Nodes found during traversal */
  nodes: SemanticNodeRecord[];
  /** Edges traversed */
  edges: SemanticEdgeRecord[];
  /** Depth reached (hops from root) */
  depthReached: number;
  /** Nodes at each depth level */
  nodesByDepth: Map<number, SemanticNodeRecord[]>;
}

export interface AssociationPath {
  /** Ordered list of nodes from start to target */
  nodes: SemanticNodeRecord[];
  /** Edges connecting the nodes (length = nodes.length - 1) */
  edges: SemanticEdgeRecord[];
  /** Total path length (sum of edge weights, default 1 per edge) */
  pathLength: number;
}

// ============================================================================
// Forgetting Types
// ============================================================================

export interface ForgetOperation {
  /** Node IDs to forget */
  nodeIds: string[];
  /** Also remove connected edges */
  cascadeEdges?: boolean;
  /** Promote superseding nodes if temporal-supersedes exists */
  promoteSuperseding?: boolean;
  /** Reason for forgetting */
  reason: string;
  /** Operation initiator identifier */
  initiatedBy: string;
}

export interface ForgetResult {
  /** Nodes successfully forgotten (tombstoned) */
  forgottenNodes: string[];
  /** Edges removed or tombstoned */
  affectedEdges: string[];
  /** Nodes that were promoted as replacements */
  promotedNodes: string[];
  /** Nodes not found or already forgotten */
  notFound: string[];
  /** Governance events recorded */
  auditEvents: GovernanceEventRecord[];
  /** Whether operation succeeded */
  success: boolean;
}

export interface ForgetPreview {
  /** Nodes that would be forgotten */
  targetNodes: SemanticNodeRecord[];
  /** Edges that would be affected */
  affectedEdges: SemanticEdgeRecord[];
  /** Nodes that would be promoted */
  promotedNodes: SemanticNodeRecord[];
  /** Connected nodes that would remain but lose edges */
  orphanedNodes: SemanticNodeRecord[];
  /** Estimated impact summary */
  impactSummary: string;
}

// ============================================================================
// Audit Types
// ============================================================================

export interface TraversalAuditRecord {
  type: 'traversal';
  timestamp: number;
  rootNodeId: string;
  options: TraversalOptions;
  nodesFound: number;
  edgesTraversed: number;
  depthReached: number;
}

export interface ForgetAuditRecord {
  type: 'forget';
  timestamp: number;
  nodeIds: string[];
  forgottenCount: number;
  edgeCount: number;
  reason: string;
  initiatedBy: string;
}

export type GraphOperationAudit = TraversalAuditRecord | ForgetAuditRecord;

// ============================================================================
// In-Memory Graph Storage (for traversal operations)
// ============================================================================

const nodeStore = new Map<string, SemanticNodeRecord>();
const edgeStore = new Map<string, SemanticEdgeRecord>();
const auditLog: GraphOperationAudit[] = [];

// ============================================================================
// Graph Population (internal - mirrors from other stores)
// ============================================================================

export function registerNode(node: SemanticNodeRecord): void {
  nodeStore.set(node.id, { ...node });
}

export function registerEdge(edge: SemanticEdgeRecord): void {
  edgeStore.set(edge.id, { ...edge });
}

export function clearGraph(): void {
  nodeStore.clear();
  edgeStore.clear();
  auditLog.length = 0;
}

export function getRegisteredNodeCount(): number {
  return nodeStore.size;
}

export function getRegisteredEdgeCount(): number {
  return edgeStore.size;
}

// ============================================================================
// Traversal Operations
// ============================================================================

/**
 * Traverse the graph starting from a root node, following edges to find
 * related memories. Respects governance state and edge types.
 *
 * @param rootNodeId - Starting node ID
 * @param options - Traversal configuration
 * @returns Traversal result with nodes, edges, and depth information
 */
export function traverseFromNode(
  rootNodeId: string,
  options: TraversalOptions = {}
): TraversalResult {
  const {
    maxDepth = 3,
    edgeTypes = [],
    includeTombstoned = false,
    stopAtNodeTypes = [],
    maxNodes = 100,
  } = options;

  const rootNode = nodeStore.get(rootNodeId) || null;

  if (!rootNode) {
    return {
      rootNode: null,
      nodes: [],
      edges: [],
      depthReached: 0,
      nodesByDepth: new Map(),
    };
  }

  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const nodesByDepth = new Map<number, SemanticNodeRecord[]>();
  const resultNodes: SemanticNodeRecord[] = [];
  const resultEdges: SemanticEdgeRecord[] = [];

  // BFS queue: [nodeId, depth]
  const queue: Array<[string, number]> = [[rootNodeId, 0]];
  visitedNodes.add(rootNodeId);
  nodesByDepth.set(0, [rootNode]);

  let depthReached = 0;

  while (queue.length > 0 && resultNodes.length < maxNodes) {
    const [currentId, depth] = queue.shift()!;
    depthReached = Math.max(depthReached, depth);

    if (depth >= maxDepth) continue;

    const currentNode = nodeStore.get(currentId);
    if (!currentNode) continue;

    // Check stop condition
    if (stopAtNodeTypes.includes(currentNode.nodeType)) {
      continue;
    }

    // Find outgoing edges
    for (const edge of edgeStore.values()) {
      if (edge.fromNodeId !== currentId) continue;
      if (!includeTombstoned && edge.state === 'tombstoned') continue;
      if (edgeTypes.length > 0 && !edgeTypes.includes(edge.edgeType)) continue;

      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        resultEdges.push(edge);
      }

      const targetId = edge.toNodeId;
      if (!visitedNodes.has(targetId)) {
        const targetNode = nodeStore.get(targetId);
        if (!targetNode) continue;
        if (!includeTombstoned && targetNode.state === 'tombstoned') continue;

        visitedNodes.add(targetId);
        resultNodes.push(targetNode);

        const nextDepth = depth + 1;
        const depthNodes = nodesByDepth.get(nextDepth) || [];
        depthNodes.push(targetNode);
        nodesByDepth.set(nextDepth, depthNodes);

        queue.push([targetId, nextDepth]);

        if (resultNodes.length >= maxNodes) break;
      }
    }
  }

  // Record audit
  const auditRecord: TraversalAuditRecord = {
    type: 'traversal',
    timestamp: Date.now(),
    rootNodeId,
    options: { ...options },
    nodesFound: resultNodes.length,
    edgesTraversed: resultEdges.length,
    depthReached,
  };
  auditLog.push(auditRecord);

  return {
    rootNode,
    nodes: resultNodes,
    edges: resultEdges,
    depthReached,
    nodesByDepth,
  };
}

/**
 * Find all paths between two nodes using breadth-first search.
 * Returns shortest paths first (limited to first 10).
 *
 * @param startNodeId - Starting node ID
 * @param targetNodeId - Target node ID
 * @param options - Traversal constraints
 * @returns Array of paths from start to target
 */
export function findPathsBetweenNodes(
  startNodeId: string,
  targetNodeId: string,
  options: TraversalOptions = {}
): AssociationPath[] {
  const { maxDepth = 5, edgeTypes = [], includeTombstoned = false } = options;

  const startNode = nodeStore.get(startNodeId);
  const targetNode = nodeStore.get(targetNodeId);

  if (!startNode || !targetNode) {
    return [];
  }

  const paths: AssociationPath[] = [];
  const maxPaths = 10;

  // BFS with path tracking
  // Queue items: [currentNodeId, pathNodes, pathEdges, depth]
  const queue: Array<[string, SemanticNodeRecord[], SemanticEdgeRecord[], number]> = [
    [startNodeId, [startNode], [], 0],
  ];

  const visitedAtDepth = new Map<string, number>();

  while (queue.length > 0 && paths.length < maxPaths) {
    const [currentId, pathNodes, pathEdges, depth] = queue.shift()!;

    if (currentId === targetNodeId && pathNodes.length > 1) {
      paths.push({
        nodes: [...pathNodes],
        edges: [...pathEdges],
        pathLength: pathEdges.length,
      });
      continue;
    }

    if (depth >= maxDepth) continue;

    // Avoid cycles - only visit if we haven't been here at this or lower depth
    const visitedDepth = visitedAtDepth.get(currentId);
    if (visitedDepth !== undefined && visitedDepth <= depth) {
      continue;
    }
    visitedAtDepth.set(currentId, depth);

    // Find outgoing edges
    for (const edge of edgeStore.values()) {
      if (edge.fromNodeId !== currentId) continue;
      if (!includeTombstoned && edge.state === 'tombstoned') continue;
      if (edgeTypes.length > 0 && !edgeTypes.includes(edge.edgeType)) continue;

      const targetId = edge.toNodeId;
      const targetNode = nodeStore.get(targetId);
      if (!targetNode) continue;
      if (!includeTombstoned && targetNode.state === 'tombstoned') continue;

      queue.push([
        targetId,
        [...pathNodes, targetNode],
        [...pathEdges, edge],
        depth + 1,
      ]);
    }
  }

  return paths;
}

/**
 * Get the immediate neighborhood of a node (1-hop traversal).
 *
 * @param nodeId - Center node ID
 * @param includeTombstoned - Include tombstoned neighbors
 * @returns Graph neighborhood with nodes and edges
 */
export function getNeighborhood(
  nodeId: string,
  includeTombstoned: boolean = false
): GraphNeighborhood {
  const result = traverseFromNode(nodeId, {
    maxDepth: 1,
    includeTombstoned,
  });

  return {
    nodes: result.nodes,
    edges: result.edges,
  };
}

/**
 * Find all nodes connected to a given node through any path,
 * up to a maximum depth.
 *
 * @param nodeId - Starting node ID
 * @param maxDepth - Maximum traversal depth
 * @returns All connected nodes
 */
export function findConnectedNodes(
  nodeId: string,
  maxDepth: number = 3
): SemanticNodeRecord[] {
  const result = traverseFromNode(nodeId, { maxDepth });
  return result.nodes;
}

// ============================================================================
// Forgetting Operations
// ============================================================================

/**
 * Preview the effects of a forget operation without executing it.
 * Shows what would be forgotten, affected edges, and promoted nodes.
 *
 * @param operation - Proposed forget operation
 * @returns Preview of effects
 */
export function previewForgetOperation(operation: ForgetOperation): ForgetPreview {
  const { nodeIds, cascadeEdges = true, promoteSuperseding = true } = operation;

  const targetNodes: SemanticNodeRecord[] = [];
  const affectedEdges: SemanticEdgeRecord[] = [];
  const promotedNodes: SemanticNodeRecord[] = [];
  const orphanedNodesSet = new Set<string>();

  for (const nodeId of nodeIds) {
    const node = nodeStore.get(nodeId);
    if (!node || node.state === 'tombstoned') continue;

    targetNodes.push(node);

    // Find edges that would be affected
    for (const edge of edgeStore.values()) {
      if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
        if (edge.state !== 'tombstoned') {
          affectedEdges.push(edge);

          // Track orphaned nodes
          const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
          if (!nodeIds.includes(otherId)) {
            orphanedNodesSet.add(otherId);
          }
        }
      }
    }

    // Check for superseding relationships
    if (promoteSuperseding) {
      for (const edge of edgeStore.values()) {
        if (edge.toNodeId === nodeId && edge.edgeType === 'temporal-supersedes') {
          const supersedingNode = nodeStore.get(edge.fromNodeId);
          if (supersedingNode && supersedingNode.state !== 'tombstoned') {
            promotedNodes.push(supersedingNode);
          }
        }
      }
    }
  }

  // Resolve orphaned nodes
  const orphanedNodes: SemanticNodeRecord[] = [];
  for (const orphanedId of orphanedNodesSet) {
    const node = nodeStore.get(orphanedId);
    if (node && node.state !== 'tombstoned') {
      orphanedNodes.push(node);
    }
  }

  // Build impact summary
  const parts: string[] = [];
  parts.push(`Would forget ${targetNodes.length} node(s)`);
  if (cascadeEdges) {
    parts.push(`affect ${affectedEdges.length} edge(s)`);
  }
  if (promotedNodes.length > 0) {
    parts.push(`promote ${promotedNodes.length} superseding node(s)`);
  }
  if (orphanedNodes.length > 0) {
    parts.push(`leave ${orphanedNodes.length} node(s) orphaned`);
  }

  return {
    targetNodes,
    affectedEdges,
    promotedNodes,
    orphanedNodes,
    impactSummary: parts.join(', '),
  };
}

/**
 * Execute a forget operation: tombstone nodes and optionally cascade to edges.
 * Records audit events for all changes.
 *
 * @param operation - Forget operation specification
 * @returns Result with affected entities and audit events
 */
export function executeForgetOperation(operation: ForgetOperation): ForgetResult {
  const { nodeIds, cascadeEdges = true, promoteSuperseding = true, reason, initiatedBy } = operation;

  const forgottenNodes: string[] = [];
  const affectedEdges: string[] = [];
  const promotedNodes: string[] = [];
  const notFound: string[] = [];
  const auditEvents: GovernanceEventRecord[] = [];

  for (const nodeId of nodeIds) {
    const node = nodeStore.get(nodeId);
    if (!node) {
      notFound.push(nodeId);
      continue;
    }

    if (node.state === 'tombstoned') {
      notFound.push(nodeId);
      continue;
    }

    // Tombstone the node
    node.state = 'tombstoned';
    node.governance = {
      ...node.governance,
      state: 'deprecated',
    };
    forgottenNodes.push(nodeId);

    // Record governance event
    const forgetEvent: GovernanceEventRecord = {
      id: generateEventId(),
      eventType: 'ingest-completed', // Using closest existing type
      entityKind: 'semantic-node',
      entityId: nodeId,
      policyVersion: '1.0.0',
      createdAt: Date.now(),
      summary: `Node forgotten: ${reason}`,
      metadata: {
        initiatedBy,
        cascadeEdges: String(cascadeEdges),
        previousState: node.state,
      },
    };
    auditEvents.push(forgetEvent);

    // Handle superseding promotion
    if (promoteSuperseding) {
      for (const edge of edgeStore.values()) {
        if (edge.toNodeId === nodeId && edge.edgeType === 'temporal-supersedes') {
          const supersedingNode = nodeStore.get(edge.fromNodeId);
          if (supersedingNode && supersedingNode.state !== 'tombstoned') {
            // Promote by updating governance
            supersedingNode.governance = {
              ...supersedingNode.governance,
              state: 'durable',
            };
            promotedNodes.push(edge.fromNodeId);

            const promoteEvent: GovernanceEventRecord = {
              id: generateEventId(),
              eventType: 'promotion-approved',
              entityKind: 'semantic-node',
              entityId: edge.fromNodeId,
              policyVersion: '1.0.0',
              createdAt: Date.now(),
              summary: `Node promoted to replace forgotten node ${nodeId}`,
              metadata: {
                supersededNodeId: nodeId,
                initiatedBy,
              },
            };
            auditEvents.push(promoteEvent);
          }
        }
      }
    }

    // Cascade to edges
    if (cascadeEdges) {
      for (const edge of edgeStore.values()) {
        if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
          if (edge.state !== 'tombstoned') {
            edge.state = 'tombstoned';
            affectedEdges.push(edge.id);

            const edgeEvent: GovernanceEventRecord = {
              id: generateEventId(),
              eventType: 'ingest-completed',
              entityKind: 'semantic-edge',
              entityId: edge.id,
              policyVersion: '1.0.0',
              createdAt: Date.now(),
              summary: `Edge tombstoned due to node ${nodeId} forget operation`,
              metadata: {
                relatedNodeId: nodeId,
                initiatedBy,
              },
            };
            auditEvents.push(edgeEvent);
          }
        }
      }
    }
  }

  // Record forget audit
  const forgetAudit: ForgetAuditRecord = {
    type: 'forget',
    timestamp: Date.now(),
    nodeIds: forgottenNodes,
    forgottenCount: forgottenNodes.length,
    edgeCount: affectedEdges.length,
    reason,
    initiatedBy,
  };
  auditLog.push(forgetAudit);

  return {
    forgottenNodes,
    affectedEdges,
    promotedNodes,
    notFound,
    auditEvents,
    success: forgottenNodes.length > 0,
  };
}

/**
 * Forget a single node by ID with default options.
 *
 * @param nodeId - Node to forget
 * @param reason - Reason for forgetting
 * @param initiatedBy - Initiator identifier
 * @returns Forget result
 */
export function forgetNode(
  nodeId: string,
  reason: string,
  initiatedBy: string
): ForgetResult {
  return executeForgetOperation({
    nodeIds: [nodeId],
    cascadeEdges: true,
    promoteSuperseding: true,
    reason,
    initiatedBy,
  });
}

/**
 * Batch forget multiple nodes.
 *
 * @param nodeIds - Nodes to forget
 * @param reason - Reason for forgetting
 * @param initiatedBy - Initiator identifier
 * @returns Combined forget result
 */
export function forgetNodesBatch(
  nodeIds: string[],
  reason: string,
  initiatedBy: string
): ForgetResult {
  return executeForgetOperation({
    nodeIds,
    cascadeEdges: true,
    promoteSuperseding: true,
    reason,
    initiatedBy,
  });
}

// ============================================================================
// Audit and Inspection
// ============================================================================

/**
 * Get all audit records for graph operations.
 *
 * @param type - Optional filter by operation type
 * @returns Array of audit records
 */
export function getGraphOperationAuditLog(type?: 'traversal' | 'forget'): GraphOperationAudit[] {
  if (type) {
    return auditLog.filter(r => r.type === type);
  }
  return [...auditLog];
}

/**
 * Get the last N audit records.
 *
 * @param count - Number of records to return
 * @returns Recent audit records
 */
export function getRecentAuditRecords(count: number = 10): GraphOperationAudit[] {
  return auditLog.slice(-count);
}

/**
 * Format a traversal result for display.
 *
 * @param result - Traversal result to format
 * @returns Formatted string representation
 */
export function formatTraversalResult(result: TraversalResult): string {
  const lines: string[] = [];

  if (!result.rootNode) {
    return 'Traversal failed: root node not found';
  }

  lines.push(`Traversal from: ${result.rootNode.label} (${result.rootNode.id})`);
  lines.push(`Depth reached: ${result.depthReached}`);
  lines.push(`Nodes found: ${result.nodes.length}`);
  lines.push(`Edges traversed: ${result.edges.length}`);
  lines.push('');

  for (let depth = 1; depth <= result.depthReached; depth++) {
    const nodesAtDepth = result.nodesByDepth.get(depth) || [];
    if (nodesAtDepth.length === 0) continue;

    lines.push(`Depth ${depth}:`);
    for (const node of nodesAtDepth) {
      const incomingEdges = result.edges.filter(e => e.toNodeId === node.id);
      const edgeTypes = [...new Set(incomingEdges.map(e => e.edgeType))];
      lines.push(`  - ${node.label} [${node.nodeType}] via ${edgeTypes.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a forget result for display.
 *
 * @param result - Forget result to format
 * @returns Formatted string representation
 */
export function formatForgetResult(result: ForgetResult): string {
  const lines: string[] = [];

  lines.push(`Forget Operation: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push(`Nodes forgotten: ${result.forgottenNodes.length}`);
  lines.push(`Edges affected: ${result.affectedEdges.length}`);
  lines.push(`Nodes promoted: ${result.promotedNodes.length}`);

  if (result.notFound.length > 0) {
    lines.push(`Not found/already forgotten: ${result.notFound.length}`);
  }

  if (result.auditEvents.length > 0) {
    lines.push(`\nAudit events recorded: ${result.auditEvents.length}`);
    for (const event of result.auditEvents.slice(0, 5)) {
      lines.push(`  - ${event.eventType}: ${event.summary.substring(0, 50)}`);
    }
    if (result.auditEvents.length > 5) {
      lines.push(`  ... and ${result.auditEvents.length - 5} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Get graph statistics for inspection.
 *
 * @returns Graph statistics
 */
export function getGraphStatistics(): {
  totalNodes: number;
  activeNodes: number;
  tombstonedNodes: number;
  totalEdges: number;
  activeEdges: number;
  tombstonedEdges: number;
  byNodeType: Record<string, number>;
  byEdgeType: Record<string, number>;
} {
  const byNodeType: Record<string, number> = {};
  const byEdgeType: Record<string, number> = {};

  let activeNodes = 0;
  let tombstonedNodes = 0;

  for (const node of nodeStore.values()) {
    byNodeType[node.nodeType] = (byNodeType[node.nodeType] || 0) + 1;
    if (node.state === 'active') {
      activeNodes++;
    } else {
      tombstonedNodes++;
    }
  }

  let activeEdges = 0;
  let tombstonedEdges = 0;

  for (const edge of edgeStore.values()) {
    byEdgeType[edge.edgeType] = (byEdgeType[edge.edgeType] || 0) + 1;
    if (edge.state === 'active') {
      activeEdges++;
    } else {
      tombstonedEdges++;
    }
  }

  return {
    totalNodes: nodeStore.size,
    activeNodes,
    tombstonedNodes,
    totalEdges: edgeStore.size,
    activeEdges,
    tombstonedEdges,
    byNodeType,
    byEdgeType,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if a node is eligible for forgetting (exists and not already forgotten).
 *
 * @param nodeId - Node ID to check
 * @returns Eligibility status with reason
 */
export function checkForgetEligibility(nodeId: string): {
  eligible: boolean;
  reason: string;
  currentState?: GovernanceState;
} {
  const node = nodeStore.get(nodeId);

  if (!node) {
    return { eligible: false, reason: 'Node not found' };
  }

  if (node.state === 'tombstoned') {
    return {
      eligible: false,
      reason: 'Node already forgotten (tombstoned)',
      currentState: node.governance?.state,
    };
  }

  return {
    eligible: true,
    reason: 'Node is active and can be forgotten',
    currentState: node.governance?.state,
  };
}
