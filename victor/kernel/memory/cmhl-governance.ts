/**
 * CMHL Governance Integration
 *
 * Connects Continual Memory Half-Life (CMHL) temporal memory operations
 * to the governance ledger. Records restake events, decay transitions,
 * and temporal chain operations for audit and compliance.
 *
 * @module kernel/memory/cmhl-governance
 * @see task_cmhl_governance_integration in phases.json
 */

import type { GraphStore } from './store';
import type { GovernanceEventRecord, TemporalMetadata, DecayProfile } from './types';
import type { RestakeEvent, RestakeBudgetState, BatchRestakeResult } from './restaking';

// ============================================================================
// CMHL Governance Event Types
// ============================================================================

/** Extended event types for CMHL governance operations */
export type CMHLGovernanceEventType =
  | 'restake-executed'
  | 'restake-rejected'
  | 'decay-threshold-filtered'
  | 'temporal-chain-linked'
  | 'memory-superseded';

/** CMHL-specific metadata for governance events */
export interface CMHLGovernanceMetadata {
  /** Type of CMHL operation */
  cmhlOperation: CMHLGovernanceEventType;

  /** Restake count at time of event */
  restakeCount?: number;

  /** Decay profile of the affected memory */
  decayProfile?: DecayProfile;

  /** Lambda value for decay calculation */
  lambda?: number;

  /** Effective t0 after restaking */
  effectiveT0?: number;

  /** Freshness boost percentage from restaking */
  freshnessBoostPercent?: number;

  /** Budget remaining at time of event */
  budgetRemaining?: number;

  /** Whether governance approval was required */
  governanceApprovalRequired?: boolean;

  /** Whether governance approval was granted */
  governanceApprovalGranted?: boolean;

  /** Chain depth for temporal chaining events */
  chainDepth?: number;

  /** Number of memories filtered by decay threshold */
  filteredCount?: number;

  /** Decay threshold applied */
  decayThreshold?: number;
}

// ============================================================================
// CMHL Governance Hooks
// ============================================================================

/**
 * Configuration for CMHL governance integration.
 */
export interface CMHLGovernanceConfig {
  /** Policy version for governance events */
  policyVersion: string;

  /** Whether to record restake events */
  recordRestakeEvents: boolean;

  /** Whether to record decay filtering events */
  recordDecayEvents: boolean;

  /** Whether to record temporal chain events */
  recordChainEvents: boolean;

  /** Minimum restakes before logging summary events */
  summaryThreshold: number;
}

/** Default CMHL governance configuration */
export const DEFAULT_CMHL_GOVERNANCE_CONFIG: CMHLGovernanceConfig = {
  policyVersion: '2026-03-18.cmhl-v1',
  recordRestakeEvents: true,
  recordDecayEvents: true,
  recordChainEvents: true,
  summaryThreshold: 10,
};

/**
 * Creates a governance event from a CMHL operation.
 */
function createCMHLGovernanceEvent(
  eventType: CMHLGovernanceEventType,
  entityId: string,
  entityKind: GovernanceEventRecord['entityKind'],
  metadata: CMHLGovernanceMetadata,
  summary: string,
  config: CMHLGovernanceConfig,
): GovernanceEventRecord {
  return {
    id: `cmhl-${eventType}-${entityId}-${Date.now()}`,
    eventType: mapCMHLEventType(eventType),
    entityKind,
    entityId,
    policyVersion: config.policyVersion,
    createdAt: Date.now(),
    summary,
    metadata: {
      ...metadata,
      cmhlOperation: eventType,
    },
  };
}

/**
 * Maps CMHL-specific event types to standard governance event types.
 */
function mapCMHLEventType(cmhlType: CMHLGovernanceEventType): GovernanceEventRecord['eventType'] {
  switch (cmhlType) {
    case 'restake-executed':
      return 'promotion-approved';
    case 'restake-rejected':
      return 'promotion-rejected';
    case 'decay-threshold-filtered':
      return 'recall-downgraded';
    case 'temporal-chain-linked':
    case 'memory-superseded':
      return 'contradiction-registered';
    default:
      return 'promotion-approved';
  }
}

// ============================================================================
// CMHL Governance Hook Functions
// ============================================================================

/**
 * Records a restake event to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param event - The restake event to record
 * @param budget - Current budget state
 * @param config - Governance configuration
 */
export async function recordRestakeEvent(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  event: RestakeEvent,
  budget: RestakeBudgetState,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordRestakeEvents) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'restake-executed',
    restakeCount: event.newTemporal.restakeCount,
    decayProfile: event.newTemporal.decayProfile,
    lambda: event.newTemporal.lambda,
    effectiveT0: effectiveT0FromTemporal(event.newTemporal),
    freshnessBoostPercent: calculateFreshnessBoost(
      event.previousTemporal,
      event.newTemporal,
      event.restakedAt,
    ),
    budgetRemaining: budget.budgetLimit - budget.usedCount,
    governanceApprovalRequired: event.governanceApproval.required,
    governanceApprovalGranted: event.governanceApproval.granted,
  };

  const summary = event.governanceApproval.granted
    ? `Memory restaked: ${event.reason} (restake #${event.newTemporal.restakeCount})`
    : `Memory restake pending approval: ${event.reason} (requires governance review)`;

  const governanceEvent = createCMHLGovernanceEvent(
    'restake-executed',
    event.targetUorId,
    mapEntityKind(event.targetEntityKind),
    metadata,
    summary,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

/**
 * Records a rejected restake attempt to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param targetId - ID of the entity that failed restaking
 * @param targetKind - Kind of entity
 * @param reason - Why the restake was rejected
 * @param temporal - Current temporal metadata
 * @param config - Governance configuration
 */
export async function recordRestakeRejection(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  targetId: string,
  targetKind: 'semantic-node' | 'source-chunk' | 'cache-entry',
  reason: string,
  temporal: TemporalMetadata | undefined,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordRestakeEvents) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'restake-rejected',
    restakeCount: temporal?.restakeCount,
    decayProfile: temporal?.decayProfile,
    lambda: temporal?.lambda,
  };

  const governanceEvent = createCMHLGovernanceEvent(
    'restake-rejected',
    targetId,
    mapEntityKind(targetKind),
    metadata,
    `Restake rejected: ${reason}`,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

/**
 * Records a batch restake summary to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param result - The batch restake result
 * @param config - Governance configuration
 */
export async function recordBatchRestakeSummary(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  result: BatchRestakeResult,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordRestakeEvents) {
    return;
  }

  // Only record summary for significant batches
  if (result.stats.attempted < config.summaryThreshold) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'restake-executed',
    restakeCount: result.stats.succeeded,
    budgetRemaining: result.finalBudget.budgetLimit - result.finalBudget.usedCount,
  };

  const summary = `Batch restake completed: ${result.stats.succeeded}/${result.stats.attempted} succeeded, ${result.stats.failed} failed`;

  const governanceEvent = createCMHLGovernanceEvent(
    'restake-executed',
    'batch-summary',
    'retrieval-bundle',
    metadata,
    summary,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

/**
 * Records a decay threshold filtering event to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param filteredCount - Number of memories filtered
 * @param threshold - Decay threshold applied
 * @param totalCount - Total memories considered
 * @param config - Governance configuration
 */
export async function recordDecayFiltering(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  filteredCount: number,
  threshold: number,
  totalCount: number,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordDecayEvents || filteredCount === 0) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'decay-threshold-filtered',
    filteredCount,
    decayThreshold: threshold,
  };

  const percentage = Math.round((filteredCount / totalCount) * 100);
  const summary = `${filteredCount} memories filtered by decay threshold ${threshold} (${percentage}% of ${totalCount})`;

  const governanceEvent = createCMHLGovernanceEvent(
    'decay-threshold-filtered',
    'retrieval-filter',
    'retrieval-bundle',
    metadata,
    summary,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

/**
 * Records a temporal chain link creation to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param fromNodeId - Source node in chain
 * @param toNodeId - Target node (superseding)
 * @param chainDepth - Depth of the chain
 * @param config - Governance configuration
 */
export async function recordTemporalChainLink(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  fromNodeId: string,
  toNodeId: string,
  chainDepth: number,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordChainEvents) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'temporal-chain-linked',
    chainDepth,
  };

  const summary = `Temporal chain link created: ${fromNodeId} → ${toNodeId} (depth: ${chainDepth})`;

  const governanceEvent = createCMHLGovernanceEvent(
    'temporal-chain-linked',
    toNodeId,
    'semantic-node',
    metadata,
    summary,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

/**
 * Records a memory supersession event to the governance ledger.
 *
 * @param store - The learning store for persistence
 * @param supersededId - ID of the superseded memory
 * @param supersedingId - ID of the superseding memory
 * @param reason - Why the supersession occurred
 * @param config - Governance configuration
 */
export async function recordMemorySupersession(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  supersededId: string,
  supersedingId: string,
  reason: string,
  config: CMHLGovernanceConfig = DEFAULT_CMHL_GOVERNANCE_CONFIG,
): Promise<void> {
  if (!config.recordChainEvents) {
    return;
  }

  const metadata: CMHLGovernanceMetadata = {
    cmhlOperation: 'memory-superseded',
  };

  const summary = `Memory superseded: ${supersededId} → ${supersedingId} (${reason})`;

  const governanceEvent = createCMHLGovernanceEvent(
    'memory-superseded',
    supersededId,
    'semantic-node',
    metadata,
    summary,
    config,
  );

  await store.appendGovernanceEvent(governanceEvent);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps CMHL entity kinds to governance entity kinds.
 */
function mapEntityKind(
  kind: 'semantic-node' | 'source-chunk' | 'cache-entry',
): GovernanceEventRecord['entityKind'] {
  switch (kind) {
    case 'semantic-node':
      return 'semantic-node';
    case 'source-chunk':
      return 'chunk';
    case 'cache-entry':
      return 'cache-entry';
    default:
      return 'semantic-node';
  }
}

/**
 * Calculates effective t0 from temporal metadata.
 */
function effectiveT0FromTemporal(temporal: TemporalMetadata): number {
  if (!temporal.restakeCount || temporal.restakeCount === 0) {
    return temporal.t0;
  }

  // Simplified effective t0 calculation
  const baseWeight = temporal.w0 * Math.pow(0.5, temporal.restakeCount);
  let weightedSum = temporal.t0 * baseWeight;
  let totalWeight = baseWeight;

  for (let i = 0; i < temporal.restakeCount; i++) {
    const restakeWeight = temporal.w0 * Math.pow(0.5, i + 1);
    const restakeTime = temporal.t0 + (i + 1) * (Date.now() - temporal.t0) / (temporal.restakeCount + 1);
    weightedSum += restakeTime * restakeWeight;
    totalWeight += restakeWeight;
  }

  return Math.round(weightedSum / totalWeight);
}

/**
 * Calculates freshness boost percentage from restaking.
 */
function calculateFreshnessBoost(
  previous: TemporalMetadata,
  current: TemporalMetadata,
  now: number,
): number {
  const elapsedPrevious = (now - previous.t0) / 1000;
  const weightPrevious = previous.w0 * Math.exp(-previous.lambda * elapsedPrevious);

  const elapsedCurrent = (now - current.t0) / 1000;
  const weightCurrent = current.w0 * Math.exp(-current.lambda * elapsedCurrent);

  if (weightPrevious === 0) {
    return 100;
  }

  return Math.round(((weightCurrent - weightPrevious) / weightPrevious) * 100);
}

// ============================================================================
// CMHL Governance Hook Factory
// ============================================================================

/**
 * Creates a set of CMHL governance hooks bound to a LearningStore.
 */
export function createCMHLGovernanceHooks(
  store: Pick<GraphStore, 'appendGovernanceEvent'>,
  config: Partial<CMHLGovernanceConfig> = {},
): CMHLGovernanceHooks {
  const fullConfig = { ...DEFAULT_CMHL_GOVERNANCE_CONFIG, ...config };

  return {
    recordRestakeEvent: (event, budget) => recordRestakeEvent(store, event, budget, fullConfig),
    recordRestakeRejection: (targetId, targetKind, reason, temporal) =>
      recordRestakeRejection(store, targetId, targetKind, reason, temporal, fullConfig),
    recordBatchRestakeSummary: (result) => recordBatchRestakeSummary(store, result, fullConfig),
    recordDecayFiltering: (filteredCount, threshold, totalCount) =>
      recordDecayFiltering(store, filteredCount, threshold, totalCount, fullConfig),
    recordTemporalChainLink: (fromNodeId, toNodeId, chainDepth) =>
      recordTemporalChainLink(store, fromNodeId, toNodeId, chainDepth, fullConfig),
    recordMemorySupersession: (supersededId, supersedingId, reason) =>
      recordMemorySupersession(store, supersededId, supersedingId, reason, fullConfig),
  };
}

/**
 * Interface for CMHL governance hook operations.
 */
export interface CMHLGovernanceHooks {
  /** Record a successful restake event */
  recordRestakeEvent(event: RestakeEvent, budget: RestakeBudgetState): Promise<void>;

  /** Record a rejected restake attempt */
  recordRestakeRejection(
    targetId: string,
    targetKind: 'semantic-node' | 'source-chunk' | 'cache-entry',
    reason: string,
    temporal: TemporalMetadata | undefined,
  ): Promise<void>;

  /** Record a batch restake summary */
  recordBatchRestakeSummary(result: BatchRestakeResult): Promise<void>;

  /** Record decay threshold filtering */
  recordDecayFiltering(filteredCount: number, threshold: number, totalCount: number): Promise<void>;

  /** Record temporal chain link creation */
  recordTemporalChainLink(fromNodeId: string, toNodeId: string, chainDepth: number): Promise<void>;

  /** Record memory supersession */
  recordMemorySupersession(supersededId: string, supersedingId: string, reason: string): Promise<void>;
}
