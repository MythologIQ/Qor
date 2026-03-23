/**
 * Memory Traversal and Forgetting Tests
 *
 * @module Victor/kernel/memory/memory-traversal-forget.test
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { SemanticNodeRecord, SemanticEdgeRecord } from './types.js';
import {
  // Registration
  registerNode,
  registerEdge,
  clearGraph,
  getRegisteredNodeCount,
  getRegisteredEdgeCount,

  // Traversal
  traverseFromNode,
  findPathsBetweenNodes,
  getNeighborhood,
  findConnectedNodes,

  // Forgetting
  previewForgetOperation,
  executeForgetOperation,
  forgetNode,
  forgetNodesBatch,

  // Audit
  getGraphOperationAuditLog,
  getRecentAuditRecords,
  formatTraversalResult,
  formatForgetResult,
  getGraphStatistics,
  checkForgetEligibility,

  // Types
  type TraversalOptions,
  type ForgetOperation,
} from './memory-traversal-forget.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestNode(
  id: string,
  label: string,
  nodeType: SemanticNodeRecord['nodeType'] = 'Task',
  state: 'active' | 'tombstoned' = 'active'
): SemanticNodeRecord {
  return {
    id,
    documentId: 'doc_test',
    sourceChunkId: 'chunk_test',
    nodeType,
    label,
    summary: `Summary of ${label}`,
    fingerprint: `fp_${id}`,
    span: { startLine: 1, endLine: 1, startOffset: 0, endOffset: 10 },
    attributes: {},
    state,
    governance: {
      state: state === 'active' ? 'provisional' : 'deprecated',
      epistemicType: 'observation',
      provenanceComplete: true,
      confidence: 0.7,
      policyVersion: '1.0.0',
    },
  };
}

function createTestEdge(
  id: string,
  fromId: string,
  toId: string,
  edgeType: SemanticEdgeRecord['edgeType'] = 'depends-on',
  state: 'active' | 'tombstoned' = 'active'
): SemanticEdgeRecord {
  return {
    id,
    documentId: 'doc_test',
    sourceChunkId: 'chunk_test',
    fromNodeId: fromId,
    toNodeId: toId,
    edgeType,
    fingerprint: `fp_${id}`,
    attributes: {},
    state,
    governance: {
      state: state === 'active' ? 'provisional' : 'deprecated',
      epistemicType: 'inferred-relation',
      provenanceComplete: true,
      confidence: 0.6,
      policyVersion: '1.0.0',
    },
  };
}

// ============================================================================
// Setup
// ============================================================================

describe('Memory Traversal and Forgetting', () => {
  beforeEach(() => {
    clearGraph();
  });

  // ==========================================================================
  // Registration Tests
  // ==========================================================================

  describe('Registration', () => {
    it('should register nodes', () => {
      const node = createTestNode('node_1', 'Test Node');
      registerNode(node);

      expect(getRegisteredNodeCount()).toBe(1);
    });

    it('should register edges', () => {
      const node1 = createTestNode('node_1', 'Node 1');
      const node2 = createTestNode('node_2', 'Node 2');
      registerNode(node1);
      registerNode(node2);

      const edge = createTestEdge('edge_1', 'node_1', 'node_2');
      registerEdge(edge);

      expect(getRegisteredEdgeCount()).toBe(1);
    });

    it('should clear all registrations', () => {
      registerNode(createTestNode('node_1', 'Node 1'));
      registerEdge(createTestEdge('edge_1', 'node_1', 'node_2'));

      clearGraph();

      expect(getRegisteredNodeCount()).toBe(0);
      expect(getRegisteredEdgeCount()).toBe(0);
    });
  });

  // ==========================================================================
  // Traversal Tests
  // ==========================================================================

  describe('Traversal', () => {
    beforeEach(() => {
      // Create a simple graph:
      // A -> B -> C
      // A -> D
      // B -> E
      registerNode(createTestNode('A', 'Node A', 'Project'));
      registerNode(createTestNode('B', 'Node B', 'Goal'));
      registerNode(createTestNode('C', 'Node C', 'Task'));
      registerNode(createTestNode('D', 'Node D', 'Task'));
      registerNode(createTestNode('E', 'Node E', 'Task'));

      registerEdge(createTestEdge('e1', 'A', 'B', 'depends-on'));
      registerEdge(createTestEdge('e2', 'B', 'C', 'depends-on'));
      registerEdge(createTestEdge('e3', 'A', 'D', 'supports'));
      registerEdge(createTestEdge('e4', 'B', 'E', 'relates-to'));
    });

    it('should traverse from root node', () => {
      const result = traverseFromNode('A');

      expect(result.rootNode).not.toBeNull();
      expect(result.rootNode!.id).toBe('A');
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.depthReached).toBeGreaterThanOrEqual(1);
    });

    it('should respect max depth option', () => {
      const resultDepth1 = traverseFromNode('A', { maxDepth: 1 });
      expect(resultDepth1.depthReached).toBe(1);
      expect(resultDepth1.nodes.length).toBe(2); // B and D

      const resultDepth2 = traverseFromNode('A', { maxDepth: 2 });
      expect(resultDepth2.depthReached).toBe(2);
      expect(resultDepth2.nodes.length).toBe(4); // B, D, C, E
    });

    it('should filter by edge type', () => {
      const result = traverseFromNode('A', {
        edgeTypes: ['supports'],
        maxDepth: 2,
      });

      expect(result.nodes.length).toBe(1); // Only D
      expect(result.nodes[0].id).toBe('D');
    });

    it('should exclude tombstoned nodes by default', () => {
      // Tombstone node B
      const nodeB = createTestNode('B', 'Node B', 'Goal', 'tombstoned');
      registerNode(nodeB);

      const result = traverseFromNode('A');
      const nodeIds = result.nodes.map(n => n.id);

      expect(nodeIds).not.toContain('B');
    });

    it('should include tombstoned nodes when requested', () => {
      const nodeB = createTestNode('B', 'Node B', 'Goal', 'tombstoned');
      registerNode(nodeB);

      const result = traverseFromNode('A', { includeTombstoned: true });
      const nodeIds = result.nodes.map(n => n.id);

      expect(nodeIds).toContain('B');
    });

    it('should return empty result for non-existent root', () => {
      const result = traverseFromNode('NONEXISTENT');

      expect(result.rootNode).toBeNull();
      expect(result.nodes.length).toBe(0);
    });

    it('should track nodes by depth', () => {
      const result = traverseFromNode('A', { maxDepth: 2 });

      expect(result.nodesByDepth.has(1)).toBe(true);
      expect(result.nodesByDepth.has(2)).toBe(true);
      expect(result.nodesByDepth.get(1)!.length).toBe(2); // B, D
      expect(result.nodesByDepth.get(2)!.length).toBe(2); // C, E
    });

    it('should respect maxNodes limit', () => {
      const result = traverseFromNode('A', { maxNodes: 2 });

      expect(result.nodes.length).toBeLessThanOrEqual(2);
    });

    it('should stop at specified node types', () => {
      const result = traverseFromNode('A', {
        stopAtNodeTypes: ['Goal'],
        maxDepth: 3,
      });

      // Should traverse to B (Goal) but not past it
      const nodeIds = result.nodes.map(n => n.id);
      expect(nodeIds).toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).not.toContain('E');
    });

    it('should record traversal in audit log', () => {
      traverseFromNode('A', { maxDepth: 2 });

      const auditLog = getGraphOperationAuditLog('traversal');
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].type).toBe('traversal');
      expect(auditLog[0].rootNodeId).toBe('A');
    });
  });

  // ==========================================================================
  // Path Finding Tests
  // ==========================================================================

  describe('Path Finding', () => {
    beforeEach(() => {
      // Create graph with multiple paths:
      // A -> B -> C
      // A -> D -> C
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B'));
      registerNode(createTestNode('C', 'Node C'));
      registerNode(createTestNode('D', 'Node D'));

      registerEdge(createTestEdge('e1', 'A', 'B'));
      registerEdge(createTestEdge('e2', 'B', 'C'));
      registerEdge(createTestEdge('e3', 'A', 'D'));
      registerEdge(createTestEdge('e4', 'D', 'C'));
    });

    it('should find paths between nodes', () => {
      const paths = findPathsBetweenNodes('A', 'C');

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0].nodes.length).toBeGreaterThan(1);
      expect(paths[0].nodes[0].id).toBe('A');
      expect(paths[0].nodes[paths[0].nodes.length - 1].id).toBe('C');
    });

    it('should find shortest paths first', () => {
      const paths = findPathsBetweenNodes('A', 'C');

      expect(paths.length).toBe(2);
      expect(paths[0].pathLength).toBe(2); // A -> B -> C
      expect(paths[1].pathLength).toBe(2); // A -> D -> C
    });

    it('should return empty for non-existent nodes', () => {
      const paths = findPathsBetweenNodes('A', 'NONEXISTENT');
      expect(paths.length).toBe(0);
    });

    it('should respect max depth', () => {
      // Create longer path: A -> B -> C -> D
      registerNode(createTestNode('D', 'Node D'));
      registerEdge(createTestEdge('e5', 'C', 'D'));

      // Note: A -> D already exists from beforeEach, so direct path is depth 1
      const pathsWithLimit = findPathsBetweenNodes('A', 'D', { maxDepth: 2 });
      expect(pathsWithLimit.length).toBe(1); // Direct A->D path only

      const pathsWithHigherLimit = findPathsBetweenNodes('A', 'D', { maxDepth: 3 });
      expect(pathsWithHigherLimit.length).toBe(2); // Direct A->D + A->B->C->D
    });

    it('should handle cycles without infinite loops', () => {
      // Create cycle: A -> B -> A
      registerEdge(createTestEdge('e_cycle', 'B', 'A'));

      const paths = findPathsBetweenNodes('A', 'B');
      expect(paths.length).toBe(1);
      expect(paths[0].nodes.length).toBe(2);
    });
  });

  // ==========================================================================
  // Neighborhood Tests
  // ==========================================================================

  describe('Neighborhood', () => {
    beforeEach(() => {
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B'));
      registerNode(createTestNode('C', 'Node C'));

      registerEdge(createTestEdge('e1', 'A', 'B'));
      registerEdge(createTestEdge('e2', 'A', 'C'));
    });

    it('should get immediate neighborhood', () => {
      const neighborhood = getNeighborhood('A');

      expect(neighborhood.nodes.length).toBe(2);
      expect(neighborhood.edges.length).toBe(2);
    });

    it('should exclude tombstoned neighbors by default', () => {
      registerNode(createTestNode('D', 'Node D', 'Task', 'tombstoned'));
      registerEdge(createTestEdge('e3', 'A', 'D'));

      const neighborhood = getNeighborhood('A');
      const nodeIds = neighborhood.nodes.map(n => n.id);

      expect(nodeIds).not.toContain('D');
    });
  });

  // ==========================================================================
  // Forget Preview Tests
  // ==========================================================================

  describe('Forget Preview', () => {
    beforeEach(() => {
      // Create graph for forget testing:
      // A -> B -> C (temporal chain: C supersedes B)
      // A -> D
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B'));
      registerNode(createTestNode('C', 'Node C'));
      registerNode(createTestNode('D', 'Node D'));

      registerEdge(createTestEdge('e1', 'A', 'B'));
      registerEdge(createTestEdge('e2', 'B', 'C'));
      registerEdge(createTestEdge('e3', 'A', 'D'));
      registerEdge(createTestEdge('e_super', 'C', 'B', 'temporal-supersedes'));
    });

    it('should preview forget effects', () => {
      const preview = previewForgetOperation({
        nodeIds: ['B'],
        cascadeEdges: true,
        promoteSuperseding: true,
        reason: 'Test preview',
        initiatedBy: 'test',
      });

      expect(preview.targetNodes.length).toBe(1);
      expect(preview.targetNodes[0].id).toBe('B');
      expect(preview.affectedEdges.length).toBeGreaterThan(0);
    });

    it('should identify promoted nodes', () => {
      const preview = previewForgetOperation({
        nodeIds: ['B'],
        cascadeEdges: true,
        promoteSuperseding: true,
        reason: 'Test promotion',
        initiatedBy: 'test',
      });

      expect(preview.promotedNodes.length).toBe(1);
      expect(preview.promotedNodes[0].id).toBe('C');
    });

    it('should identify orphaned nodes', () => {
      const preview = previewForgetOperation({
        nodeIds: ['B'],
        cascadeEdges: true,
        promoteSuperseding: true,
        reason: 'Test orphans',
        initiatedBy: 'test',
      });

      // A and C would be orphaned (lose edges to/from B)
      const orphanedIds = preview.orphanedNodes.map(n => n.id);
      expect(orphanedIds).toContain('A');
      expect(orphanedIds).toContain('C');
    });

    it('should generate impact summary', () => {
      const preview = previewForgetOperation({
        nodeIds: ['B'],
        cascadeEdges: true,
        promoteSuperseding: true,
        reason: 'Test summary',
        initiatedBy: 'test',
      });

      expect(preview.impactSummary).toContain('forget');
      expect(preview.impactSummary).toContain('promote');
    });
  });

  // ==========================================================================
  // Forget Execution Tests
  // ==========================================================================

  describe('Forget Execution', () => {
    beforeEach(() => {
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B'));
      registerNode(createTestNode('C', 'Node C'));

      registerEdge(createTestEdge('e1', 'A', 'B'));
      registerEdge(createTestEdge('e2', 'B', 'C'));
      registerEdge(createTestEdge('e_super', 'C', 'B', 'temporal-supersedes'));
    });

    it('should forget a node', () => {
      const result = forgetNode('B', 'Test forget', 'test_user');

      expect(result.success).toBe(true);
      expect(result.forgottenNodes).toContain('B');
      expect(result.auditEvents.length).toBeGreaterThan(0);
    });

    it('should tombstone node on forget', () => {
      forgetNode('B', 'Test forget', 'test_user');

      // Check eligibility after forget
      const eligibility = checkForgetEligibility('B');
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('already forgotten');
    });

    it('should cascade edges on forget', () => {
      const result = forgetNode('B', 'Test cascade', 'test_user');

      expect(result.affectedEdges.length).toBeGreaterThan(0);
    });

    it('should promote superseding nodes', () => {
      const result = forgetNode('B', 'Test promotion', 'test_user');

      expect(result.promotedNodes).toContain('C');
    });

    it('should batch forget multiple nodes', () => {
      registerNode(createTestNode('D', 'Node D'));

      const result = forgetNodesBatch(['B', 'D'], 'Batch forget', 'test_user');

      expect(result.forgottenNodes.length).toBe(2);
      expect(result.forgottenNodes).toContain('B');
      expect(result.forgottenNodes).toContain('D');
    });

    it('should report not found nodes', () => {
      const result = forgetNode('NONEXISTENT', 'Test not found', 'test_user');

      expect(result.success).toBe(false);
      expect(result.notFound).toContain('NONEXISTENT');
    });

    it('should record forget audit', () => {
      forgetNode('B', 'Test audit', 'test_user');

      const auditLog = getGraphOperationAuditLog('forget');
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].type).toBe('forget');
    });

    it('should execute custom forget operation', () => {
      const operation: ForgetOperation = {
        nodeIds: ['B'],
        cascadeEdges: true,
        promoteSuperseding: true,
        reason: 'Custom operation',
        initiatedBy: 'custom_test',
      };

      const result = executeForgetOperation(operation);

      expect(result.success).toBe(true);
      expect(result.forgottenNodes).toContain('B');
    });
  });

  // ==========================================================================
  // Audit Tests
  // ==========================================================================

  describe('Audit', () => {
    it('should filter audit by type', () => {
      // Perform traversal
      registerNode(createTestNode('A', 'Node A'));
      traverseFromNode('A');

      // Perform forget
      forgetNode('A', 'Test', 'test');

      const traversalAudits = getGraphOperationAuditLog('traversal');
      const forgetAudits = getGraphOperationAuditLog('forget');

      expect(traversalAudits.length).toBe(1);
      expect(forgetAudits.length).toBe(1);
    });

    it('should get recent audit records', () => {
      registerNode(createTestNode('A', 'Node A'));
      traverseFromNode('A');
      traverseFromNode('A');

      const recent = getRecentAuditRecords(1);
      expect(recent.length).toBe(1);
    });
  });

  // ==========================================================================
  // Formatting Tests
  // ==========================================================================

  describe('Formatting', () => {
    it('should format traversal result', () => {
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B'));
      registerEdge(createTestEdge('e1', 'A', 'B'));

      const result = traverseFromNode('A');
      const formatted = formatTraversalResult(result);

      expect(formatted).toContain('Traversal from');
      expect(formatted).toContain('Node A');
    });

    it('should format forget result', () => {
      registerNode(createTestNode('B', 'Node B'));

      const result = forgetNode('B', 'Test format', 'test');
      const formatted = formatForgetResult(result);

      expect(formatted).toContain('SUCCESS');
      expect(formatted).toContain('Nodes forgotten');
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe('Statistics', () => {
    it('should report graph statistics', () => {
      registerNode(createTestNode('A', 'Node A', 'Project'));
      registerNode(createTestNode('B', 'Node B', 'Task'));
      registerEdge(createTestEdge('e1', 'A', 'B', 'depends-on'));

      const stats = getGraphStatistics();

      expect(stats.totalNodes).toBe(2);
      expect(stats.totalEdges).toBe(1);
      expect(stats.byNodeType['Project']).toBe(1);
      expect(stats.byNodeType['Task']).toBe(1);
      expect(stats.byEdgeType['depends-on']).toBe(1);
    });

    it('should count active vs tombstoned', () => {
      registerNode(createTestNode('A', 'Node A'));
      registerNode(createTestNode('B', 'Node B', 'Task', 'tombstoned'));

      const stats = getGraphStatistics();

      expect(stats.activeNodes).toBe(1);
      expect(stats.tombstonedNodes).toBe(1);
    });
  });

  // ==========================================================================
  // Eligibility Tests
  // ==========================================================================

  describe('Forget Eligibility', () => {
    it('should allow forgetting active nodes', () => {
      registerNode(createTestNode('A', 'Node A'));

      const eligibility = checkForgetEligibility('A');

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.reason).toContain('active');
    });

    it('should reject non-existent nodes', () => {
      const eligibility = checkForgetEligibility('NONEXISTENT');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('not found');
    });

    it('should reject already forgotten nodes', () => {
      registerNode(createTestNode('A', 'Node A', 'Task', 'tombstoned'));

      const eligibility = checkForgetEligibility('A');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('already forgotten');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should support full traversal-forget workflow', () => {
      // Setup complex graph
      registerNode(createTestNode('root', 'Root', 'Project'));
      registerNode(createTestNode('goal', 'Goal', 'Goal'));
      registerNode(createTestNode('task1', 'Task 1', 'Task'));
      registerNode(createTestNode('task2', 'Task 2', 'Task'));
      registerNode(createTestNode('constraint', 'Constraint', 'Constraint'));

      registerEdge(createTestEdge('e1', 'root', 'goal', 'depends-on'));
      registerEdge(createTestEdge('e2', 'goal', 'task1', 'depends-on'));
      registerEdge(createTestEdge('e3', 'goal', 'task2', 'depends-on'));
      registerEdge(createTestEdge('e4', 'constraint', 'task1', 'blocks'));

      // Step 1: Traverse to understand the graph
      const traversal = traverseFromNode('root', { maxDepth: 3 });
      expect(traversal.nodes.length).toBe(3); // goal, task1, task2 (constraint not connected from root)

      // Step 2: Preview forgetting the goal
      const preview = previewForgetOperation({
        nodeIds: ['goal'],
        cascadeEdges: true,
        promoteSuperseding: false,
        reason: 'Goal obsolete',
        initiatedBy: 'integration_test',
      });
      expect(preview.targetNodes.length).toBe(1);
      expect(preview.affectedEdges.length).toBe(3); // e1, e2, e3

      // Step 3: Execute the forget
      const forgetResult = forgetNode('goal', 'Goal obsolete', 'integration_test');
      expect(forgetResult.success).toBe(true);
      expect(forgetResult.forgottenNodes).toContain('goal');

      // Step 4: Verify traversal no longer finds the forgotten node
      const postTraversal = traverseFromNode('root', { maxDepth: 3 });
      const nodeIds = postTraversal.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('goal');

      // Step 5: Check audit trail
      const audits = getRecentAuditRecords(10);
      expect(audits.length).toBeGreaterThanOrEqual(2); // traversal + forget
    });
  });

  // ==========================================================================
  // Acceptance Criteria Tests
  // ==========================================================================

  describe('Acceptance Criteria', () => {
    it('AC1: Operators can inspect related memory through graph traversal', () => {
      // Setup: Project with goals and tasks
      registerNode(createTestNode('project', 'My Project', 'Project'));
      registerNode(createTestNode('goal1', 'First Goal', 'Goal'));
      registerNode(createTestNode('task1', 'First Task', 'Task'));
      registerNode(createTestNode('task2', 'Second Task', 'Task'));

      registerEdge(createTestEdge('e1', 'project', 'goal1', 'depends-on'));
      registerEdge(createTestEdge('e2', 'goal1', 'task1', 'depends-on'));
      registerEdge(createTestEdge('e3', 'goal1', 'task2', 'depends-on'));

      // Inspect related memories
      const result = traverseFromNode('project', { maxDepth: 2 });

      expect(result.rootNode).not.toBeNull();
      expect(result.nodes.length).toBe(3); // goal1, task1, task2
      expect(result.edges.length).toBe(3); // e1, e2, e3

      // Verify we can see the relationship structure
      const goalNode = result.nodes.find(n => n.id === 'goal1');
      expect(goalNode).toBeDefined();
      expect(goalNode!.nodeType).toBe('Goal');
    });

    it('AC2: Forgetting removes memory cleanly from governed tiers and edges', () => {
      registerNode(createTestNode('target', 'Target Node', 'Task'));
      registerNode(createTestNode('related', 'Related Node', 'Task'));
      registerEdge(createTestEdge('edge1', 'target', 'related'));

      const beforeStats = getGraphStatistics();
      expect(beforeStats.activeNodes).toBe(2);
      expect(beforeStats.activeEdges).toBe(1);

      // Forget the target node
      const result = forgetNode('target', 'Clean removal test', 'test');

      expect(result.success).toBe(true);
      expect(result.forgottenNodes).toContain('target');
      expect(result.affectedEdges).toContain('edge1');

      // Verify clean removal
      const afterStats = getGraphStatistics();
      expect(afterStats.tombstonedNodes).toBe(1);
      expect(afterStats.tombstonedEdges).toBe(1);

      // Verify node is no longer traversable
      const traversal = traverseFromNode('related');
      expect(traversal.nodes.find(n => n.id === 'target')).toBeUndefined();
    });

    it('AC3: Delete and traversal actions are visible in audit output', () => {
      registerNode(createTestNode('node1', 'Node 1'));
      registerNode(createTestNode('node2', 'Node 2'));
      registerEdge(createTestEdge('e1', 'node1', 'node2'));

      // Perform traversal
      traverseFromNode('node1');

      // Perform forget
      forgetNode('node2', 'Audit visibility test', 'test');

      // Check audit log
      const allAudits = getGraphOperationAuditLog();
      expect(allAudits.length).toBeGreaterThanOrEqual(2);

      // Verify traversal audit
      const traversalAudits = getGraphOperationAuditLog('traversal');
      expect(traversalAudits.length).toBeGreaterThanOrEqual(1);
      expect(traversalAudits[0].type).toBe('traversal');

      // Verify forget audit
      const forgetAudits = getGraphOperationAuditLog('forget');
      expect(forgetAudits.length).toBeGreaterThanOrEqual(1);
      expect(forgetAudits[0].type).toBe('forget');

      // Verify recent records
      const recent = getRecentAuditRecords(2);
      expect(recent.length).toBe(2);
    });
  });
});
