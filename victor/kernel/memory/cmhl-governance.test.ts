/**
 * Unit tests for CMHL Governance Integration
 *
 * @see task_cmhl_governance_integration in phases.json
 */

import { describe, it, expect } from 'bun:test';
import type {
  GovernanceEventRecord,
  TemporalMetadata,
} from './types';
import type { RestakeEvent, RestakeBudgetState, BatchRestakeResult } from './restaking';
import {
  CMHLGovernanceConfig,
  DEFAULT_CMHL_GOVERNANCE_CONFIG,
  CMHLGovernanceEventType,
  recordRestakeEvent,
  recordRestakeRejection,
  recordBatchRestakeSummary,
  recordDecayFiltering,
  recordTemporalChainLink,
  recordMemorySupersession,
  createCMHLGovernanceHooks,
  CMHLGovernanceHooks,
} from './cmhl-governance';

// ============================================================================
// Mock Store Implementation
// ============================================================================

class MockLearningStore {
  governanceEvents: GovernanceEventRecord[] = [];

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}
  async index(): Promise<void> {}
  async query(): Promise<[]> { return []; }
  async update(): Promise<void> {}
  async updateHeatmap(): Promise<void> {}
  async loadDocumentSnapshot() {
    return { chunks: [], semanticNodes: [], semanticEdges: [], cacheEntries: [] };
  }
  async upsertDocument(): Promise<void> {}
  async replaceDocumentChunks(): Promise<void> {}
  async upsertSemanticNodes(): Promise<void> {}
  async markSemanticNodesTombstoned(): Promise<void> {}
  async upsertSemanticEdges(): Promise<void> {}
  async markSemanticEdgesTombstoned(): Promise<void> {}
  async upsertCacheEntries(): Promise<void> {}
  async markCacheEntriesStale(): Promise<void> {}
  async appendIngestionRun(): Promise<void> {}
  async appendFailureMemory(): Promise<void> {}
  async listFailureMemory(): Promise<[]> { return []; }
  async remediateFailureMemories(): Promise<number> { return 0; }
  async markNegativeConstraintSummaryStale(): Promise<void> {}
  async searchChunks(): Promise<[]> { return []; }
  async searchChunksByVector(): Promise<[]> { return []; }
  async searchSemanticNodes(): Promise<[]> { return []; }
  async expandNeighborhood() {
    return { nodes: [], edges: [] };
  }
  async loadFreshCacheEntries(): Promise<[]> { return []; }

  // CMHL Governance Integration
  async appendGovernanceEvent(event: GovernanceEventRecord): Promise<void> {
    this.governanceEvents.push(event);
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTemporal(overrides: Partial<TemporalMetadata> = {}): TemporalMetadata {
  const now = Date.now();
  return {
    t0: now - 100000,
    w0: 1.0,
    lambda: 0.0001,
    decayProfile: 'session',
    restakeCount: 0,
    ...overrides,
  };
}

function createMockRestakeEvent(overrides: Partial<RestakeEvent> = {}): RestakeEvent {
  const now = Date.now();
  const previousTemporal = createMockTemporal({ restakeCount: 0 });
  return {
    eventId: `restake_${now}_1`,
    targetUorId: 'test-target-123',
    targetEntityKind: 'semantic-node',
    restakedAt: now,
    reason: 'retrieval_frequency',
    governanceApproval: {
      required: false,
      granted: true,
    },
    previousTemporal,
    newTemporal: createMockTemporal({ restakeCount: 1, t0: now }),
    initiatorContext: { agentId: 'test-agent', projectId: 'test-project' },
    ...overrides,
  };
}

function createMockBudget(overrides: Partial<RestakeBudgetState> = {}): RestakeBudgetState {
  return {
    windowStart: Date.now(),
    usedCount: 5,
    budgetLimit: 100,
    events: [],
    ...overrides,
  };
}

function createMockBatchResult(overrides: Partial<BatchRestakeResult> = {}): BatchRestakeResult {
  return {
    succeeded: [],
    failed: [],
    finalBudget: createMockBudget(),
    stats: {
      attempted: 15,
      succeeded: 12,
      failed: 3,
      budgetConsumed: 12,
    },
    ...overrides,
  };
}

// ============================================================================
// Configuration Tests
// ============================================================================

describe('CMHL Governance Configuration', () => {
  it('should have default configuration values', () => {
    expect(DEFAULT_CMHL_GOVERNANCE_CONFIG.policyVersion).toBe('2026-03-18.cmhl-v1');
    expect(DEFAULT_CMHL_GOVERNANCE_CONFIG.recordRestakeEvents).toBe(true);
    expect(DEFAULT_CMHL_GOVERNANCE_CONFIG.recordDecayEvents).toBe(true);
    expect(DEFAULT_CMHL_GOVERNANCE_CONFIG.recordChainEvents).toBe(true);
    expect(DEFAULT_CMHL_GOVERNANCE_CONFIG.summaryThreshold).toBe(10);
  });

  it('should allow configuration overrides', () => {
    const customConfig: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordRestakeEvents: false,
      summaryThreshold: 20,
    };

    expect(customConfig.recordRestakeEvents).toBe(false);
    expect(customConfig.recordDecayEvents).toBe(true);
    expect(customConfig.summaryThreshold).toBe(20);
  });
});

// ============================================================================
// Restake Event Recording Tests
// ============================================================================

describe('recordRestakeEvent', () => {
  it('should record restake event to governance ledger', async () => {
    const store = new MockLearningStore();
    const event = createMockRestakeEvent();
    const budget = createMockBudget();

    await recordRestakeEvent(store, event, budget);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].eventType).toBe('promotion-approved');
    expect(store.governanceEvents[0].entityId).toBe('test-target-123');
    expect(store.governanceEvents[0].entityKind).toBe('semantic-node');
  });

  it('should include CMHL metadata in recorded event', async () => {
    const store = new MockLearningStore();
    const event = createMockRestakeEvent();
    const budget = createMockBudget();

    await recordRestakeEvent(store, event, budget);

    const metadata = store.governanceEvents[0].metadata;
    expect(metadata.cmhlOperation).toBe('restake-executed');
    expect(metadata.restakeCount).toBe(1);
    expect(metadata.decayProfile).toBe('session');
    expect(metadata.budgetRemaining).toBe(95);
    expect(metadata.governanceApprovalRequired).toBe(false);
    expect(metadata.governanceApprovalGranted).toBe(true);
  });

  it('should skip recording when disabled in config', async () => {
    const store = new MockLearningStore();
    const event = createMockRestakeEvent();
    const budget = createMockBudget();
    const config: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordRestakeEvents: false,
    };

    await recordRestakeEvent(store, event, budget, config);

    expect(store.governanceEvents).toHaveLength(0);
  });

  it('should record pending approval for high restake counts', async () => {
    const store = new MockLearningStore();
    const event = createMockRestakeEvent({
      governanceApproval: { required: true, granted: false },
      newTemporal: createMockTemporal({ restakeCount: 3 }),
    });
    const budget = createMockBudget();

    await recordRestakeEvent(store, event, budget);

    expect(store.governanceEvents[0].summary).toContain('pending approval');
    expect(store.governanceEvents[0].summary).toContain('requires governance review');
  });
});

// ============================================================================
// Restake Rejection Tests
// ============================================================================

describe('recordRestakeRejection', () => {
  it('should record restake rejection to governance ledger', async () => {
    const store = new MockLearningStore();
    const temporal = createMockTemporal();

    await recordRestakeRejection(store, 'node-123', 'semantic-node', 'maximum restake count reached', temporal);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].eventType).toBe('promotion-rejected');
    expect(store.governanceEvents[0].entityId).toBe('node-123');
    expect(store.governanceEvents[0].entityKind).toBe('semantic-node');
    expect(store.governanceEvents[0].summary).toContain('maximum restake count reached');
  });

  it('should handle undefined temporal metadata', async () => {
    const store = new MockLearningStore();

    await recordRestakeRejection(store, 'node-123', 'semantic-node', 'no temporal metadata', undefined);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].metadata.restakeCount).toBeUndefined();
  });

  it('should skip recording when disabled in config', async () => {
    const store = new MockLearningStore();
    const config: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordRestakeEvents: false,
    };

    await recordRestakeRejection(store, 'node-123', 'semantic-node', 'test reason', undefined, config);

    expect(store.governanceEvents).toHaveLength(0);
  });
});

// ============================================================================
// Batch Restake Summary Tests
// ============================================================================

describe('recordBatchRestakeSummary', () => {
  it('should record batch summary for significant batches', async () => {
    const store = new MockLearningStore();
    const result = createMockBatchResult({ stats: { attempted: 15, succeeded: 12, failed: 3, budgetConsumed: 12 } });

    await recordBatchRestakeSummary(store, result);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].entityId).toBe('batch-summary');
    expect(store.governanceEvents[0].summary).toContain('12/15 succeeded');
    expect(store.governanceEvents[0].summary).toContain('3 failed');
  });

  it('should skip recording for small batches below threshold', async () => {
    const store = new MockLearningStore();
    const result = createMockBatchResult({ stats: { attempted: 5, succeeded: 5, failed: 0, budgetConsumed: 5 } });

    await recordBatchRestakeSummary(store, result);

    expect(store.governanceEvents).toHaveLength(0);
  });

  it('should include budget remaining in metadata', async () => {
    const store = new MockLearningStore();
    const result = createMockBatchResult({
      finalBudget: createMockBudget({ usedCount: 12, budgetLimit: 100 }),
    });

    await recordBatchRestakeSummary(store, result);

    expect(store.governanceEvents[0].metadata.budgetRemaining).toBe(88);
  });
});

// ============================================================================
// Decay Filtering Tests
// ============================================================================

describe('recordDecayFiltering', () => {
  it('should record decay filtering event', async () => {
    const store = new MockLearningStore();

    await recordDecayFiltering(store, 25, 0.05, 100);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].eventType).toBe('recall-downgraded');
    expect(store.governanceEvents[0].metadata.cmhlOperation).toBe('decay-threshold-filtered');
    expect(store.governanceEvents[0].metadata.filteredCount).toBe(25);
    expect(store.governanceEvents[0].metadata.decayThreshold).toBe(0.05);
  });

  it('should calculate percentage in summary', async () => {
    const store = new MockLearningStore();

    await recordDecayFiltering(store, 25, 0.05, 100);

    expect(store.governanceEvents[0].summary).toContain('25%');
    expect(store.governanceEvents[0].summary).toContain('25 memories filtered');
  });

  it('should skip recording when no memories filtered', async () => {
    const store = new MockLearningStore();

    await recordDecayFiltering(store, 0, 0.05, 100);

    expect(store.governanceEvents).toHaveLength(0);
  });

  it('should skip recording when disabled in config', async () => {
    const store = new MockLearningStore();
    const config: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordDecayEvents: false,
    };

    await recordDecayFiltering(store, 25, 0.05, 100, config);

    expect(store.governanceEvents).toHaveLength(0);
  });
});

// ============================================================================
// Temporal Chain Tests
// ============================================================================

describe('recordTemporalChainLink', () => {
  it('should record chain link creation', async () => {
    const store = new MockLearningStore();

    await recordTemporalChainLink(store, 'node-old', 'node-new', 3);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].eventType).toBe('contradiction-registered');
    expect(store.governanceEvents[0].entityId).toBe('node-new');
    expect(store.governanceEvents[0].metadata.cmhlOperation).toBe('temporal-chain-linked');
    expect(store.governanceEvents[0].metadata.chainDepth).toBe(3);
  });

  it('should include chain details in summary', async () => {
    const store = new MockLearningStore();

    await recordTemporalChainLink(store, 'node-old', 'node-new', 3);

    expect(store.governanceEvents[0].summary).toContain('node-old → node-new');
    expect(store.governanceEvents[0].summary).toContain('depth: 3');
  });

  it('should skip recording when disabled in config', async () => {
    const store = new MockLearningStore();
    const config: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordChainEvents: false,
    };

    await recordTemporalChainLink(store, 'node-old', 'node-new', 3, config);

    expect(store.governanceEvents).toHaveLength(0);
  });
});

// ============================================================================
// Memory Supersession Tests
// ============================================================================

describe('recordMemorySupersession', () => {
  it('should record memory supersession event', async () => {
    const store = new MockLearningStore();

    await recordMemorySupersession(store, 'node-old', 'node-new', 'contradiction resolution');

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].eventType).toBe('contradiction-registered');
    expect(store.governanceEvents[0].entityId).toBe('node-old');
    expect(store.governanceEvents[0].metadata.cmhlOperation).toBe('memory-superseded');
  });

  it('should include reason in summary', async () => {
    const store = new MockLearningStore();

    await recordMemorySupersession(store, 'node-old', 'node-new', 'contradiction resolution');

    expect(store.governanceEvents[0].summary).toContain('node-old → node-new');
    expect(store.governanceEvents[0].summary).toContain('contradiction resolution');
  });

  it('should skip recording when disabled in config', async () => {
    const store = new MockLearningStore();
    const config: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      recordChainEvents: false,
    };

    await recordMemorySupersession(store, 'node-old', 'node-new', 'test', config);

    expect(store.governanceEvents).toHaveLength(0);
  });
});

// ============================================================================
// Governance Hooks Factory Tests
// ============================================================================

describe('createCMHLGovernanceHooks', () => {
  it('should create governance hooks bound to store', async () => {
    const store = new MockLearningStore();
    const hooks = createCMHLGovernanceHooks(store);

    expect(hooks.recordRestakeEvent).toBeDefined();
    expect(hooks.recordRestakeRejection).toBeDefined();
    expect(hooks.recordBatchRestakeSummary).toBeDefined();
    expect(hooks.recordDecayFiltering).toBeDefined();
    expect(hooks.recordTemporalChainLink).toBeDefined();
    expect(hooks.recordMemorySupersession).toBeDefined();
  });

  it('should apply custom config overrides', async () => {
    const store = new MockLearningStore();
    const hooks = createCMHLGovernanceHooks(store, {
      recordRestakeEvents: false,
      summaryThreshold: 5,
    });

    const event = createMockRestakeEvent();
    const budget = createMockBudget();

    await hooks.recordRestakeEvent(event, budget);

    expect(store.governanceEvents).toHaveLength(0);
  });

  it('should record events through hooks interface', async () => {
    const store = new MockLearningStore();
    const hooks = createCMHLGovernanceHooks(store);

    await hooks.recordDecayFiltering(10, 0.05, 50);

    expect(store.governanceEvents).toHaveLength(1);
    expect(store.governanceEvents[0].metadata.filteredCount).toBe(10);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('CMHL Governance Integration', () => {
  it('should handle multiple event types in sequence', async () => {
    const store = new MockLearningStore();
    const hooks = createCMHLGovernanceHooks(store);

    // Simulate a sequence of CMHL operations
    await hooks.recordTemporalChainLink('node-1', 'node-2', 1);
    await hooks.recordRestakeRejection('node-3', 'semantic-node', 'budget exhausted', undefined);
    await hooks.recordDecayFiltering(15, 0.05, 80);
    await hooks.recordMemorySupersession('node-4', 'node-5', 'governance promotion');

    expect(store.governanceEvents).toHaveLength(4);

    // Verify event types
    const eventTypes = store.governanceEvents.map(e => e.metadata.cmhlOperation);
    expect(eventTypes).toContain('temporal-chain-linked');
    expect(eventTypes).toContain('restake-rejected');
    expect(eventTypes).toContain('decay-threshold-filtered');
    expect(eventTypes).toContain('memory-superseded');
  });

  it('should maintain unique event IDs', async () => {
    const store = new MockLearningStore();
    const hooks = createCMHLGovernanceHooks(store);

    await hooks.recordTemporalChainLink('node-1', 'node-2', 1);
    await hooks.recordTemporalChainLink('node-3', 'node-4', 1);

    const ids = store.governanceEvents.map(e => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('should preserve policy version across events', async () => {
    const store = new MockLearningStore();
    const customConfig: CMHLGovernanceConfig = {
      ...DEFAULT_CMHL_GOVERNANCE_CONFIG,
      policyVersion: 'custom-policy-v2',
    };
    const hooks = createCMHLGovernanceHooks(store, customConfig);

    await hooks.recordTemporalChainLink('node-1', 'node-2', 1);
    await hooks.recordDecayFiltering(10, 0.05, 50);

    expect(store.governanceEvents[0].policyVersion).toBe('custom-policy-v2');
    expect(store.governanceEvents[1].policyVersion).toBe('custom-policy-v2');
  });
});
