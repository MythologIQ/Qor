/**
 * Memory Operator Views — Test Suite
 *
 * Tests for chain state, decay state, governance state, and system overview views.
 * Validates that operator views provide legible inspection without code-level tracing.
 */

import { describe, it, expect } from 'bun:test';
import type {
  GovernanceMetadata,
  TemporalMetadata,
  GovernanceEventRecord,
  GovernanceState,
  EpistemicType,
  DecayProfile,
} from './types.js';
import type { ThermodynamicState } from './thermodynamic-decay.js';
import {
  buildChainStateView,
  buildDecayStateView,
  buildGovernanceStateView,
  buildSystemOverviewView,
  formatChainStateView,
  formatDecayStateView,
  formatGovernanceStateView,
  formatSystemOverviewView,
  inspectEntity,
  queryOperatorViews,
  checkOperatorViewsHealth,
  getViewCapabilities,
  DEFAULT_VIEW_CONFIG,
  type ChainStateView,
  type DecayStateView,
  type GovernanceStateView,
  type SystemOverviewView,
  type OperatorViewConfig,
} from './memory-operator-views.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockGovernance(
  overrides: Partial<GovernanceMetadata> = {},
): GovernanceMetadata {
  return {
    state: 'provisional',
    epistemicType: 'observation',
    provenanceComplete: true,
    confidence: 0.85,
    confidenceProfile: {
      extraction: 0.9,
      grounding: 0.85,
      crossSource: 0.8,
      operational: 0.85,
    },
    policyVersion: 'v1.0',
    rationale: 'Test rationale',
    ...overrides,
  };
}

function createMockTemporal(
  overrides: Partial<TemporalMetadata> = {},
): TemporalMetadata {
  const now = Date.now();
  return {
    t0: now - 86400000, // 1 day ago
    w0: 1.0,
    lambda: 0.00001,
    decayProfile: 'standard',
    restakeCount: 2,
    lastAccessedAt: now - 3600000, // 1 hour ago
    thermodynamic: {
      saturation: 0.6,
      temperature: 0.4,
      effectiveLambda: 0.000004,
      lastUpdated: now,
      accessCount: 5,
    },
    ...overrides,
  };
}

function createMockEvent(
  overrides: Partial<GovernanceEventRecord> = {},
): GovernanceEventRecord {
  return {
    id: 'event_001',
    eventType: 'ingest-completed',
    entityKind: 'document',
    entityId: 'doc_001',
    policyVersion: 'v1.0',
    createdAt: Date.now(),
    summary: 'Test event',
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// Chain State View Tests
// ============================================================================

describe('buildChainStateView', () => {
  it('should create a chain state view with basic fields', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();

    const view = buildChainStateView('doc_001', 'document', 'Test Document', governance, temporal);

    expect(view.entityId).toBe('doc_001');
    expect(view.entityKind).toBe('document');
    expect(view.title).toBe('Test Document');
    expect(view.provenanceChain).toBeDefined();
    expect(view.provenanceChain.length).toBeGreaterThan(0);
    expect(view.lifecycleState).toBeDefined();
    expect(view.lifecycleState.state).toBe('provisional');
  });

  it('should mark observation epistemic types as grounded', () => {
    const governance = createMockGovernance({ epistemicType: 'observation' });
    const temporal = createMockTemporal();

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    const firstLink = view.provenanceChain[0];
    expect(firstLink.grounded).toBe(true);
  });

  it('should mark conjecture epistemic types as not grounded', () => {
    const governance = createMockGovernance({ epistemicType: 'conjecture' });
    const temporal = createMockTemporal();

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    const firstLink = view.provenanceChain[0];
    expect(firstLink.grounded).toBe(false);
  });

  it('should include restaking in provenance chain', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal({ restakeCount: 3 });

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    const restakeLinks = view.provenanceChain.filter((l) => l.operation === 'promote');
    expect(restakeLinks.length).toBeGreaterThan(0);
  });

  it('should respect maxChainDepth config', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal({ restakeCount: 10 });

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal, {
      maxChainDepth: 3,
    });

    expect(view.provenanceChain.length).toBeLessThanOrEqual(3);
  });

  it('should identify crystallized state correctly', () => {
    const governance = createMockGovernance({ state: 'durable' });
    const temporal = createMockTemporal();

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    expect(view.lifecycleState.isCrystallized).toBe(true);
  });
});

describe('formatChainStateView', () => {
  it('should format chain view as readable text', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const view = buildChainStateView('doc_001', 'document', 'Test Document', governance, temporal);

    const formatted = formatChainStateView(view);

    expect(formatted).toContain('📋 Chain State: doc_001');
    expect(formatted).toContain('Kind: document');
    expect(formatted).toContain('Title: Test Document');
    expect(formatted).toContain('Provenance Chain:');
    expect(formatted).toContain('ingest');
  });

  it('should indicate grounded vs inferred in formatted output', () => {
    const governance = createMockGovernance({ epistemicType: 'observation' });
    const temporal = createMockTemporal();
    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    const formatted = formatChainStateView(view);

    expect(formatted).toContain('✓');
  });
});

// ============================================================================
// Decay State View Tests
// ============================================================================

describe('buildDecayStateView', () => {
  it('should create decay view with thermodynamic state', () => {
    const temporal = createMockTemporal();

    const view = buildDecayStateView('doc_001', temporal);

    expect(view.entityId).toBe('doc_001');
    expect(view.thermodynamic).toBeDefined();
    expect(view.thermodynamic.saturation).toBe(0.6);
    expect(view.thermodynamic.temperature).toBeDefined();
    expect(view.thermodynamic.effectiveLambda).toBeDefined();
  });

  it('should calculate decay metrics correctly', () => {
    const temporal = createMockTemporal({ w0: 2.0 });

    const view = buildDecayStateView('doc_001', temporal);

    expect(view.decayMetrics.originalWeight).toBe(2.0);
    expect(view.decayMetrics.currentWeight).toBeDefined();
    expect(view.decayMetrics.retentionPercent).toBeDefined();
    expect(view.decayMetrics.retentionPercent).toBeGreaterThan(0);
    expect(view.decayMetrics.retentionPercent).toBeLessThanOrEqual(100);
  });

  it('should include decay projections for configured periods', () => {
    const temporal = createMockTemporal();
    const config: Partial<OperatorViewConfig> = { projectionPeriods: [1, 24, 168] };

    const view = buildDecayStateView('doc_001', temporal, config);

    expect(view.decayMetrics.projections).toHaveLength(3);
    expect(view.decayMetrics.projections[0].period).toContain('hour');
    expect(view.decayMetrics.projections[1].period).toContain('day');
    expect(view.decayMetrics.projections[2].period).toContain('week');
  });

  it('should identify ground state correctly', () => {
    const temporal = createMockTemporal({
      thermodynamic: {
        saturation: 1.0,
        temperature: 0.0,
        effectiveLambda: 0.0,
        lastUpdated: Date.now(),
        accessCount: 100,
      },
    });

    const view = buildDecayStateView('doc_001', temporal);

    expect(view.isGroundState).toBe(true);
  });

  it('should build activity history with creation, access, and restakes', () => {
    const temporal = createMockTemporal({ restakeCount: 2 });

    const view = buildDecayStateView('doc_001', temporal);

    const createdEvent = view.activityHistory.find((a) => a.type === 'created');
    const accessedEvent = view.activityHistory.find((a) => a.type === 'accessed');
    const restakedEvents = view.activityHistory.filter((a) => a.type === 'restaked');

    expect(createdEvent).toBeDefined();
    expect(accessedEvent).toBeDefined();
    expect(restakedEvents).toHaveLength(2);
  });

  it('should describe decay profiles correctly', () => {
    const profiles: DecayProfile[] = ['ephemeral', 'session', 'standard', 'durable', 'permanent'];

    for (const profile of profiles) {
      const temporal = createMockTemporal({ decayProfile: profile });
      const view = buildDecayStateView('doc_001', temporal);

      expect(view.profile.profile).toBe(profile);
      expect(view.profile.halfLifeDescription).toBeDefined();
      expect(view.profile.halfLifeDescription.length).toBeGreaterThan(0);
    }
  });
});

describe('formatDecayStateView', () => {
  it('should format decay view as readable text', () => {
    const temporal = createMockTemporal();
    const view = buildDecayStateView('doc_001', temporal);

    const formatted = formatDecayStateView(view);

    expect(formatted).toContain('⏱️ Decay State: doc_001');
    expect(formatted).toContain('Profile:');
    expect(formatted).toContain('Thermodynamic:');
    expect(formatted).toContain('Saturation:');
    expect(formatted).toContain('Decay Metrics:');
    expect(formatted).toContain('Projections:');
  });

  it('should indicate ground state clearly', () => {
    const temporal = createMockTemporal({
      thermodynamic: {
        saturation: 1.0,
        temperature: 0.0,
        effectiveLambda: 0.0,
        lastUpdated: Date.now(),
        accessCount: 100,
      },
    });
    const view = buildDecayStateView('doc_001', temporal);

    const formatted = formatDecayStateView(view);

    expect(formatted).toContain('YES (zero decay)');
  });
});

// ============================================================================
// Governance State View Tests
// ============================================================================

describe('buildGovernanceStateView', () => {
  it('should create governance view with basic fields', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.entityId).toBe('doc_001');
    expect(view.governance.state).toBe('provisional');
    expect(view.governance.confidence).toBe(0.85);
    expect(view.policyVersion).toBe('v1.0');
  });

  it('should include recent events', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [
      createMockEvent({ eventType: 'ingest-completed', summary: 'Document ingested' }),
      createMockEvent({ eventType: 'promotion-approved', summary: 'Promoted to provisional' }),
    ];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.recentEvents).toHaveLength(2);
    expect(view.recentEvents[0].eventType).toBe('ingest-completed');
    expect(view.recentEvents[1].eventType).toBe('promotion-approved');
  });

  it('should limit events to maxRecentEvents config', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = Array.from({ length: 20 }, (_, i) =>
      createMockEvent({ eventType: 'ingest-completed', summary: `Event ${i}` }),
    );

    const view = buildGovernanceStateView('doc_001', governance, events, { maxRecentEvents: 5 });

    expect(view.recentEvents).toHaveLength(5);
  });

  it('should include confidence breakdown when configured', () => {
    const governance = createMockGovernance({
      confidenceProfile: {
        extraction: 0.9,
        grounding: 0.85,
        crossSource: 0.8,
        operational: 0.85,
      },
    });
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events, { includeConfidenceBreakdown: true });

    expect(view.confidenceBreakdown).toBeDefined();
    expect(view.confidenceBreakdown?.extraction).toBe(0.9);
    expect(view.confidenceBreakdown?.grounding).toBe(0.85);
    expect(view.confidenceBreakdown?.crossSource).toBe(0.8);
    expect(view.confidenceBreakdown?.operational).toBe(0.85);
    expect(view.confidenceBreakdown?.composite).toBeDefined();
  });

  it('should not include confidence breakdown when disabled', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events, { includeConfidenceBreakdown: false });

    expect(view.confidenceBreakdown).toBeUndefined();
  });

  it('should identify crystallization eligibility for valid provisional entities', () => {
    const governance = createMockGovernance({
      state: 'provisional',
      provenanceComplete: true,
      confidence: 0.95,
    });
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.crystallizationEligible).toBe(true);
    expect(view.crystallizationBlockers).toHaveLength(0);
  });

  it('should block crystallization for non-provisional entities', () => {
    const governance = createMockGovernance({ state: 'ephemeral' });
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.crystallizationEligible).toBe(false);
    expect(view.crystallizationBlockers.some((b) => b.includes('ephemeral'))).toBe(true);
  });

  it('should block crystallization for incomplete provenance', () => {
    const governance = createMockGovernance({ provenanceComplete: false });
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.crystallizationEligible).toBe(false);
    expect(view.crystallizationBlockers.some((b) => b.includes('Provenance'))).toBe(true);
  });

  it('should block crystallization for low confidence', () => {
    const governance = createMockGovernance({ confidence: 0.5 });
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.crystallizationEligible).toBe(false);
    expect(view.crystallizationBlockers.some((b) => b.toLowerCase().includes('confidence'))).toBe(true);
  });

  it('should mark events as grounded or inferred', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [
      createMockEvent({ summary: 'Document ingested from source' }),
      createMockEvent({ summary: 'Inferred relation created' }),
    ];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.recentEvents[0].grounded).toBe(true);
    expect(view.recentEvents[1].grounded).toBe(false);
  });
});

describe('formatGovernanceStateView', () => {
  it('should format governance view as readable text', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [createMockEvent()];
    const view = buildGovernanceStateView('doc_001', governance, events);

    const formatted = formatGovernanceStateView(view);

    expect(formatted).toContain('⚖️ Governance State: doc_001');
    expect(formatted).toContain('provisional');
    expect(formatted).toContain('Confidence:');
    expect(formatted).toContain('Crystallization:');
  });

  it('should show blockers when crystallization is blocked', () => {
    const governance = createMockGovernance({ state: 'ephemeral' });
    const events: GovernanceEventRecord[] = [];
    const view = buildGovernanceStateView('doc_001', governance, events);

    const formatted = formatGovernanceStateView(view);

    expect(formatted).toContain('BLOCKED');
    expect(formatted).toContain('Blockers:');
  });

  it('should show confidence breakdown when available', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [];
    const view = buildGovernanceStateView('doc_001', governance, events);

    const formatted = formatGovernanceStateView(view);

    expect(formatted).toContain('Confidence Breakdown:');
    expect(formatted).toContain('Extraction:');
    expect(formatted).toContain('Grounding:');
  });
});

// ============================================================================
// System Overview View Tests
// ============================================================================

describe('buildSystemOverviewView', () => {
  it('should create system overview with entity counts', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance(), temporal: createMockTemporal() },
      { id: 'doc_002', governance: createMockGovernance(), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];

    const view = buildSystemOverviewView(entities, events);

    expect(view.entityCounts.total).toBe(2);
    expect(view.governanceDistribution).toBeDefined();
    expect(view.profileDistribution).toBeDefined();
  });

  it('should calculate governance distribution correctly', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance({ state: 'provisional' }), temporal: createMockTemporal() },
      { id: 'doc_002', governance: createMockGovernance({ state: 'durable' }), temporal: createMockTemporal() },
      { id: 'doc_003', governance: createMockGovernance({ state: 'quarantined' }), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];

    const view = buildSystemOverviewView(entities, events);

    expect(view.governanceDistribution.provisional).toBe(1);
    expect(view.governanceDistribution.durable).toBe(1);
    expect(view.governanceDistribution.quarantined).toBe(1);
  });

  it('should calculate thermodynamic statistics', () => {
    const entities = [
      {
        id: 'doc_001',
        governance: createMockGovernance(),
        temporal: createMockTemporal({
          thermodynamic: { saturation: 1.0, temperature: 0, effectiveLambda: 0, lastUpdated: Date.now(), accessCount: 100 },
        }),
      },
      {
        id: 'doc_002',
        governance: createMockGovernance(),
        temporal: createMockTemporal({
          thermodynamic: { saturation: 0.95, temperature: 0.05, effectiveLambda: 0.0000005, lastUpdated: Date.now(), accessCount: 50 },
        }),
      },
    ];
    const events: GovernanceEventRecord[] = [];

    const view = buildSystemOverviewView(entities, events);

    expect(view.thermodynamicStats.groundStateCount).toBe(1);
    expect(view.thermodynamicStats.highlySaturatedCount).toBe(2);
    expect(view.thermodynamicStats.averageSaturation).toBe(0.975);
  });

  it('should summarize recent activity', () => {
    const entities: Array<{ id: string; governance: GovernanceMetadata; temporal: TemporalMetadata }> = [];
    const now = Date.now();
    const events: GovernanceEventRecord[] = [
      createMockEvent({ createdAt: now - 3600000 }), // 1 hour ago
      createMockEvent({ createdAt: now - 86400000 }), // 1 day ago
      createMockEvent({ createdAt: now - 172800000 }), // 2 days ago
    ];

    const view = buildSystemOverviewView(entities, events);

    expect(view.recentActivity.last24Hours).toBe(1);
    expect(view.recentActivity.last7Days).toBe(3);
  });

  it('should identify health issues for quarantined entities', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance({ state: 'quarantined' }), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];

    const view = buildSystemOverviewView(entities, events);

    expect(view.health.status).toBe('degraded');
    expect(view.health.issues.some((i) => i.category === 'governance' && i.description.includes('quarantine'))).toBe(true);
  });

  it('should report healthy status when no issues', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance({ state: 'provisional' }), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];

    const view = buildSystemOverviewView(entities, events);

    expect(view.health.status).toBe('healthy');
    expect(view.health.issues).toHaveLength(0);
  });
});

describe('formatSystemOverviewView', () => {
  it('should format system overview as readable text', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance(), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];
    const view = buildSystemOverviewView(entities, events);

    const formatted = formatSystemOverviewView(view);

    expect(formatted).toContain('📊 System Overview');
    expect(formatted).toContain('Entity Counts:');
    expect(formatted).toContain('Governance Distribution:');
    expect(formatted).toContain('Thermodynamic Statistics:');
    expect(formatted).toContain('Recent Activity:');
    expect(formatted).toContain('Health:');
  });

  it('should show health issues when present', () => {
    const entities = [
      { id: 'doc_001', governance: createMockGovernance({ state: 'quarantined' }), temporal: createMockTemporal() },
    ];
    const events: GovernanceEventRecord[] = [];
    const view = buildSystemOverviewView(entities, events);

    const formatted = formatSystemOverviewView(view);

    expect(formatted).toContain('Issues:');
    expect(formatted).toContain('quarantine');
  });
});

// ============================================================================
// Inspect Entity Tests
// ============================================================================

describe('inspectEntity', () => {
  it('should return comprehensive entity inspection', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const events: GovernanceEventRecord[] = [createMockEvent()];

    const inspection = inspectEntity('doc_001', 'document', 'Test Document', governance, temporal, events);

    expect(inspection.chain).toBeDefined();
    expect(inspection.decay).toBeDefined();
    expect(inspection.governance).toBeDefined();
    expect(inspection.summary).toBeDefined();
  });

  it('should include all view formats in summary', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const events: GovernanceEventRecord[] = [createMockEvent()];

    const inspection = inspectEntity('doc_001', 'document', 'Test Document', governance, temporal, events);

    expect(inspection.summary).toContain('📋 Chain State:');
    expect(inspection.summary).toContain('⏱️ Decay State:');
    expect(inspection.summary).toContain('⚖️ Governance State:');
  });

  it('should apply config to all views', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal({ restakeCount: 10 });
    const events: GovernanceEventRecord[] = [];
    const config: Partial<OperatorViewConfig> = { maxChainDepth: 2 };

    const inspection = inspectEntity('doc_001', 'document', 'Test', governance, temporal, events, config);

    expect(inspection.chain.provenanceChain.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Query and Health Tests
// ============================================================================

describe('queryOperatorViews', () => {
  it('should return query configuration', () => {
    const options = {
      entityIds: ['doc_001'],
      states: ['provisional' as GovernanceState],
      groundedOnly: true,
    };
    const config: Partial<OperatorViewConfig> = { maxRecentEvents: 5 };

    const result = queryOperatorViews(options, config);

    expect(result.filters).toEqual(options);
    expect(result.config.maxRecentEvents).toBe(5);
    expect(result.resultCount).toBe(0); // Stub returns 0
    expect(result.note).toContain('Production implementation');
  });
});

describe('checkOperatorViewsHealth', () => {
  it('should report healthy status', () => {
    const health = checkOperatorViewsHealth();

    expect(health.status).toBe('healthy');
    expect(health.availableViews).toContain('chain');
    expect(health.availableViews).toContain('decay');
    expect(health.availableViews).toContain('governance');
    expect(health.availableViews).toContain('system-overview');
    expect(health.issues).toHaveLength(0);
  });
});

describe('getViewCapabilities', () => {
  it('should return all available views', () => {
    const caps = getViewCapabilities();

    expect(caps.views).toHaveLength(4);
    expect(caps.views.some((v) => v.name === 'chain')).toBe(true);
    expect(caps.views.some((v) => v.name === 'decay')).toBe(true);
    expect(caps.views.some((v) => v.name === 'governance')).toBe(true);
    expect(caps.views.some((v) => v.name === 'system-overview')).toBe(true);
  });

  it('should include export formats for each view', () => {
    const caps = getViewCapabilities();

    for (const view of caps.views) {
      expect(view.exportFormats).toContain('json');
      expect(view.exportFormats).toContain('text');
      expect(view.exportFormats).toContain('markdown');
    }
  });
});

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe('DEFAULT_VIEW_CONFIG', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_VIEW_CONFIG.groundedOnly).toBe(false);
    expect(DEFAULT_VIEW_CONFIG.maxChainDepth).toBe(10);
    expect(DEFAULT_VIEW_CONFIG.projectionPeriods).toEqual([1, 24, 168, 720]);
    expect(DEFAULT_VIEW_CONFIG.maxRecentEvents).toBe(10);
    expect(DEFAULT_VIEW_CONFIG.includeConfidenceBreakdown).toBe(true);
    expect(DEFAULT_VIEW_CONFIG.timestampFormat).toBe('relative');
  });
});

// ============================================================================
// Acceptance Criteria Tests
// ============================================================================

describe('Acceptance Criteria: AC1 - Operators can inspect chain, decay, and governance state', () => {
  it('AC1: Chain state inspection is available', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();

    const view = buildChainStateView('doc_001', 'document', 'Test', governance, temporal);

    expect(view.entityId).toBeDefined();
    expect(view.provenanceChain).toBeDefined();
    expect(view.lifecycleState).toBeDefined();
  });

  it('AC1: Decay state inspection is available', () => {
    const temporal = createMockTemporal();

    const view = buildDecayStateView('doc_001', temporal);

    expect(view.thermodynamic).toBeDefined();
    expect(view.decayMetrics).toBeDefined();
    expect(view.activityHistory).toBeDefined();
  });

  it('AC1: Governance state inspection is available', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.governance).toBeDefined();
    expect(view.crystallizationEligible).toBeDefined();
    expect(view.recentEvents).toBeDefined();
  });

  it('AC1: inspectEntity provides all three views', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const events: GovernanceEventRecord[] = [];

    const inspection = inspectEntity('doc_001', 'document', 'Test', governance, temporal, events);

    expect(inspection.chain).toBeDefined();
    expect(inspection.decay).toBeDefined();
    expect(inspection.governance).toBeDefined();
  });
});

describe('Acceptance Criteria: AC2 - Views distinguish grounded memory evidence from inferred summaries', () => {
  it('AC2: Chain view marks grounded vs inferred provenance links', () => {
    const observationGov = createMockGovernance({ epistemicType: 'observation' });
    const conjectureGov = createMockGovernance({ epistemicType: 'conjecture' });
    const temporal = createMockTemporal();

    const groundedView = buildChainStateView('doc_001', 'document', 'Test', observationGov, temporal);
    const inferredView = buildChainStateView('doc_002', 'document', 'Test', conjectureGov, temporal);

    expect(groundedView.provenanceChain[0].grounded).toBe(true);
    expect(inferredView.provenanceChain[0].grounded).toBe(false);
  });

  it('AC2: Governance view marks events as grounded or inferred', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [
      createMockEvent({ summary: 'Document ingested from source' }),
      createMockEvent({ summary: 'Inferred relation synthesized' }),
    ];

    const view = buildGovernanceStateView('doc_001', governance, events);

    expect(view.recentEvents[0].grounded).toBe(true);
    expect(view.recentEvents[1].grounded).toBe(false);
  });

  it('AC2: Epistemic type affects grounded status in formatted output', () => {
    const observationGov = createMockGovernance({ epistemicType: 'observation' });
    const temporal = createMockTemporal();
    const view = buildChainStateView('doc_001', 'document', 'Test', observationGov, temporal);

    const formatted = formatChainStateView(view);

    expect(formatted).toContain('✓');
  });
});

describe('Acceptance Criteria: AC3 - Inspection surfaces support review without code-level tracing', () => {
  it('AC3: Chain view provides human-readable formatted output', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const view = buildChainStateView('doc_001', 'document', 'Test Document', governance, temporal);

    const formatted = formatChainStateView(view);

    expect(formatted).toContain('📋 Chain State:');
    expect(formatted).toContain('Kind:');
    expect(formatted).toContain('Title:');
    expect(formatted).toContain('Provenance Chain:');
    // Should be readable without code knowledge
    expect(formatted).not.toContain('[object');
    expect(formatted).not.toContain('undefined');
  });

  it('AC3: Decay view provides human-readable formatted output', () => {
    const temporal = createMockTemporal();
    const view = buildDecayStateView('doc_001', temporal);

    const formatted = formatDecayStateView(view);

    expect(formatted).toContain('⏱️ Decay State:');
    expect(formatted).toContain('Profile:');
    expect(formatted).toContain('Saturation:');
    // Should be readable without code knowledge
    expect(formatted).not.toContain('[object');
    expect(formatted).not.toContain('undefined');
  });

  it('AC3: Governance view provides human-readable formatted output', () => {
    const governance = createMockGovernance();
    const events: GovernanceEventRecord[] = [createMockEvent()];
    const view = buildGovernanceStateView('doc_001', governance, events);

    const formatted = formatGovernanceStateView(view);

    expect(formatted).toContain('⚖️ Governance State:');
    expect(formatted).toContain('Confidence:');
    expect(formatted).toContain('Crystallization:');
    // Should be readable without code knowledge
    expect(formatted).not.toContain('[object');
    expect(formatted).not.toContain('undefined');
  });

  it('AC3: System overview provides human-readable formatted output', () => {
    const entities = [{ id: 'doc_001', governance: createMockGovernance(), temporal: createMockTemporal() }];
    const events: GovernanceEventRecord[] = [];
    const view = buildSystemOverviewView(entities, events);

    const formatted = formatSystemOverviewView(view);

    expect(formatted).toContain('📊 System Overview');
    expect(formatted).toContain('Entity Counts:');
    expect(formatted).toContain('Health:');
    // Should be readable without code knowledge
    expect(formatted).not.toContain('[object');
    expect(formatted).not.toContain('undefined');
  });

  it('AC3: inspectEntity provides comprehensive readable summary', () => {
    const governance = createMockGovernance();
    const temporal = createMockTemporal();
    const events: GovernanceEventRecord[] = [createMockEvent()];

    const inspection = inspectEntity('doc_001', 'document', 'Test Document', governance, temporal, events);

    expect(inspection.summary).toContain('📋');
    expect(inspection.summary).toContain('⏱️');
    expect(inspection.summary).toContain('⚖️');
    expect(inspection.summary.length).toBeGreaterThan(100);
  });

  it('AC3: Health check provides legible status', () => {
    const health = checkOperatorViewsHealth();

    expect(health.status).toBeDefined();
    expect(['healthy', 'degraded', 'unavailable']).toContain(health.status);
    expect(health.availableViews).toBeDefined();
  });

  it('AC3: View capabilities document available inspection options', () => {
    const caps = getViewCapabilities();

    for (const view of caps.views) {
      expect(view.name).toBeDefined();
      expect(view.description).toBeDefined();
      expect(view.description.length).toBeGreaterThan(10);
      expect(view.exportFormats).toBeDefined();
    }
  });
});
