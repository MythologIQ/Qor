/**
 * CMHL Restaking Mechanism (Continual Memory Half-Life Neuroplasticity)
 *
 * Implements memory restaking - the ability to refresh decaying memories
 * by creating a new temporal anchor (t0) while preserving provenance.
 * This provides controlled neuroplasticity without infinite refresh loops.
 *
 * @module kernel/memory/restaking
 * @see task_cmhl_restaking in phases.json
 */

import type {
  TemporalMetadata,
  SemanticNodeRecord,
  SourceChunkRecord,
  CacheEntryRecord,
  DecayProfile,
  GovernanceMetadata,
  GovernanceEventRecord,
} from './types';
import { DEFAULT_DECAY_LAMBDA } from './rank';

// ============================================================================
// Restake Configuration
// ============================================================================

/** Maximum number of restakes allowed per memory (prevents infinite refresh) */
export const MAX_RESTAKE_COUNT = 3;

/** Minimum time between restakes (prevents spam) - 1 hour in ms */
export const MIN_RESTAKE_INTERVAL_MS = 60 * 60 * 1000;

/** Budget of restakes per governance window (per project/agent) */
export const RESTAKE_BUDGET_PER_WINDOW = 100;

/** Governance window duration for restake budgets - 24 hours in ms */
export const RESTAKE_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Restake Event Types
// ============================================================================

/** Valid reasons for restaking a memory */
export type RestakeReason =
  | 'user_relevance_boost'
  | 'retrieval_frequency'
  | 'cross_reference_strength'
  | 'task_reactivation'
  | 'decision_dependency'
  | 'contradiction_resolution'
  | 'knowledge_reconciliation'
  | 'governance_promotion';

/** Context of who/what initiated the restake */
export interface RestakeInitiatorContext {
  agentId?: string;
  projectId?: string;
  sessionId?: string;
  userTriggered?: boolean;
}

/**
 * RestakeEvent is now an alias for GovernanceEventRecord with eventType 'memory-restaked'.
 * @deprecated Use GovernanceEventRecord directly with eventType 'memory-restaked'
 */
export type RestakeEvent = GovernanceEventRecord;

/** Maps internal entity kinds to GovernanceEventRecord entityKind */
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

/** Creates a GovernanceEventRecord for a memory restake event */
function createRestakeGovernanceEvent(
  params: {
    eventId: string;
    targetUorId: string;
    targetEntityKind: 'semantic-node' | 'source-chunk' | 'cache-entry';
    restakedAt: number;
    reason: RestakeReason;
    governanceApproval: {
      required: boolean;
      granted: boolean;
      approverContext?: string;
    };
    previousTemporal: TemporalMetadata;
    newTemporal: TemporalMetadata;
    initiatorContext: RestakeInitiatorContext;
    policyVersion?: string;
  },
): GovernanceEventRecord {
  return {
    id: params.eventId,
    eventType: 'memory-restaked',
    entityKind: mapEntityKind(params.targetEntityKind),
    entityId: params.targetUorId,
    policyVersion: params.policyVersion ?? 'v1',
    createdAt: params.restakedAt,
    summary: `Memory restaked: ${params.reason}`,
    metadata: {
      reason: params.reason,
      governanceRequired: params.governanceApproval.required,
      governanceGranted: params.governanceApproval.granted,
      approverContext: params.governanceApproval.approverContext,
      previousT0: params.previousTemporal.t0,
      previousW0: params.previousTemporal.w0,
      previousLambda: params.previousTemporal.lambda,
      previousDecayProfile: params.previousTemporal.decayProfile,
      previousRestakeCount: params.previousTemporal.restakeCount ?? 0,
      newT0: params.newTemporal.t0,
      newRestakeCount: params.newTemporal.restakeCount ?? 0,
      agentId: params.initiatorContext.agentId,
      projectId: params.initiatorContext.projectId,
      sessionId: params.initiatorContext.sessionId,
      userTriggered: params.initiatorContext.userTriggered,
    },
  };
}

// ============================================================================
// Restake Budget Tracking
// ============================================================================

/**
 * Budget state for restaking operations within a governance window.
 * Tracks usage to prevent infinite refresh loops.
 */
export interface RestakeBudgetState {
  /** Window start timestamp */
  windowStart: number;

  /** Number of restakes used in current window */
  usedCount: number;

  /** Maximum allowed in this window */
  budgetLimit: number;

  /** Restake events in current window */
  events: RestakeEvent[];
}

/**
 * Initialize a new restake budget window.
 */
export function createRestakeBudget(now?: number): RestakeBudgetState {
  return {
    windowStart: now ?? Date.now(),
    usedCount: 0,
    budgetLimit: RESTAKE_BUDGET_PER_WINDOW,
    events: [],
  };
}

/**
 * Check if a restake is allowed within the current budget.
 * Returns false if budget exhausted or window expired.
 */
export function isRestakeAllowed(
  budget: RestakeBudgetState,
  now?: number,
): { allowed: boolean; reason?: string } {
  const currentTime = now ?? Date.now();

  // Check if window has expired
  const windowAge = currentTime - budget.windowStart;
  if (windowAge > RESTAKE_BUDGET_WINDOW_MS) {
    // Window expired - would need new budget, but for this check we'll allow
    // (the caller should refresh the budget)
    return { allowed: true };
  }

  // Check if budget exhausted
  if (budget.usedCount >= budget.budgetLimit) {
    return {
      allowed: false,
      reason: `Restake budget exhausted (${budget.usedCount}/${budget.budgetLimit}) in current window`,
    };
  }

  return { allowed: true };
}

/**
 * Consume one restake from the budget and record the event.
 */
export function consumeRestakeBudget(
  budget: RestakeBudgetState,
  event: RestakeEvent,
): RestakeBudgetState {
  return {
    ...budget,
    usedCount: budget.usedCount + 1,
    events: [...budget.events, event],
  };
}

// ============================================================================
// effectiveT0 Computation
// ============================================================================

/**
 * Compute the effective t0 (temporal anchor) for a memory considering restakes.
 *
 * The effective t0 is a weighted blend between original creation and restakes,
 * providing a "half-life extension" effect while preventing infinite freshness.
 *
 * Formula:
 *   effectiveT0 = (t0_original * w0 * 0.5^(restakeCount)) + Σ(restake_ti * wi)
 *
 * Where:
 *   - Each restake contributes less weight (exponential decay of influence)
 *   - Maximum restakes (MAX_RESTAKE_COUNT) caps the benefit
 *
 * @param temporal - Current temporal metadata
 * @param restakeHistory - Prior restake events (if available)
 * @returns Effective timestamp for decay computation
 */
export function effectiveT0(
  temporal: TemporalMetadata,
  restakeHistory?: Array<{ restakedAt: number; weight: number }>,
): number {
  // No restakes = use original t0
  if (!temporal.restakeCount || temporal.restakeCount === 0) {
    return temporal.t0;
  }

  // Base weight diminishes with each restake (but never fully)
  const baseWeight = temporal.w0 * Math.pow(0.5, temporal.restakeCount);

  // Calculate weighted sum
  let weightedSum = temporal.t0 * baseWeight;
  let totalWeight = baseWeight;

  // Add contribution from each restake (if history available)
  if (restakeHistory && restakeHistory.length > 0) {
    for (const restake of restakeHistory) {
      weightedSum += restake.restakedAt * restake.weight;
      totalWeight += restake.weight;
    }
  } else {
    // Without history, approximate with current t0 and restake count
    // Each restake contributes progressively less to the effective t0
    for (let i = 0; i < temporal.restakeCount; i++) {
      const restakeWeight = temporal.w0 * Math.pow(0.5, i + 1);
      // Approximate restake time as spread between original and now
      // This is a conservative estimate (restakes happened throughout lifetime)
      const restakeTime = temporal.t0 + (i + 1) * (Date.now() - temporal.t0) / (temporal.restakeCount + 1);
      weightedSum += restakeTime * restakeWeight;
      totalWeight += restakeWeight;
    }
  }

  return Math.round(weightedSum / totalWeight);
}

/**
 * Compute the effective decay weight considering restakes.
 * This extends the "freshness" of a memory while maintaining decay dynamics.
 *
 * @param temporal - Current temporal metadata
 * @param now - Current timestamp
 * @param restakeHistory - Optional restake history for precise calculation
 * @returns Effective decay weight (0-1)
 */
export function effectiveDecayWeight(
  temporal: TemporalMetadata | undefined,
  now: number,
  restakeHistory?: Array<{ restakedAt: number; weight: number }>,
): number {
  if (!temporal || temporal.lambda === 0) {
    return 1.0;
  }

  // Use effective t0 for decay calculation
  const effective = effectiveT0(temporal, restakeHistory);
  const elapsedMs = now - effective;

  if (elapsedMs <= 0) {
    return temporal.w0;
  }

  const elapsedSeconds = elapsedMs / 1000;
  const weight = temporal.w0 * Math.exp(-temporal.lambda * elapsedSeconds);

  return Math.max(0, Math.min(1.0, weight));
}

// ============================================================================
// Restake Validation
// ============================================================================

/**
 * Validation result for a proposed restake operation.
 */
export interface RestakeValidation {
  /** Whether restaking is allowed */
  valid: boolean;

  /** Human-readable reason if invalid */
  reason?: string;

  /** Recommended action if invalid */
  recommendation?: 'proceed' | 'deny' | 'upgrade_profile' | 'await_governance';

  /** Estimated effect of restaking */
  projectedImpact: {
    /** New effective t0 if restaked */
    newEffectiveT0: number;

    /** New restake count */
    newRestakeCount: number;

    /** Freshness boost percentage (0-100) */
    freshnessBoostPercent: number;
  };
}

/**
 * Validate whether a memory can be restaked.
 *
 * @param temporal - Current temporal metadata
 * @param budget - Current restake budget
 * @param now - Optional timestamp for deterministic testing
 * @returns Validation result with projected impact
 */
export function validateRestake(
  temporal: TemporalMetadata | undefined,
  budget: RestakeBudgetState,
  now?: number,
): RestakeValidation {
  const currentTime = now ?? Date.now();

  // Check if memory exists
  if (!temporal) {
    return {
      valid: false,
      reason: 'Cannot restake: memory has no temporal metadata',
      recommendation: 'deny',
      projectedImpact: { newEffectiveT0: currentTime, newRestakeCount: 0, freshnessBoostPercent: 0 },
    };
  }

  // Check permanent memories (cannot be restaked - they're already eternal)
  if (temporal.decayProfile === 'permanent' || temporal.lambda === 0) {
    return {
      valid: false,
      reason: 'Cannot restake: permanent memories do not decay',
      recommendation: 'deny',
      projectedImpact: { newEffectiveT0: temporal.t0, newRestakeCount: temporal.restakeCount, freshnessBoostPercent: 0 },
    };
  }

  // Check restake count limit
  if (temporal.restakeCount >= MAX_RESTAKE_COUNT) {
    return {
      valid: false,
      reason: `Cannot restake: maximum restake count (${MAX_RESTAKE_COUNT}) reached`,
      recommendation: 'upgrade_profile',
      projectedImpact: { newEffectiveT0: temporal.t0, newRestakeCount: temporal.restakeCount, freshnessBoostPercent: 0 },
    };
  }

  // Check minimum interval since last restake
  const timeSinceLastRestake = currentTime - temporal.t0;
  if (timeSinceLastRestake < MIN_RESTAKE_INTERVAL_MS) {
    return {
      valid: false,
      reason: `Cannot restake: minimum interval (${MIN_RESTAKE_INTERVAL_MS}ms) not elapsed`,
      recommendation: 'deny',
      projectedImpact: { newEffectiveT0: temporal.t0, newRestakeCount: temporal.restakeCount, freshnessBoostPercent: 0 },
    };
  }

  // Check budget
  const budgetCheck = isRestakeAllowed(budget, currentTime);
  if (!budgetCheck.allowed) {
    return {
      valid: false,
      reason: budgetCheck.reason,
      recommendation: 'await_governance',
      projectedImpact: { newEffectiveT0: temporal.t0, newRestakeCount: temporal.restakeCount, freshnessBoostPercent: 0 },
    };
  }

  // Calculate projected impact
  const newRestakeCount = temporal.restakeCount + 1;
  const newTemporal: TemporalMetadata = {
    ...temporal,
    t0: currentTime,
    restakeCount: newRestakeCount,
  };
  const newEffectiveT0 = effectiveT0(newTemporal);

  // Calculate freshness boost
  const oldWeight = effectiveDecayWeight(temporal, currentTime);
  const newWeight = effectiveDecayWeight(newTemporal, currentTime);
  const freshnessBoostPercent = Math.round((newWeight - oldWeight) / oldWeight * 100);

  return {
    valid: true,
    recommendation: 'proceed',
    projectedImpact: {
      newEffectiveT0,
      newRestakeCount,
      freshnessBoostPercent: Math.max(0, freshnessBoostPercent),
    },
  };
}

// ============================================================================
// Restake Execution
// ============================================================================

/**
 * Execute a restake operation on temporal metadata.
 *
 * @param temporal - Current temporal metadata
 * @param reason - Why this restake is occurring
 * @param budget - Current budget state
 * @param initiator - Who/what initiated the restake
 * @param now - Optional timestamp for deterministic testing
 * @returns Restake result with event and updated metadata
 */
export function executeRestake(
  temporal: TemporalMetadata,
  reason: RestakeReason,
  budget: RestakeBudgetState,
  initiator: RestakeInitiatorContext,
  now?: number,
): {
  success: boolean;
  event?: GovernanceEventRecord;
  newTemporal: TemporalMetadata;
  newBudget: RestakeBudgetState;
  error?: string;
} {
  const currentTime = now ?? Date.now();

  // Validate
  const validation = validateRestake(temporal, budget, currentTime);
  if (!validation.valid) {
    return {
      success: false,
      newTemporal: temporal,
      newBudget: budget,
      error: validation.reason,
    };
  }

  // Create new temporal metadata
  const newTemporal: TemporalMetadata = {
    ...temporal,
    t0: currentTime,
    restakeCount: temporal.restakeCount + 1,
    lastAccessedAt: currentTime,
  };

  // Create restake governance event
  const event = createRestakeGovernanceEvent({
    eventId: `restake_${currentTime}_${temporal.restakeCount + 1}`,
    targetUorId: '', // Caller must fill in based on entity
    targetEntityKind: 'semantic-node', // Caller must adjust
    restakedAt: currentTime,
    reason,
    governanceApproval: {
      required: temporal.restakeCount >= 2,
      granted: temporal.restakeCount < 2,
    },
    previousTemporal: temporal,
    newTemporal,
    initiatorContext: initiator,
  });

  // Update budget
  const newBudget = consumeRestakeBudget(budget, event);

  return {
    success: true,
    event,
    newTemporal,
    newBudget,
  };
}

// ============================================================================
// Entity-Specific Restaking
// ============================================================================

/**
 * Restake a semantic node.
 */
export function restakeSemanticNode(
  node: SemanticNodeRecord,
  reason: RestakeReason,
  budget: RestakeBudgetState,
  initiator: RestakeInitiatorContext,
  now?: number,
): {
  success: boolean;
  event?: GovernanceEventRecord;
  newNode: SemanticNodeRecord;
  newBudget: RestakeBudgetState;
  error?: string;
} {
  if (!node.temporal) {
    return {
      success: false,
      newNode: node,
      newBudget: budget,
      error: 'Node has no temporal metadata',
    };
  }

  const result = executeRestake(node.temporal, reason, budget, initiator, now);

  if (!result.success) {
    return {
      success: false,
      newNode: node,
      newBudget: budget,
      error: result.error,
    };
  }

  // Update event with node-specific info
  const event: GovernanceEventRecord = {
    ...result.event!,
    entityId: node.id,
    entityKind: 'semantic-node',
  };

  return {
    success: true,
    event,
    newNode: {
      ...node,
      temporal: result.newTemporal,
    },
    newBudget: result.newBudget,
  };
}

/**
 * Restake a source chunk.
 */
export function restakeSourceChunk(
  chunk: SourceChunkRecord,
  reason: RestakeReason,
  budget: RestakeBudgetState,
  initiator: RestakeInitiatorContext,
  now?: number,
): {
  success: boolean;
  event?: GovernanceEventRecord;
  newChunk: SourceChunkRecord;
  newBudget: RestakeBudgetState;
  error?: string;
} {
  if (!chunk.temporal) {
    return {
      success: false,
      newChunk: chunk,
      newBudget: budget,
      error: 'Chunk has no temporal metadata',
    };
  }

  const result = executeRestake(chunk.temporal, reason, budget, initiator, now);

  if (!result.success) {
    return {
      success: false,
      newChunk: chunk,
      newBudget: budget,
      error: result.error,
    };
  }

  const event: GovernanceEventRecord = {
    ...result.event!,
    entityId: chunk.id,
    entityKind: 'chunk',
  };

  return {
    success: true,
    event,
    newChunk: {
      ...chunk,
      temporal: result.newTemporal,
    },
    newBudget: result.newBudget,
  };
}

/**
 * Restake a cache entry.
 */
export function restakeCacheEntry(
  entry: CacheEntryRecord,
  reason: RestakeReason,
  budget: RestakeBudgetState,
  initiator: RestakeInitiatorContext,
  now?: number,
): {
  success: boolean;
  event?: GovernanceEventRecord;
  newEntry: CacheEntryRecord;
  newBudget: RestakeBudgetState;
  error?: string;
} {
  if (!entry.temporal) {
    return {
      success: false,
      newEntry: entry,
      newBudget: budget,
      error: 'Cache entry has no temporal metadata',
    };
  }

  const result = executeRestake(entry.temporal, reason, budget, initiator, now);

  if (!result.success) {
    return {
      success: false,
      newEntry: entry,
      newBudget: budget,
      error: result.error,
    };
  }

  const event: GovernanceEventRecord = {
    ...result.event!,
    entityId: entry.id,
    entityKind: 'cache-entry',
  };

  return {
    success: true,
    event,
    newEntry: {
      ...entry,
      temporal: result.newTemporal,
      refreshedAt: result.newTemporal.t0,
    },
    newBudget: result.newBudget,
  };
}

// ============================================================================
// Batch Restaking
// ============================================================================

/**
 * Result of a batch restake operation.
 */
export interface BatchRestakeResult {
  /** Successfully restaked entities */
  succeeded: RestakeEvent[];

  /** Failed restake attempts */
  failed: Array<{ entityId: string; reason: string }>;

  /** Updated budget after all operations */
  finalBudget: RestakeBudgetState;

  /** Summary statistics */
  stats: {
    attempted: number;
    succeeded: number;
    failed: number;
    budgetConsumed: number;
  };
}

/**
 * Execute batch restaking on multiple entities.
 * Stops if budget exhausted.
 *
 * @param entities - Array of entities with temporal metadata
 * @param reason - Restake reason
 * @param budget - Starting budget
 * @param initiator - Who/what initiated
 * @param now - Optional timestamp
 * @returns Batch results
 */
export function batchRestake<T extends { id: string; temporal?: TemporalMetadata }>(
  entities: T[],
  reason: RestakeReason,
  budget: RestakeBudgetState,
  initiator: RestakeInitiatorContext,
  now?: number,
): BatchRestakeResult {
  const succeeded: GovernanceEventRecord[] = [];
  const failed: Array<{ entityId: string; reason: string }> = [];
  let currentBudget = budget;
  let budgetConsumed = 0;

  for (const entity of entities) {
    // Check budget before attempting
    const budgetCheck = isRestakeAllowed(currentBudget, now);
    if (!budgetCheck.allowed) {
      failed.push({ entityId: entity.id, reason: budgetCheck.reason! });
      continue;
    }

    // Skip entities without temporal metadata
    if (!entity.temporal) {
      failed.push({ entityId: entity.id, reason: 'No temporal metadata' });
      continue;
    }

    // Execute restake
    const result = executeRestake(entity.temporal, reason, currentBudget, initiator, now);

    if (result.success && result.event) {
      succeeded.push({
        ...result.event,
        entityId: entity.id,
      });
      currentBudget = result.newBudget;
      budgetConsumed++;
    } else {
      failed.push({ entityId: entity.id, reason: result.error || 'Unknown error' });
    }
  }

  return {
    succeeded,
    failed,
    finalBudget: currentBudget,
    stats: {
      attempted: entities.length,
      succeeded: succeeded.length,
      failed: failed.length,
      budgetConsumed,
    },
  };
}
