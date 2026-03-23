/**
 * CMHL Temporal Chaining Tests
 *
 * @module kernel/memory/temporal-chaining.test
 */

import { describe, it, expect } from 'bun:test';
import {
  createTemporalChainLink,
  resolveTemporalChain,
  processSupersessionContradictions,
  filterSupersededNodes,
  type TemporalChainLink,
  type TemporalChainResolution,
} from './temporal-chaining';
import type { ContradictionRecord, SemanticEdgeRecord, SemanticNodeRecord, TemporalMetadata } from './types';

function createMockNode(
  id: string,
  label: string,
  temporal?: TemporalMetadata,
): SemanticNodeRecord {
  return {
    id,
    documentId: 'doc-1',
    sourceChunkId: 'chunk-1',
    nodeType: 'Task',
    label,
    summary: `Summary of ${label}`,
    fingerprint: `fp-${id}`,
    span: { startLine: 1, endLine: 5, startOffset: 0, endOffset: 100 },
    attributes: {},
    state: 'active',
    temporal: temporal ?? {
      t0: Date.now(),
      w0: 1.0,
      lambda: 0.00001,
      decayProfile: 'standard',
      restakeCount: 0,
    },
  };
}

function createMockEdge(
  fromNodeId: string,
  toNodeId: string,
  edgeType: SemanticEdgeRecord['edgeType'] = 'relates-to',
): SemanticEdgeRecord {
  return {
    id: `edge-${fromNodeId}-${toNodeId}`,
    documentId: 'doc-1',
    sourceChunkId: 'chunk-1',
    fromNodeId,
    toNodeId,
    edgeType,
    fingerprint: `fp-${fromNodeId}-${toNodeId}`,
    attributes: {},
    state: 'active',
  };
}

describe('createTemporalChainLink', () => {
  it('should create a temporal chain link with temporal-supersedes edge', () => {
    const now = Date.now();
    const supersedingNode = createMockNode('node-new', 'New Task', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const supersededNode = createMockNode('node-old', 'Old Task', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    const link = createTemporalChainLink(supersedingNode, supersededNode, 'doc-1', 'chunk-1', now);

    expect(link.fromNodeId).toBe('node-new');
    expect(link.toNodeId).toBe('node-old');
    expect(link.supersededAt).toBe(now);
    expect(link.edge.edgeType).toBe('temporal-supersedes');
    expect(link.edge.fromNodeId).toBe('node-new');
    expect(link.edge.toNodeId).toBe('node-old');
    expect(link.edge.attributes.supersededAt).toBe(String(now));
    expect(link.edge.attributes.reason).toBe('temporal-supersession');
    expect(link.edge.temporal?.decayProfile).toBe('permanent');
    expect(link.edge.governance?.state).toBe('deprecated');
  });

  it('should generate unique edge IDs based on node IDs', () => {
    const now = Date.now();
    const node1 = createMockNode('node-1', 'Task 1');
    const node2 = createMockNode('node-2', 'Task 2');
    const node3 = createMockNode('node-3', 'Task 3');

    const link1 = createTemporalChainLink(node1, node2, 'doc-1', 'chunk-1', now);
    const link2 = createTemporalChainLink(node1, node3, 'doc-1', 'chunk-1', now);

    expect(link1.edge.id).not.toBe(link2.edge.id);
  });
});

describe('resolveTemporalChain', () => {
  it('should return all nodes as current when no temporal-supersedes edges exist', () => {
    const nodes = [
      createMockNode('node-1', 'Task 1'),
      createMockNode('node-2', 'Task 2'),
      createMockNode('node-3', 'Task 3'),
    ];
    const edges = [
      createMockEdge('node-1', 'node-2', 'relates-to'),
      createMockEdge('node-2', 'node-3', 'depends-on'),
    ];

    const resolution = resolveTemporalChain(nodes, edges);

    expect(resolution.currentNodes).toHaveLength(3);
    expect(resolution.deprecatedNodes).toHaveLength(0);
    expect(resolution.supersededNodeIds).toHaveLength(0);
    expect(resolution.chainLinks).toHaveLength(0);
  });

  it('should identify superseded nodes from temporal-supersedes edges', () => {
    const now = Date.now();
    const nodeNew = createMockNode('node-new', 'New Task', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeOld = createMockNode('node-old', 'Old Task', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeOther = createMockNode('node-other', 'Other Task');

    const temporalEdge: SemanticEdgeRecord = {
      ...createMockEdge('node-new', 'node-old', 'temporal-supersedes'),
      edgeType: 'temporal-supersedes',
      attributes: { supersededAt: String(now), reason: 'temporal-supersession' },
    };

    const resolution = resolveTemporalChain([nodeNew, nodeOld, nodeOther], [temporalEdge]);

    expect(resolution.currentNodes).toHaveLength(2);
    expect(resolution.currentNodes.map(n => n.id)).toContain('node-new');
    expect(resolution.currentNodes.map(n => n.id)).toContain('node-other');
    expect(resolution.deprecatedNodes).toHaveLength(1);
    expect(resolution.deprecatedNodes[0].id).toBe('node-old');
    expect(resolution.deprecatedNodes[0].governance?.state).toBe('deprecated');
    expect(resolution.supersededNodeIds).toEqual(['node-old']);
    expect(resolution.chainLinks).toHaveLength(1);
  });

  it('should handle multiple supersession chains', () => {
    const now = Date.now();
    const nodeV3 = createMockNode('node-v3', 'Task v3', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeV2 = createMockNode('node-v2', 'Task v2', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeV1 = createMockNode('node-v1', 'Task v1', { t0: now - 20000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    const edgeV3toV2: SemanticEdgeRecord = {
      ...createMockEdge('node-v3', 'node-v2', 'temporal-supersedes'),
      edgeType: 'temporal-supersedes',
      attributes: { supersededAt: String(now), reason: 'temporal-supersession' },
    };
    const edgeV2toV1: SemanticEdgeRecord = {
      ...createMockEdge('node-v2', 'node-v1', 'temporal-supersedes'),
      edgeType: 'temporal-supersedes',
      attributes: { supersededAt: String(now - 10000), reason: 'temporal-supersession' },
    };

    const resolution = resolveTemporalChain([nodeV3, nodeV2, nodeV1], [edgeV3toV2, edgeV2toV1]);

    // Only node-v3 should be current (it's the only one not superseded)
    expect(resolution.currentNodes).toHaveLength(1);
    expect(resolution.currentNodes[0].id).toBe('node-v3');
    expect(resolution.deprecatedNodes).toHaveLength(2);
    expect(resolution.supersededNodeIds).toContain('node-v2');
    expect(resolution.supersededNodeIds).toContain('node-v1');
    expect(resolution.chainLinks).toHaveLength(2);
  });

  it('should ignore temporal edges referencing nodes not in the input set', () => {
    const node1 = createMockNode('node-1', 'Task 1');
    const node2 = createMockNode('node-2', 'Task 2');

    // Edge referencing a node not in the list
    const temporalEdge: SemanticEdgeRecord = {
      ...createMockEdge('node-1', 'node-missing', 'temporal-supersedes'),
      edgeType: 'temporal-supersedes',
      attributes: { supersededAt: String(Date.now()), reason: 'temporal-supersession' },
    };

    const resolution = resolveTemporalChain([node1, node2], [temporalEdge]);

    // Both nodes should remain current since the edge points to a missing node
    expect(resolution.currentNodes).toHaveLength(2);
    expect(resolution.deprecatedNodes).toHaveLength(0);
    expect(resolution.chainLinks).toHaveLength(0);
  });
});

describe('processSupersessionContradictions', () => {
  it('should create chain links for supersession contradictions', () => {
    const now = Date.now();
    const nodeNew = createMockNode('node-new', 'New Implementation', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeOld = createMockNode('node-old', 'Old Implementation', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    const contradiction: ContradictionRecord = {
      key: 'test-contradiction',
      kind: 'supersession',
      nodeIds: ['node-new', 'node-old'],
      documentIds: ['doc-1'],
      summaries: ['New', 'Old'],
      sourceLabels: [],
    };

    const links = processSupersessionContradictions([contradiction], [nodeNew, nodeOld], 'doc-1', 'chunk-1', now);

    expect(links).toHaveLength(1);
    expect(links[0].fromNodeId).toBe('node-new');
    expect(links[0].toNodeId).toBe('node-old');
    expect(links[0].edge.edgeType).toBe('temporal-supersedes');
  });

  it('should sort nodes by temporal ordering (newest first)', () => {
    const now = Date.now();
    const nodeOldest = createMockNode('node-oldest', 'Oldest', { t0: now - 20000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeMiddle = createMockNode('node-middle', 'Middle', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeNewest = createMockNode('node-newest', 'Newest', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    // Pass nodes in random order
    const contradiction: ContradictionRecord = {
      key: 'test-contradiction',
      kind: 'supersession',
      nodeIds: ['node-middle', 'node-oldest', 'node-newest'],
      documentIds: ['doc-1'],
      summaries: ['Middle', 'Oldest', 'Newest'],
      sourceLabels: [],
    };

    const links = processSupersessionContradictions(
      [contradiction],
      [nodeMiddle, nodeOldest, nodeNewest],
      'doc-1',
      'chunk-1',
      now,
    );

    // Should create 2 links: newest -> middle, newest -> oldest
    expect(links).toHaveLength(2);
    expect(links.every(l => l.fromNodeId === 'node-newest')).toBe(true);
    expect(links.some(l => l.toNodeId === 'node-middle')).toBe(true);
    expect(links.some(l => l.toNodeId === 'node-oldest')).toBe(true);
  });

  it('should skip non-supersession contradictions', () => {
    const node1 = createMockNode('node-1', 'Node 1');
    const node2 = createMockNode('node-2', 'Node 2');

    const disagreement: ContradictionRecord = {
      key: 'test-disagreement',
      kind: 'disagreement',
      nodeIds: ['node-1', 'node-2'],
      documentIds: ['doc-1'],
      summaries: ['A', 'B'],
      sourceLabels: [],
    };

    const authoritySplit: ContradictionRecord = {
      key: 'test-authority',
      kind: 'authority-split',
      nodeIds: ['node-1', 'node-2'],
      documentIds: ['doc-1'],
      summaries: ['Authority A', 'Authority B'],
      sourceLabels: [],
    };

    const links = processSupersessionContradictions(
      [disagreement, authoritySplit],
      [node1, node2],
      'doc-1',
      'chunk-1',
    );

    expect(links).toHaveLength(0);
  });

  it('should skip contradictions with fewer than 2 nodes', () => {
    const node1 = createMockNode('node-1', 'Node 1');

    const contradiction: ContradictionRecord = {
      key: 'test-contradiction',
      kind: 'supersession',
      nodeIds: ['node-1'], // Only 1 node
      documentIds: ['doc-1'],
      summaries: ['Single'],
      sourceLabels: [],
    };

    const links = processSupersessionContradictions([contradiction], [node1], 'doc-1', 'chunk-1');

    expect(links).toHaveLength(0);
  });

  it('should skip nodes not found in the node map', () => {
    const now = Date.now();
    const node1 = createMockNode('node-1', 'Node 1', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    // References a missing node
    const contradiction: ContradictionRecord = {
      key: 'test-contradiction',
      kind: 'supersession',
      nodeIds: ['node-1', 'node-missing'],
      documentIds: ['doc-1'],
      summaries: ['Exists', 'Missing'],
      sourceLabels: [],
    };

    const links = processSupersessionContradictions([contradiction], [node1], 'doc-1', 'chunk-1', now);

    // Can't create link because missing node isn't available
    expect(links).toHaveLength(0);
  });
});

describe('filterSupersededNodes', () => {
  it('should return all nodes when no temporal chains exist', () => {
    const nodes = [
      createMockNode('node-1', 'Task 1'),
      createMockNode('node-2', 'Task 2'),
    ];
    const edges = [createMockEdge('node-1', 'node-2', 'relates-to')];

    const filtered = filterSupersededNodes(nodes, edges);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(n => n.id)).toContain('node-1');
    expect(filtered.map(n => n.id)).toContain('node-2');
  });

  it('should filter out superseded nodes', () => {
    const now = Date.now();
    const nodeNew = createMockNode('node-new', 'New Task', { t0: now, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });
    const nodeOld = createMockNode('node-old', 'Old Task', { t0: now - 10000, w0: 1.0, lambda: 0, decayProfile: 'permanent', restakeCount: 0 });

    const temporalEdge: SemanticEdgeRecord = {
      ...createMockEdge('node-new', 'node-old', 'temporal-supersedes'),
      edgeType: 'temporal-supersedes',
      attributes: { supersededAt: String(now), reason: 'temporal-supersession' },
    };

    const filtered = filterSupersededNodes([nodeNew, nodeOld], [temporalEdge]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('node-new');
  });
});

describe('temporal chain integration', () => {
  it('should handle complete workflow from contradiction to filtered nodes', () => {
    const now = Date.now();

    // Create nodes representing versions of an implementation
    const implV3 = createMockNode('impl-v3', 'Implementation v3', {
      t0: now,
      w0: 1.0,
      lambda: 0,
      decayProfile: 'permanent',
      restakeCount: 0,
    });
    const implV2 = createMockNode('impl-v2', 'Implementation v2', {
      t0: now - 10000,
      w0: 1.0,
      lambda: 0,
      decayProfile: 'permanent',
      restakeCount: 0,
    });
    const implV1 = createMockNode('impl-v1', 'Implementation v1', {
      t0: now - 20000,
      w0: 1.0,
      lambda: 0,
      decayProfile: 'permanent',
      restakeCount: 0,
    });
    const unrelatedTask = createMockNode('unrelated', 'Unrelated Task', {
      t0: now - 5000,
      w0: 1.0,
      lambda: 0,
      decayProfile: 'permanent',
      restakeCount: 0,
    });

    // Create a supersession contradiction
    const contradiction: ContradictionRecord = {
      key: 'implementation-evolution',
      kind: 'supersession',
      nodeIds: ['impl-v3', 'impl-v2', 'impl-v1'],
      documentIds: ['doc-1'],
      summaries: ['Latest implementation', 'Previous implementation', 'Original implementation'],
      sourceLabels: ['version-3', 'version-2', 'version-1'],
    };

    // Process contradictions to create chain links
    const chainLinks = processSupersessionContradictions(
      [contradiction],
      [implV3, implV2, implV1, unrelatedTask],
      'doc-1',
      'chunk-1',
      now,
    );

    expect(chainLinks).toHaveLength(2);

    // Create temporal edges from chain links
    const temporalEdges = chainLinks.map(link => link.edge);

    // Resolve the chain
    const resolution = resolveTemporalChain(
      [implV3, implV2, implV1, unrelatedTask],
      temporalEdges,
      now,
    );

    // Only v3 and unrelated should be current
    expect(resolution.currentNodes).toHaveLength(2);
    expect(resolution.currentNodes.map(n => n.id)).toContain('impl-v3');
    expect(resolution.currentNodes.map(n => n.id)).toContain('unrelated');

    // v2 and v1 should be deprecated
    expect(resolution.deprecatedNodes).toHaveLength(2);
    expect(resolution.deprecatedNodes.map(n => n.id)).toContain('impl-v2');
    expect(resolution.deprecatedNodes.map(n => n.id)).toContain('impl-v1');

    // Verify governance state
    expect(resolution.deprecatedNodes.every(n => n.governance?.state === 'deprecated')).toBe(true);

    // Verify chain links are tracked
    expect(resolution.chainLinks).toHaveLength(2);
  });
});
