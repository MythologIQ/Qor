/**
 * Unit tests for CMHL Restaking mechanism
 *
 * @see task_cmhl_restaking in phases.json
 */

import { describe, it, expect } from 'bun:test';
import type {
  TemporalMetadata,
  SemanticNodeRecord,
  SourceChunkRecord,
  CacheEntryRecord,
  RestakeReason,
  GovernanceEventRecord,
} from './types';
import {
  // Constants
  MAX_RESTAKE_COUNT,
  MIN_RESTAKE_INTERVAL_MS,
  RESTAKE_BUDGET_PER_WINDOW,
  // Types
  type RestakeEvent,
  type RestakeBudgetState,
  // Budget functions
  createRestakeBudget,
  isRestakeAllowed,
  consumeRestakeBudget,
  // Effective T0
  effectiveT0,
  effectiveDecayWeight,
  // Validation
  validateRestake,
  // Execution
  executeRestake,
  // Entity-specific
  restakeSemanticNode,
  restakeSourceChunk,
  restakeCacheEntry,
  // Batch
  batchRestake,
} from './restaking';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTemporal(overrides: Partial<TemporalMetadata> = {}): TemporalMetadata {
  const now = Date.now();
  return {
    t0: now - 100000, // Created 100s ago
    w0: 1.0,
    lambda: 0.0001, // session profile
    decayProfile: 'session',
    restakeCount: 0,
    ...overrides,
  };
}

function createMockNode(id: string, label: string, temporal: TemporalMetadata): SemanticNodeRecord {
  return {
    id,
    documentId: 'doc-1',
    sourceChunkId: 'chunk-1',
    nodeType: 'Task',
    label,
    summary: `Summary of ${label}`,
    fingerprint: `fp-${id}`,
    span: { startLine: 1, endLine: 10, startOffset: 0, endOffset: 100 },
    attributes: {},
    state: 'active',
    temporal,
  };
}

function createMockChunk(id: string, temporal: TemporalMetadata): SourceChunkRecord {
  return {
    id,
    documentId: 'doc-1',
    index: 1,
    fingerprint: `fp-${id}`,
    text: 'Test chunk content',
    tokenEstimate: 100,
    span: { startLine: 1, endLine: 10, startOffset: 0, endOffset: 100 },
    temporal,
  };
}

function createMockCacheEntry(id: string, temporal: TemporalMetadata): CacheEntryRecord {
  return {
    id,
    cacheType: 'semantic',
    sourceDocumentIds: ['doc-1'],
    sourceChunkIds: ['chunk-1'],
    summary: 'Test cache entry',
    status: 'fresh',
    createdAt: temporal.t0,
    expiresAt: temporal.t0 + 3600000,
    temporal,
  };
}

// ============================================================================
// Budget Tests
// ============================================================================

describe('Restake Budget', () => {
  describe('createRestakeBudget', () => {
    it('should create budget with specified timestamp', () => {
      const now = 1234567890000;
      const budget = createRestakeBudget(now);

      expect(budget.windowStart).toBe(now);
      expect(budget.usedCount).toBe(0);
      expect(budget.budgetLimit).toBe(RESTAKE_BUDGET_PER_WINDOW);
      expect(budget.events).toEqual([]);
    });

    it('should use current time when not specified', () => {
      const before = Date.now();
      const budget = createRestakeBudget();
      const after = Date.now();

      expect(budget.windowStart).toBeGreaterThanOrEqual(before);
      expect(budget.windowStart).toBeLessThanOrEqual(after);
    });
  });

  describe('isRestakeAllowed', () => {
    it('should allow restake when budget available', () => {
      const budget = createRestakeBudget();
      const result = isRestakeAllowed(budget);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny restake when budget exhausted', () => {
      const budget: RestakeBudgetState = {
        windowStart: Date.now(),
        usedCount: RESTAKE_BUDGET_PER_WINDOW,
        budgetLimit: RESTAKE_BUDGET_PER_WINDOW,
        events: [],
      };
      const result = isRestakeAllowed(budget);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('budget exhausted');
    });

    it('should allow when window expired (new window needed)', () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const budget: RestakeBudgetState = {
        windowStart: oldTime,
        usedCount: RESTAKE_BUDGET_PER_WINDOW,
        budgetLimit: RESTAKE_BUDGET_PER_WINDOW,
        events: [],
      };
      const result = isRestakeAllowed(budget);

      expect(result.allowed).toBe(true);
    });
  });

  describe('consumeRestakeBudget', () => {
    it('should increment used count and add event', () => {
      const budget = createRestakeBudget();
      const event = createMockRestakeEvent();

      const newBudget = consumeRestakeBudget(budget, event);

      expect(newBudget.usedCount).toBe(1);
      expect(newBudget.events).toHaveLength(1);
      expect(newBudget.events[0]).toBe(event);
    });

    it('should preserve budget limit', () => {
      const budget = createRestakeBudget();
      const event = createMockRestakeEvent();

      const newBudget = consumeRestakeBudget(budget, event);

      expect(newBudget.budgetLimit).toBe(budget.budgetLimit);
    });
  });
});

// ============================================================================
// effectiveT0 Tests
// ============================================================================

describe('effectiveT0', () => {
  it('should return original t0 when no restakes', () => {
    const temporal = createMockTemporal({ restakeCount: 0 });
    const result = effectiveT0(temporal);

    expect(result).toBe(temporal.t0);
  });

  it('should shift effective t0 forward with restakes', () => {
    const now = Date.now();
    const temporal = createMockTemporal({
      t0: now - 1000000,
      restakeCount: 1,
    });

    const result = effectiveT0(temporal);

    // Effective t0 should be later than original (more recent)
    expect(result).toBeGreaterThan(temporal.t0);
    // But not as recent as now (restake influence diminishes)
    expect(result).toBeLessThan(now);
  });

  it('should use restake history when provided', () => {
    const now = Date.now();
    const temporal = createMockTemporal({
      t0: now - 1000000,
      restakeCount: 2,
    });
    const history = [
      { restakedAt: now - 500000, weight: 0.5 },
      { restakedAt: now - 200000, weight: 0.25 },
    ];

    const result = effectiveT0(temporal, history);

    // With explicit history, result should be weighted average
    expect(result).toBeGreaterThan(temporal.t0);
  });

  it('should cap influence at MAX_RESTAKE_COUNT', () => {
    const now = Date.now();
    const temporal = createMockTemporal({
      t0: now - 10000000,
      restakeCount: 5,
    });

    const result = effectiveT0(temporal);

    // Should still be bounded between original t0 and now
    expect(result).toBeGreaterThan(temporal.t0);
    expect(result).toBeLessThan(now);
  });
});

// ============================================================================
// effectiveDecayWeight Tests
// ============================================================================

describe('effectiveDecayWeight', () => {
  it('should return 1.0 for undefined temporal', () => {
    const result = effectiveDecayWeight(undefined, Date.now());
    expect(result).toBe(1.0);
  });

  it('should return 1.0 for permanent memories', () => {
    const temporal = createMockTemporal({
      lambda: 0,
      decayProfile: 'permanent',
    });
    const result = effectiveDecayWeight(temporal, Date.now());
    expect(result).toBe(1.0);
  });

  it('should give higher weight after restaking', () => {
    const now = Date.now();
    const temporal = createMockTemporal({
      t0: now - 86400000, // 1 day ago
      restakeCount: 0,
      lambda: 0.0001,
    });

    const weightBefore = effectiveDecayWeight(temporal, now);

    // Simulate restaking
    const restakedTemporal = {
      ...temporal,
      t0: now - 3600000, // 1 hour ago
      restakeCount: 1,
    };
    const weightAfter = effectiveDecayWeight(restakedTemporal, now);

    expect(weightAfter).toBeGreaterThan(weightBefore);
  });

  it('should use effective t0 for calculation', () => {
    const now = Date.now();
    const temporal = createMockTemporal({
      t0: now - 1000000,
      restakeCount: 1,
    });

    const weightWithHistory = effectiveDecayWeight(temporal, now, [
      { restakedAt: now - 500000, weight: 1.0 },
    ]);

    const weightWithoutHistory = effectiveDecayWeight(temporal, now);

    // Both should calculate, but may differ slightly
    expect(weightWithHistory).toBeGreaterThan(0);
    expect(weightWithoutHistory).toBeGreaterThan(0);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateRestake', () => {
  it('should reject undefined temporal', () => {
    const budget = createRestakeBudget();
    const result = validateRestake(undefined, budget);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('no temporal metadata');
    expect(result.recommendation).toBe('deny');
  });

  it('should reject permanent memories', () => {
    const budget = createRestakeBudget();
    const temporal = createMockTemporal({
      lambda: 0,
      decayProfile: 'permanent',
    });
    const result = validateRestake(temporal, budget);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('permanent memories');
    expect(result.recommendation).toBe('deny');
  });

  it('should reject when max restakes reached', () => {
    const budget = createRestakeBudget();
    const temporal = createMockTemporal({
      restakeCount: MAX_RESTAKE_COUNT,
    });
    const result = validateRestake(temporal, budget);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('maximum restake count');
    expect(result.recommendation).toBe('upgrade_profile');
  });

  it('should reject when min interval not elapsed', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - 1000, // Just 1 second ago
    });
    const result = validateRestake(temporal, budget, now);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('minimum interval');
    expect(result.recommendation).toBe('deny');
  });

  it('should reject when budget exhausted', () => {
    const now = Date.now();
    const budget: RestakeBudgetState = {
      windowStart: now,
      usedCount: RESTAKE_BUDGET_PER_WINDOW,
      budgetLimit: RESTAKE_BUDGET_PER_WINDOW,
      events: [],
    };
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const result = validateRestake(temporal, budget, now);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('budget');
    expect(result.recommendation).toBe('await_governance');
  });

  it('should approve valid restake', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
      restakeCount: 0,
    });
    const result = validateRestake(temporal, budget, now);

    expect(result.valid).toBe(true);
    expect(result.recommendation).toBe('proceed');
    expect(result.projectedImpact.newRestakeCount).toBe(1);
    expect(result.projectedImpact.freshnessBoostPercent).toBeGreaterThan(0);
  });

  it('should calculate projected impact', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - 86400000, // 1 day ago
      restakeCount: 0,
      lambda: 0.0001,
    });
    const result = validateRestake(temporal, budget, now);

    expect(result.projectedImpact.newRestakeCount).toBe(1);
    expect(result.projectedImpact.newEffectiveT0).toBeGreaterThan(temporal.t0);
    expect(result.projectedImpact.freshnessBoostPercent).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Execute Restake Tests
// ============================================================================

describe('executeRestake', () => {
  it('should fail validation and return error', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      lambda: 0, // Permanent - invalid
      decayProfile: 'permanent',
    });

    const result = executeRestake(temporal, 'retrieval_frequency', budget, {}, now);

    expect(result.success).toBe(false);
    expect(result.error).toContain('permanent');
    expect(result.newTemporal).toBe(temporal);
  });

  it('should execute restake successfully', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
      restakeCount: 0,
    });

    const result = executeRestake(
      temporal,
      'retrieval_frequency',
      budget,
      { agentId: 'test-agent', projectId: 'test-project' },
      now,
    );

    expect(result.success).toBe(true);
    expect(result.newTemporal.t0).toBe(now);
    expect(result.newTemporal.restakeCount).toBe(1);
    expect(result.event).toBeDefined();
    expect(result.event!.entityId).toBe(''); // Caller must fill in
    expect(result.event!.metadata.reason).toBe('retrieval_frequency');
    expect(result.event!.eventType).toBe('memory-restaked');
    expect(result.newBudget.usedCount).toBe(1);
  });

  it('should require governance approval after 2 restakes', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
      restakeCount: 2, // Already restaked twice
    });

    const result = executeRestake(temporal, 'retrieval_frequency', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.event!.metadata.governanceRequired).toBe(true);
    expect(result.event!.metadata.governanceGranted).toBe(false); // Needs explicit approval
  });

  it('should auto-approve first two restakes', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
      restakeCount: 0,
    });

    const result = executeRestake(temporal, 'retrieval_frequency', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.event!.metadata.governanceRequired).toBe(false);
    expect(result.event!.metadata.governanceGranted).toBe(true);
  });
});

// ============================================================================
// Entity-Specific Tests
// ============================================================================

describe('restakeSemanticNode', () => {
  it('should fail when node has no temporal', () => {
    const budget = createRestakeBudget();
    const node: SemanticNodeRecord = {
      ...createMockNode('node-1', 'Test', createMockTemporal()),
      temporal: undefined,
    };

    const result = restakeSemanticNode(node, 'retrieval_frequency', budget, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('no temporal');
  });

  it('should restake node successfully', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const node = createMockNode('node-1', 'Test', temporal);

    const result = restakeSemanticNode(node, 'retrieval_frequency', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.newNode.temporal!.restakeCount).toBe(1);
    expect(result.newNode.temporal!.t0).toBe(now);
    expect(result.event!.entityId).toBe('node-1');
    expect(result.event!.entityKind).toBe('semantic-node');
    expect(result.event!.eventType).toBe('memory-restaked');
  });
});

describe('restakeSourceChunk', () => {
  it('should restake chunk successfully', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const chunk = createMockChunk('chunk-1', temporal);

    const result = restakeSourceChunk(chunk, 'user_relevance_boost', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.newChunk.temporal!.restakeCount).toBe(1);
    expect(result.event!.entityKind).toBe('chunk');
    expect(result.event!.entityId).toBe('chunk-1');
    expect(result.event!.eventType).toBe('memory-restaked');
  });
});

describe('restakeCacheEntry', () => {
  it('should restake cache entry and update refreshedAt', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const entry = createMockCacheEntry('cache-1', temporal);

    const result = restakeCacheEntry(entry, 'decision_dependency', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.newEntry.temporal!.restakeCount).toBe(1);
    expect(result.newEntry.refreshedAt).toBe(now);
    expect(result.event!.entityKind).toBe('cache-entry');
    expect(result.event!.entityId).toBe('cache-1');
    expect(result.event!.eventType).toBe('memory-restaked');
  });
});

// ============================================================================
// Batch Restake Tests
// ============================================================================

describe('batchRestake', () => {
  it('should restake multiple entities', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const entities = [
      createMockNode('node-1', 'Test 1', temporal),
      createMockNode('node-2', 'Test 2', temporal),
      createMockNode('node-3', 'Test 3', temporal),
    ];

    const result = batchRestake(entities, 'retrieval_frequency', budget, {}, now);

    expect(result.stats.attempted).toBe(3);
    expect(result.stats.succeeded).toBe(3);
    expect(result.stats.failed).toBe(0);
    expect(result.succeeded).toHaveLength(3);
    expect(result.finalBudget.usedCount).toBe(3);
  });

  it('should handle entities without temporal', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const entities = [
      createMockNode('node-1', 'Test 1', createMockTemporal({ t0: now - MIN_RESTAKE_INTERVAL_MS * 2 })),
      { id: 'node-2', temporal: undefined },
    ];

    const result = batchRestake(entities as any, 'retrieval_frequency', budget, {}, now);

    expect(result.stats.succeeded).toBe(1);
    expect(result.stats.failed).toBe(1);
    expect(result.failed[0].reason).toContain('No temporal');
  });

  it('should stop when budget exhausted', () => {
    const now = Date.now();
    const budget: RestakeBudgetState = {
      windowStart: now,
      usedCount: RESTAKE_BUDGET_PER_WINDOW - 1,
      budgetLimit: RESTAKE_BUDGET_PER_WINDOW,
      events: [],
    };
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const entities = [
      createMockNode('node-1', 'Test 1', temporal),
      createMockNode('node-2', 'Test 2', temporal),
      createMockNode('node-3', 'Test 3', temporal),
    ];

    const result = batchRestake(entities, 'retrieval_frequency', budget, {}, now);

    expect(result.stats.succeeded).toBe(1);
    expect(result.stats.failed).toBe(2);
    expect(result.finalBudget.usedCount).toBe(RESTAKE_BUDGET_PER_WINDOW);
  });

  it('should track budget consumption', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2,
    });
    const entities = [
      createMockNode('node-1', 'Test 1', temporal),
      createMockNode('node-2', 'Test 2', temporal),
    ];

    const result = batchRestake(entities, 'retrieval_frequency', budget, {}, now);

    expect(result.stats.budgetConsumed).toBe(2);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Restaking Integration', () => {
  it('should provide freshness boost after restaking', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);

    // Create an old, decayed memory
    const oldTemporal: TemporalMetadata = {
      t0: now - 7 * 24 * 60 * 60 * 1000, // 1 week ago
      w0: 1.0,
      lambda: 0.0001, // session decay
      decayProfile: 'session',
      restakeCount: 0,
    };

    const weightBefore = effectiveDecayWeight(oldTemporal, now);

    // Restake it
    const result = executeRestake(oldTemporal, 'retrieval_frequency', budget, {}, now);
    expect(result.success).toBe(true);

    const weightAfter = effectiveDecayWeight(result.newTemporal, now);

    // Weight should improve
    expect(weightAfter).toBeGreaterThan(weightBefore);
  });

  it('should maintain decay profile through restakes', () => {
    const now = Date.now();
    const budget = createRestakeBudget(now);
    const temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 2, // Ensure old enough to restake
      decayProfile: 'durable',
      lambda: 0.000001,
    });

    const result = executeRestake(temporal, 'retrieval_frequency', budget, {}, now);

    expect(result.success).toBe(true);
    expect(result.newTemporal.decayProfile).toBe('durable');
    expect(result.newTemporal.lambda).toBe(0.000001);
  });

  it('should accumulate restake count across multiple operations', () => {
    const now = Date.now();
    let budget = createRestakeBudget(now);
    let temporal = createMockTemporal({
      t0: now - MIN_RESTAKE_INTERVAL_MS * 10,
      restakeCount: 0,
    });

    // First restake
    const result1 = executeRestake(temporal, 'retrieval_frequency', budget, {}, now);
    expect(result1.success).toBe(true);
    expect(result1.newTemporal.restakeCount).toBe(1);

    // Update state for second restake
    budget = result1.newBudget;
    temporal = result1.newTemporal;
    const later = now + MIN_RESTAKE_INTERVAL_MS * 2;

    const result2 = executeRestake(temporal, 'user_relevance_boost', budget, {}, later);
    expect(result2.success).toBe(true);
    expect(result2.newTemporal.restakeCount).toBe(2);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createMockRestakeEvent(): RestakeEvent {
  const now = Date.now();
  return {
    id: `restake_${now}_1`,
    eventType: 'memory-restaked',
    entityId: 'test-target',
    entityKind: 'semantic-node',
    policyVersion: 'v1',
    createdAt: now,
    summary: 'Memory restaked: retrieval_frequency',
    metadata: {
      reason: 'retrieval_frequency',
      governanceRequired: false,
      governanceGranted: true,
      previousT0: now - 100000,
      previousW0: 1.0,
      previousLambda: 0.0001,
      previousDecayProfile: 'session',
      previousRestakeCount: 0,
      newT0: now,
      newRestakeCount: 1,
    },
  };
}
