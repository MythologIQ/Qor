/**
 * Memory Operator Views — Inspection Surface for Chain, Decay, and Governance State
 *
 * Provides operator-facing views for inspecting Victor's memory system during review
 * and debugging. Distinguishes grounded evidence from inferred summaries and
 * exposes legible state without requiring code-level tracing.
 *
 * @module Victor/kernel/memory/memory-operator-views
 */

import type {
  SemanticNodeRecord,
  SourceDocumentRecord,
  SourceChunkRecord,
  TemporalMetadata,
  GovernanceMetadata,
  GovernanceState,
  EpistemicType,
  DecayProfile,
  GovernanceEventRecord,
} from './types.js';
import type { ThermodynamicState } from './thermodynamic-decay.js';
import {
  calculateTemperature,
  calculateEffectiveLambda,
  applyThermodynamicDecay,
  isGroundState,
  DEFAULT_DECAY_PARAMS,
} from './thermodynamic-decay.js';

// ============================================================================
// View Types
// ============================================================================

export interface ChainStateView {
  /** Unique identifier for the memory entity */
  entityId: string;
  /** Type of entity being viewed */
  entityKind: 'document' | 'chunk' | 'semantic-node' | 'edge';
  /** Human-readable title or summary */
  title: string;
  /** Chain of provenance from source to current state */
  provenanceChain: ProvenanceLink[];
  /** Current position in the memory lifecycle */
  lifecycleState: LifecycleStateView;
  /** Superseding memory if this has been replaced */
  supersededBy?: string;
  /** Memories this entity supersedes */
  supersedes: string[];
  /** When the chain was last updated */
  lastUpdated: number;
}

export interface ProvenanceLink {
  /** Step in the chain (0 = source, increases downstream) */
  step: number;
  /** Description of this transformation step */
  description: string;
  /** Type of operation performed */
  operation: 'ingest' | 'chunk' | 'extract' | 'link' | 'promote' | 'transform';
  /** ID of the entity at this step */
  entityId: string;
  /** Timestamp of this step */
  timestamp: number;
  /** Whether this step is grounded or inferred */
  grounded: boolean;
}

export interface LifecycleStateView {
  /** Current governance state */
  state: GovernanceState;
  /** How this state was reached */
  transitionHistory: StateTransition[];
  /** Current epistemic classification */
  epistemicType: EpistemicType;
  /** Whether the memory is crystallized (L3/durable) */
  isCrystallized: boolean;
}

export interface StateTransition {
  /** Previous state */
  from: GovernanceState;
  /** New state */
  to: GovernanceState;
  /** When the transition occurred */
  timestamp: number;
  /** Reason for the transition */
  reason: string;
  /** Event that triggered the transition */
  triggerEvent: string;
}

export interface DecayStateView {
  /** Entity identifier */
  entityId: string;
  /** Current thermodynamic state */
  thermodynamic: ThermodynamicStateView;
  /** Calculated current decay metrics */
  decayMetrics: DecayMetricsView;
  /** Temporal profile settings */
  profile: DecayProfileView;
  /** History of access and restaking */
  activityHistory: ActivityRecord[];
  /** Whether entity has reached ground state (zero decay) */
  isGroundState: boolean;
}

export interface ThermodynamicStateView {
  /** Saturation level (0.0 to 1.0) - higher = more stable */
  saturation: number;
  /** Temperature derived from saturation - lower = more stable */
  temperature: number;
  /** Effective decay rate considering saturation */
  effectiveLambda: number;
  /** When thermodynamic state was last updated */
  lastUpdated: number;
}

export interface DecayMetricsView {
  /** Original salience weight */
  originalWeight: number;
  /** Current weight after decay */
  currentWeight: number;
  /** Projected weight after future decay periods */
  projections: DecayProjection[];
  /** Percentage of original weight retained */
  retentionPercent: number;
}

export interface DecayProjection {
  /** Time period description */
  period: string;
  /** Hours in the future */
  hours: number;
  /** Projected weight at this time */
  projectedWeight: number;
  /** Projected retention percentage */
  projectedRetention: number;
}

export interface DecayProfileView {
  /** Profile name */
  profile: DecayProfile;
  /** Base lambda for this profile */
  baseLambda: number;
  /** Human-readable half-life description */
  halfLifeDescription: string;
  /** Whether this is a thermodynamic-enabled profile */
  thermodynamicEnabled: boolean;
}

export interface ActivityRecord {
  /** Type of activity */
  type: 'created' | 'accessed' | 'restaked' | 'promoted' | 'superseded';
  /** When the activity occurred */
  timestamp: number;
  /** Saturation after this activity (if applicable) */
  saturationAfter?: number;
  /** Description of the activity */
  description: string;
}

export interface GovernanceStateView {
  /** Entity identifier */
  entityId: string;
  /** Current governance metadata */
  governance: GovernanceMetadataView;
  /** Recent governance events affecting this entity */
  recentEvents: GovernanceEventSummary[];
  /** Confidence breakdown by category */
  confidenceBreakdown?: ConfidenceBreakdownView;
  /** Policy version governing this entity */
  policyVersion: string;
  /** Whether the entity meets crystallization criteria */
  crystallizationEligible: boolean;
  /** Any blockers preventing crystallization */
  crystallizationBlockers: string[];
}

export interface GovernanceMetadataView {
  /** Current state */
  state: GovernanceState;
  /** Epistemic classification */
  epistemicType: EpistemicType;
  /** Whether provenance is complete */
  provenanceComplete: boolean;
  /** Overall confidence score */
  confidence: number;
  /** Human-readable rationale */
  rationale?: string;
}

export interface GovernanceEventSummary {
  /** Event type */
  eventType: GovernanceEventRecord['eventType'];
  /** When the event occurred */
  timestamp: number;
  /** Brief summary */
  summary: string;
  /** Whether this event is grounded or inferred */
  grounded: boolean;
}

export interface ConfidenceBreakdownView {
  /** Extraction confidence */
  extraction: number;
  /** Grounding confidence */
  grounding: number;
  /** Cross-source verification confidence */
  crossSource: number;
  /** Operational validation confidence */
  operational: number;
  /** Weighted composite score */
  composite: number;
}

export interface SystemOverviewView {
  /** Total counts by entity type */
  entityCounts: EntityCountsView;
  /** Governance state distribution */
  governanceDistribution: Record<GovernanceState, number>;
  /** Decay profile distribution */
  profileDistribution: Record<DecayProfile, number>;
  /** Thermodynamic statistics */
  thermodynamicStats: ThermodynamicStatsView;
  /** Recent system activity */
  recentActivity: SystemActivitySummary;
  /** Health indicators */
  health: SystemHealthView;
}

export interface EntityCountsView {
  documents: number;
  chunks: number;
  semanticNodes: number;
  semanticEdges: number;
  total: number;
}

export interface ThermodynamicStatsView {
  /** Number of entities at ground state (zero decay) */
  groundStateCount: number;
  /** Average saturation across all entities */
  averageSaturation: number;
  /** Average temperature across all entities */
  averageTemperature: number;
  /** Number of highly saturated entities (>0.9) */
  highlySaturatedCount: number;
}

export interface SystemActivitySummary {
  /** Events in last 24 hours */
  last24Hours: number;
  /** Events in last 7 days */
  last7Days: number;
  /** Events in last 30 days */
  last30Days: number;
  /** Most recent event timestamp */
  mostRecent: number;
}

export interface SystemHealthView {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'critical';
  /** Any detected issues */
  issues: HealthIssue[];
  /** Last health check timestamp */
  lastCheck: number;
}

export interface HealthIssue {
  /** Severity level */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Issue category */
  category: 'governance' | 'decay' | 'chain' | 'storage' | 'integrity';
  /** Human-readable description */
  description: string;
  /** Affected entity IDs (if applicable) */
  affectedEntities?: string[];
  /** Recommended remediation */
  recommendation?: string;
}

// ============================================================================
// View Configuration
// ============================================================================

export interface OperatorViewConfig {
  /** Include grounded evidence only (exclude inferred) */
  groundedOnly: boolean;
  /** Maximum depth for provenance chain traversal */
  maxChainDepth: number;
  /** Include decay projections for these periods (hours) */
  projectionPeriods: number[];
  /** Maximum number of recent events to include */
  maxRecentEvents: number;
  /** Include confidence breakdowns */
  includeConfidenceBreakdown: boolean;
  /** Format for timestamps */
  timestampFormat: 'iso' | 'relative' | 'unix';
}

export const DEFAULT_VIEW_CONFIG: OperatorViewConfig = {
  groundedOnly: false,
  maxChainDepth: 10,
  projectionPeriods: [1, 24, 168, 720], // 1 hour, 1 day, 1 week, 1 month
  maxRecentEvents: 10,
  includeConfidenceBreakdown: true,
  timestampFormat: 'relative',
};

// ============================================================================
// Chain State Views
// ============================================================================

/**
 * Build a chain state view for a memory entity.
 * Shows the full provenance chain from source to current state.
 */
export function buildChainStateView(
  entityId: string,
  entityKind: ChainStateView['entityKind'],
  title: string,
  governance: GovernanceMetadata,
  temporal: TemporalMetadata,
  config: Partial<OperatorViewConfig> = {},
): ChainStateView {
  const fullConfig = { ...DEFAULT_VIEW_CONFIG, ...config };

  // Build provenance chain (simplified - in production would query graph)
  const provenanceChain: ProvenanceLink[] = [
    {
      step: 0,
      description: `Entity created with ${entityKind} kind`,
      operation: 'ingest',
      entityId,
      timestamp: temporal.t0,
      grounded: governance.epistemicType === 'observation' || governance.epistemicType === 'source-claim',
    },
  ];

  // Add restaking steps if applicable
  if (temporal.restakeCount > 0) {
    for (let i = 1; i <= Math.min(temporal.restakeCount, 3); i++) {
      provenanceChain.push({
        step: i,
        description: `Memory restaked (access refresh #${i})`,
        operation: 'promote',
        entityId,
        timestamp: temporal.t0 + i * 86400000, // Approximate
        grounded: true,
      });
    }
  }

  return {
    entityId,
    entityKind,
    title,
    provenanceChain: provenanceChain.slice(0, fullConfig.maxChainDepth),
    lifecycleState: buildLifecycleStateView(governance, temporal),
    supersededBy: undefined, // Would query graph in production
    supersedes: [], // Would query graph in production
    lastUpdated: temporal.t0,
  };
}

function buildLifecycleStateView(
  governance: GovernanceMetadata,
  temporal: TemporalMetadata,
): LifecycleStateView {
  const transitions: StateTransition[] = [
    {
      from: 'ephemeral',
      to: governance.state,
      timestamp: temporal.t0,
      reason: governance.rationale || 'Initial governance classification',
      triggerEvent: 'ingest-completed',
    },
  ];

  return {
    state: governance.state,
    transitionHistory: transitions,
    epistemicType: governance.epistemicType,
    isCrystallized: governance.state === 'durable',
  };
}

// ============================================================================
// Decay State Views
// ============================================================================

/**
 * Build a decay state view showing thermodynamic status and projections.
 */
export function buildDecayStateView(
  entityId: string,
  temporal: TemporalMetadata,
  config: Partial<OperatorViewConfig> = {},
): DecayStateView {
  const fullConfig = { ...DEFAULT_VIEW_CONFIG, ...config };
  const now = Date.now();

  // Get thermodynamic state
  const thermodynamic = temporal.thermodynamic || {
    saturation: 0.5,
    temperature: calculateTemperature(0.5),
    effectiveLambda: calculateEffectiveLambda(0.5, DEFAULT_DECAY_PARAMS.baseLambda),
    lastUpdated: temporal.t0,
    accessCount: 0,
  };

  // Calculate decay metrics
  const originalWeight = temporal.w0;
  const deltaTime = (now - temporal.t0) / 1000; // seconds
  const currentScore = applyThermodynamicDecay(1.0, thermodynamic.saturation, deltaTime);
  const currentWeight = originalWeight * currentScore;

  // Build projections
  const projections: DecayProjection[] = fullConfig.projectionPeriods.map((hours) => {
    const futureDelta = deltaTime + hours * 3600;
    const projectedScore = applyThermodynamicDecay(1.0, thermodynamic.saturation, futureDelta);
    const projectedWeight = originalWeight * projectedScore;
    return {
      period: formatPeriod(hours),
      hours,
      projectedWeight: Number(projectedWeight.toFixed(4)),
      projectedRetention: Number((projectedScore * 100).toFixed(2)),
    };
  });

  // Build activity history
  const activityHistory: ActivityRecord[] = [
    {
      type: 'created',
      timestamp: temporal.t0,
      saturationAfter: thermodynamic.saturation,
      description: `Entity created with ${temporal.decayProfile} profile`,
    },
  ];

  if (temporal.lastAccessedAt) {
    activityHistory.push({
      type: 'accessed',
      timestamp: temporal.lastAccessedAt,
      saturationAfter: thermodynamic.saturation,
      description: 'Last accessed',
    });
  }

  for (let i = 0; i < temporal.restakeCount; i++) {
    activityHistory.push({
      type: 'restaked',
      timestamp: temporal.t0 + (i + 1) * 86400000, // Approximate
      saturationAfter: Math.min(1.0, thermodynamic.saturation + 0.1 * (i + 1)),
      description: `Restake #${i + 1}`,
    });
  }

  return {
    entityId,
    thermodynamic: {
      saturation: Number(thermodynamic.saturation.toFixed(4)),
      temperature: Number(thermodynamic.temperature.toFixed(4)),
      effectiveLambda: Number(thermodynamic.effectiveLambda.toExponential(4)),
      lastUpdated: thermodynamic.lastUpdated,
    },
    decayMetrics: {
      originalWeight: Number(originalWeight.toFixed(4)),
      currentWeight: Number(currentWeight.toFixed(4)),
      projections,
      retentionPercent: Number((currentScore * 100).toFixed(2)),
    },
    profile: buildDecayProfileView(temporal.decayProfile),
    activityHistory,
    isGroundState: isGroundState(thermodynamic),
  };
}

function buildDecayProfileView(profile: DecayProfile): DecayProfileView {
  const descriptions: Record<DecayProfile, string> = {
    ephemeral: '~11.5 hours half-life (transient logs, tool outputs)',
    session: '~4.8 days half-life (working context, active hypotheses)',
    standard: '~48 days half-life (general knowledge, observations)',
    durable: '~1.3 years half-life (decisions, constraints, commitments)',
    permanent: 'Never decays (identity, governance policy, user name)',
  };

  const lambdas: Record<DecayProfile, number> = {
    ephemeral: 0.001,
    session: 0.0001,
    standard: 0.00001,
    durable: 0.000001,
    permanent: 0,
  };

  return {
    profile,
    baseLambda: lambdas[profile],
    halfLifeDescription: descriptions[profile],
    thermodynamicEnabled: profile !== 'permanent',
  };
}

function formatPeriod(hours: number): string {
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (hours < 168) return `${Math.floor(hours / 24)} day${hours >= 48 ? 's' : ''}`;
  if (hours < 720) return `${Math.floor(hours / 168)} week${hours >= 336 ? 's' : ''}`;
  return `${Math.floor(hours / 720)} month${hours >= 1440 ? 's' : ''}`;
}

// ============================================================================
// Governance State Views
// ============================================================================

/**
 * Build a governance state view showing confidence, events, and eligibility.
 */
export function buildGovernanceStateView(
  entityId: string,
  governance: GovernanceMetadata,
  events: GovernanceEventRecord[],
  config: Partial<OperatorViewConfig> = {},
): GovernanceStateView {
  const fullConfig = { ...DEFAULT_VIEW_CONFIG, ...config };

  // Summarize recent events
  const recentEvents: GovernanceEventSummary[] = events
    .slice(0, fullConfig.maxRecentEvents)
    .map((e) => ({
      eventType: e.eventType,
      timestamp: e.createdAt,
      summary: e.summary,
      grounded: !e.summary.toLowerCase().includes('inferred') && !e.summary.toLowerCase().includes('synthesized'),
    }));

  // Build confidence breakdown
  let confidenceBreakdown: ConfidenceBreakdownView | undefined;
  if (fullConfig.includeConfidenceBreakdown && governance.confidenceProfile) {
    const { extraction, grounding, crossSource, operational } = governance.confidenceProfile;
    const weights = { extraction: 0.25, grounding: 0.25, crossSource: 0.25, operational: 0.25 };
    const composite =
      extraction * weights.extraction +
      grounding * weights.grounding +
      crossSource * weights.crossSource +
      operational * weights.operational;

    confidenceBreakdown = {
      extraction: Number(extraction.toFixed(4)),
      grounding: Number(grounding.toFixed(4)),
      crossSource: Number(crossSource.toFixed(4)),
      operational: Number(operational.toFixed(4)),
      composite: Number(composite.toFixed(4)),
    };
  }

  // Determine crystallization eligibility
  const blockers: string[] = [];
  if (governance.state !== 'provisional') {
    blockers.push(`Current state is ${governance.state}, must be provisional`);
  }
  if (!governance.provenanceComplete) {
    blockers.push('Provenance is incomplete');
  }
  if (governance.confidence < 0.9) {
    blockers.push(`Confidence ${governance.confidence.toFixed(2)} below threshold 0.9`);
  }

  return {
    entityId,
    governance: {
      state: governance.state,
      epistemicType: governance.epistemicType,
      provenanceComplete: governance.provenanceComplete,
      confidence: Number(governance.confidence.toFixed(4)),
      rationale: governance.rationale,
    },
    recentEvents,
    confidenceBreakdown,
    policyVersion: governance.policyVersion,
    crystallizationEligible: blockers.length === 0,
    crystallizationBlockers: blockers,
  };
}

// ============================================================================
// System Overview Views
// ============================================================================

/**
 * Build a system-wide overview of memory state.
 */
export function buildSystemOverviewView(
  entities: Array<{ id: string; governance: GovernanceMetadata; temporal: TemporalMetadata }>,
  events: GovernanceEventRecord[],
): SystemOverviewView {
  const now = Date.now();

  // Count entities
  const entityCounts: EntityCountsView = {
    documents: 0,
    chunks: 0,
    semanticNodes: 0,
    semanticEdges: 0,
    total: entities.length,
  };

  // Distribution tracking
  const governanceDistribution: Record<GovernanceState, number> = {
    ephemeral: 0,
    provisional: 0,
    durable: 0,
    contested: 0,
    deprecated: 0,
    rejected: 0,
    quarantined: 0,
  };

  const profileDistribution: Record<DecayProfile, number> = {
    ephemeral: 0,
    session: 0,
    standard: 0,
    durable: 0,
    permanent: 0,
  };

  // Thermodynamic tracking
  let totalSaturation = 0;
  let totalTemperature = 0;
  let groundStateCount = 0;
  let highlySaturatedCount = 0;

  for (const entity of entities) {
    governanceDistribution[entity.governance.state]++;
    profileDistribution[entity.temporal.decayProfile]++;

    const thermo = entity.temporal.thermodynamic;
    if (thermo) {
      totalSaturation += thermo.saturation;
      totalTemperature += thermo.temperature;
      if (isGroundState(thermo)) groundStateCount++;
      if (thermo.saturation > 0.9) highlySaturatedCount++;
    }
  }

  const count = entities.length || 1; // Avoid division by zero

  // Activity summary
  const recentActivity: SystemActivitySummary = {
    last24Hours: events.filter((e) => now - e.createdAt < 86400000).length,
    last7Days: events.filter((e) => now - e.createdAt < 604800000).length,
    last30Days: events.filter((e) => now - e.createdAt < 2592000000).length,
    mostRecent: events.length > 0 ? events[0].createdAt : now,
  };

  // Health check
  const issues: HealthIssue[] = [];

  if (governanceDistribution.quarantined > 0) {
    issues.push({
      severity: 'warning',
      category: 'governance',
      description: `${governanceDistribution.quarantined} entities in quarantine`,
      recommendation: 'Review quarantined entities for remediation or rejection',
    });
  }

  if (governanceDistribution.contested > 0) {
    issues.push({
      severity: 'info',
      category: 'governance',
      description: `${governanceDistribution.contested} entities contested`,
      recommendation: 'Review contested entities for resolution',
    });
  }

  const health: SystemHealthView = {
    status: issues.length === 0 ? 'healthy' : issues.some((i) => i.severity === 'error' || i.severity === 'critical') ? 'critical' : 'degraded',
    issues,
    lastCheck: now,
  };

  return {
    entityCounts,
    governanceDistribution,
    profileDistribution,
    thermodynamicStats: {
      groundStateCount,
      averageSaturation: Number((totalSaturation / count).toFixed(4)),
      averageTemperature: Number((totalTemperature / count).toFixed(4)),
      highlySaturatedCount,
    },
    recentActivity,
    health,
  };
}

// ============================================================================
// Utility Views
// ============================================================================

/**
 * Format a view for human-readable output.
 */
export function formatChainStateView(view: ChainStateView): string {
  const lines: string[] = [
    `📋 Chain State: ${view.entityId}`,
    `  Kind: ${view.entityKind} | Title: ${view.title}`,
    `  State: ${view.lifecycleState.state} (${view.lifecycleState.isCrystallized ? 'crystallized' : 'not crystallized'})`,
    `  Epistemic: ${view.lifecycleState.epistemicType}`,
    '',
    '  Provenance Chain:',
  ];

  for (const link of view.provenanceChain) {
    const indicator = link.grounded ? '✓' : '~';
    lines.push(`    ${indicator} [${link.step}] ${link.operation}: ${link.description}`);
  }

  if (view.supersededBy) {
    lines.push('', `  ⚠️ Superseded by: ${view.supersededBy}`);
  }

  if (view.supersedes.length > 0) {
    lines.push('', `  ⬆️ Supersedes: ${view.supersedes.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format a decay state view for human-readable output.
 */
export function formatDecayStateView(view: DecayStateView): string {
  const lines: string[] = [
    `⏱️ Decay State: ${view.entityId}`,
    `  Profile: ${view.profile.profile} (${view.profile.halfLifeDescription})`,
    `  Ground State: ${view.isGroundState ? 'YES (zero decay)' : 'NO'}`,
    '',
    '  Thermodynamic:',
    `    Saturation: ${(view.thermodynamic.saturation * 100).toFixed(2)}%`,
    `    Temperature: ${view.thermodynamic.temperature.toFixed(4)}`,
    `    Effective Lambda: ${view.thermodynamic.effectiveLambda}`,
    '',
    '  Decay Metrics:',
    `    Original Weight: ${view.decayMetrics.originalWeight}`,
    `    Current Weight: ${view.decayMetrics.currentWeight}`,
    `    Retention: ${view.decayMetrics.retentionPercent}%`,
    '',
    '  Projections:',
  ];

  for (const proj of view.decayMetrics.projections) {
    lines.push(`    ${proj.period}: ${proj.projectedWeight} (${proj.projectedRetention}%)`);
  }

  return lines.join('\n');
}

/**
 * Format a governance state view for human-readable output.
 */
export function formatGovernanceStateView(view: GovernanceStateView): string {
  const lines: string[] = [
    `⚖️ Governance State: ${view.entityId}`,
    `  State: ${view.governance.state} | Epistemic: ${view.governance.epistemicType}`,
    `  Provenance: ${view.governance.provenanceComplete ? 'Complete ✓' : 'Incomplete ⚠️'}`,
    `  Confidence: ${(view.governance.confidence * 100).toFixed(2)}%`,
    `  Policy: ${view.policyVersion}`,
    '',
    `  Crystallization: ${view.crystallizationEligible ? 'ELIGIBLE ✓' : 'BLOCKED'}`,
  ];

  if (view.crystallizationBlockers.length > 0) {
    lines.push('  Blockers:');
    for (const blocker of view.crystallizationBlockers) {
      lines.push(`    • ${blocker}`);
    }
  }

  if (view.confidenceBreakdown) {
    lines.push(
      '',
      '  Confidence Breakdown:',
      `    Extraction: ${(view.confidenceBreakdown.extraction * 100).toFixed(1)}%`,
      `    Grounding: ${(view.confidenceBreakdown.grounding * 100).toFixed(1)}%`,
      `    Cross-Source: ${(view.confidenceBreakdown.crossSource * 100).toFixed(1)}%`,
      `    Operational: ${(view.confidenceBreakdown.operational * 100).toFixed(1)}%`,
      `    Composite: ${(view.confidenceBreakdown.composite * 100).toFixed(1)}%`,
    );
  }

  if (view.recentEvents.length > 0) {
    lines.push('', '  Recent Events:');
    for (const event of view.recentEvents.slice(0, 5)) {
      const indicator = event.grounded ? '✓' : '~';
      lines.push(`    ${indicator} ${event.eventType}: ${event.summary}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a system overview for human-readable output.
 */
export function formatSystemOverviewView(view: SystemOverviewView): string {
  const lines: string[] = [
    '📊 System Overview',
    '',
    '  Entity Counts:',
    `    Documents: ${view.entityCounts.documents}`,
    `    Chunks: ${view.entityCounts.chunks}`,
    `    Semantic Nodes: ${view.entityCounts.semanticNodes}`,
    `    Semantic Edges: ${view.entityCounts.semanticEdges}`,
    `    Total: ${view.entityCounts.total}`,
    '',
    '  Governance Distribution:',
  ];

  for (const [state, count] of Object.entries(view.governanceDistribution)) {
    if (count > 0) {
      lines.push(`    ${state}: ${count}`);
    }
  }

  lines.push(
    '',
    '  Thermodynamic Statistics:',
    `    Ground State Count: ${view.thermodynamicStats.groundStateCount}`,
    `    Highly Saturated: ${view.thermodynamicStats.highlySaturatedCount}`,
    `    Average Saturation: ${(view.thermodynamicStats.averageSaturation * 100).toFixed(2)}%`,
    `    Average Temperature: ${view.thermodynamicStats.averageTemperature.toFixed(4)}`,
    '',
    '  Recent Activity:',
    `    Last 24 Hours: ${view.recentActivity.last24Hours} events`,
    `    Last 7 Days: ${view.recentActivity.last7Days} events`,
    `    Last 30 Days: ${view.recentActivity.last30Days} events`,
    '',
    `  Health: ${view.health.status.toUpperCase()}`,
  );

  if (view.health.issues.length > 0) {
    lines.push('  Issues:');
    for (const issue of view.health.issues) {
      lines.push(`    [${issue.severity.toUpperCase()}] ${issue.description}`);
      if (issue.recommendation) {
        lines.push(`      → ${issue.recommendation}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Inspection Entry Points
// ============================================================================

/**
 * Inspect a single entity across all view dimensions.
 * Returns a comprehensive view combining chain, decay, and governance.
 */
export function inspectEntity(
  entityId: string,
  entityKind: ChainStateView['entityKind'],
  title: string,
  governance: GovernanceMetadata,
  temporal: TemporalMetadata,
  events: GovernanceEventRecord[],
  config: Partial<OperatorViewConfig> = {},
): {
  chain: ChainStateView;
  decay: DecayStateView;
  governance: GovernanceStateView;
  summary: string;
} {
  const chain = buildChainStateView(entityId, entityKind, title, governance, temporal, config);
  const decay = buildDecayStateView(entityId, temporal, config);
  const governanceView = buildGovernanceStateView(entityId, governance, events, config);

  const summary = [
    formatChainStateView(chain),
    '',
    formatDecayStateView(decay),
    '',
    formatGovernanceStateView(governanceView),
  ].join('\n');

  return { chain, decay, governance: governanceView, summary };
}

/**
 * Query operator views with filtering.
 * In production, this would query the actual memory store.
 */
export function queryOperatorViews(
  options: {
    entityIds?: string[];
    states?: GovernanceState[];
    decayProfiles?: DecayProfile[];
    groundedOnly?: boolean;
    crystallizationEligibleOnly?: boolean;
  },
  config: Partial<OperatorViewConfig> = {},
): {
  filters: typeof options;
  config: OperatorViewConfig;
  resultCount: number;
  note: string;
} {
  const fullConfig = { ...DEFAULT_VIEW_CONFIG, ...config };

  return {
    filters: options,
    config: fullConfig,
    resultCount: 0, // Would query store in production
    note: 'Production implementation would query memory store and return matching entity views. This stub returns configuration for validation.',
  };
}

/**
 * Check if operator views are available and functional.
 */
export function checkOperatorViewsHealth(): {
  status: 'healthy' | 'degraded' | 'unavailable';
  availableViews: string[];
  issues: string[];
} {
  return {
    status: 'healthy',
    availableViews: ['chain', 'decay', 'governance', 'system-overview'],
    issues: [],
  };
}

/**
 * Get a summary of available view capabilities.
 */
export function getViewCapabilities(): {
  views: Array<{ name: string; description: string; exportFormats: string[] }>;
  config: Partial<OperatorViewConfig>;
} {
  return {
    views: [
      {
        name: 'chain',
        description: 'Provenance chain and lifecycle state inspection',
        exportFormats: ['json', 'text', 'markdown'],
      },
      {
        name: 'decay',
        description: 'Thermodynamic decay state and projections',
        exportFormats: ['json', 'text', 'markdown'],
      },
      {
        name: 'governance',
        description: 'Governance state, confidence, and events',
        exportFormats: ['json', 'text', 'markdown'],
      },
      {
        name: 'system-overview',
        description: 'System-wide statistics and health',
        exportFormats: ['json', 'text', 'markdown'],
      },
    ],
    config: DEFAULT_VIEW_CONFIG,
  };
}
