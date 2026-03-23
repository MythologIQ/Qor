/**
 * Governance Decision Engine
 *
 * Central decision-making service that evaluates content admission and action execution
 * requests against unified policies, tracks decision history, and provides audit trails.
 *
 * This engine bridges the quarantine pipeline (content governance) and execute-pilot
 * (action governance) under a single decision framework.
 *
 * @module governance-decision-engine
 */

import type {
  ContentAdmissionRequest,
  ActionExecutionRequest,
  GovernanceDecision,
  GovernanceVerdict,
  UnifiedPolicy,
  VerificationStep,
} from './unified-policy.js';
import {
  evaluateContentAdmission,
  evaluateActionExecution,
  DEFAULT_UNIFIED_POLICY,
  getPolicyByName,
} from './unified-policy.js';

// ============================================================================
// Decision Record Types
// ============================================================================

/**
 * Types of governance decisions tracked by the engine.
 */
export type DecisionType = 'content_admission' | 'action_execution' | 'policy_override';

/**
 * Decision context provides additional metadata for audit trails.
 */
export interface DecisionContext {
  /** Project identifier */
  projectId?: string;

  /** Phase identifier if applicable */
  phaseId?: string;

  /** Task identifier if applicable */
  taskId?: string;

  /** Session or run identifier */
  sessionId?: string;

  /** Actor making the request (system, user, agent) */
  actor: string;

  /** Reason for the decision request */
  reason: string;

  /** Additional arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A recorded governance decision with full provenance.
 */
export interface DecisionRecord {
  /** Unique decision identifier */
  id: string;

  /** Type of decision */
  type: DecisionType;

  /** The governance decision outcome */
  decision: GovernanceDecision;

  /** Decision context */
  context: DecisionContext;

  /** Request that led to this decision */
  request: ContentAdmissionRequest | ActionExecutionRequest | PolicyOverrideRequest;

  /** Policy used for the decision */
  policyName: string;

  /** Timestamp when decision was created */
  createdAt: string;

  /** Timestamp when decision was last accessed */
  accessedAt?: string;

  /** Whether this decision was appealed or overridden */
  overridden?: boolean;

  /** ID of decision that overrode this one */
  overriddenBy?: string;

  /** Notes about the decision */
  notes?: string;
}

/**
 * Request to override an existing decision.
 */
export interface PolicyOverrideRequest {
  /** Original decision ID to override */
  originalDecisionId: string;

  /** New verdict to apply */
  newVerdict: GovernanceVerdict;

  /** Reason for override */
  overrideReason: string;

  /** Actor performing override */
  overrideActor: string;
}

/**
 * Query filter for searching decision records.
 */
export interface DecisionQuery {
  /** Filter by decision type */
  type?: DecisionType;

  /** Filter by verdict */
  verdict?: GovernanceVerdict;

  /** Filter by project */
  projectId?: string;

  /** Filter by actor */
  actor?: string;

  /** Filter by policy name */
  policyName?: string;

  /** Start date (ISO string) */
  fromDate?: string;

  /** End date (ISO string) */
  toDate?: string;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Statistics about governance decisions.
 */
export interface DecisionStats {
  /** Total decisions recorded */
  totalDecisions: number;

  /** Decisions by verdict */
  byVerdict: Record<GovernanceVerdict, number>;

  /** Decisions by type */
  byType: Record<DecisionType, number>;

  /** Decisions by policy */
  byPolicy: Record<string, number>;

  /** Average confidence across all decisions */
  averageConfidence: number;

  /** Decisions in last 24 hours */
  last24Hours: number;

  /** Overridden decisions count */
  overriddenCount: number;
}

// ============================================================================
// Governance Decision Engine
// ============================================================================

/**
 * Central governance decision engine that evaluates requests against policies
 * and maintains an audit trail of all decisions.
 */
export class GovernanceDecisionEngine {
  private decisions: Map<string, DecisionRecord> = new Map();
  private currentPolicy: UnifiedPolicy;
  private maxHistorySize: number;

  /**
   * Create a new governance decision engine.
   *
   * @param policy - Initial policy to use (defaults to production)
   * @param maxHistorySize - Maximum number of decisions to retain (default: 10000)
   */
  constructor(policy: UnifiedPolicy = DEFAULT_UNIFIED_POLICY, maxHistorySize = 10000) {
    this.currentPolicy = policy;
    this.maxHistorySize = maxHistorySize;
  }

  // --------------------------------------------------------------------------
  // Policy Management
  // --------------------------------------------------------------------------

  /**
   * Get the currently active policy.
   */
  getPolicy(): UnifiedPolicy {
    return { ...this.currentPolicy };
  }

  /**
   * Set a new active policy.
   *
   * @param policy - Policy to activate
   */
  setPolicy(policy: UnifiedPolicy): void {
    this.currentPolicy = policy;
  }

  /**
   * Switch to a named policy.
   *
   * @param policyName - Name of policy to activate
   * @returns true if policy was found and activated
   */
  switchPolicy(policyName: string): boolean {
    const policy = getPolicyByName(policyName);
    if (policy) {
      this.currentPolicy = policy;
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Content Admission Decisions
  // --------------------------------------------------------------------------

  /**
   * Evaluate content admission request and record the decision.
   *
   * @param request - Content admission request
   * @param context - Decision context
   * @returns Recorded decision with ID
   */
  decideContentAdmission(
    request: ContentAdmissionRequest,
    context: DecisionContext,
  ): DecisionRecord {
    const decision = evaluateContentAdmission(request, this.currentPolicy);
    return this.recordDecision('content_admission', decision, context, request);
  }

  /**
   * Batch evaluate multiple content admission requests.
   *
   * @param requests - Array of requests with their contexts
   * @returns Array of recorded decisions
   */
  decideContentAdmissionBatch(
    requests: Array<{ request: ContentAdmissionRequest; context: DecisionContext }>,
  ): DecisionRecord[] {
    return requests.map(({ request, context }) =>
      this.decideContentAdmission(request, context),
    );
  }

  // --------------------------------------------------------------------------
  // Action Execution Decisions
  // --------------------------------------------------------------------------

  /**
   * Evaluate action execution request and record the decision.
   *
   * @param request - Action execution request
   * @param context - Decision context
   * @returns Recorded decision with ID
   */
  decideActionExecution(
    request: ActionExecutionRequest,
    context: DecisionContext,
  ): DecisionRecord {
    const decision = evaluateActionExecution(request, this.currentPolicy);
    return this.recordDecision('action_execution', decision, context, request);
  }

  /**
   * Batch evaluate multiple action execution requests.
   *
   * @param requests - Array of requests with their contexts
   * @returns Array of recorded decisions
   */
  decideActionExecutionBatch(
    requests: Array<{ request: ActionExecutionRequest; context: DecisionContext }>,
  ): DecisionRecord[] {
    return requests.map(({ request, context }) =>
      this.decideActionExecution(request, context),
    );
  }

  /**
   * Check if an action would be approved without recording a decision.
   * Useful for preflight checks.
   *
   * @param request - Action execution request
   * @returns Decision without recording
   */
  previewActionDecision(request: ActionExecutionRequest): GovernanceDecision {
    return evaluateActionExecution(request, this.currentPolicy);
  }

  // --------------------------------------------------------------------------
  // Decision Overrides
  // --------------------------------------------------------------------------

  /**
   * Override an existing decision with a new verdict.
   *
   * @param overrideRequest - Override request
   * @param context - Decision context for the override
   * @returns New decision record for the override, or null if original not found
   */
  overrideDecision(
    overrideRequest: PolicyOverrideRequest,
    context: DecisionContext,
  ): DecisionRecord | null {
    const original = this.decisions.get(overrideRequest.originalDecisionId);
    if (!original) return null;

    // Mark original as overridden
    original.overridden = true;
    original.overriddenBy = this.generateDecisionId();

    // Create new decision
    const newDecision: GovernanceDecision = {
      verdict: overrideRequest.newVerdict,
      confidence: 1.0, // Overrides are definitive
      reasoning: `Override by ${overrideRequest.overrideActor}: ${overrideRequest.overrideReason}. Original: ${original.decision.reasoning}`,
      policyVersion: original.decision.policyVersion,
      policyName: `${original.decision.policyName} (OVERRIDDEN)`,
      checkedVerifications: original.decision.checkedVerifications,
      decidedAt: new Date().toISOString(),
    };

    const record = this.recordDecision(
      'policy_override',
      newDecision,
      context,
      overrideRequest,
    );

    // Link the override
    original.overriddenBy = record.id;

    return record;
  }

  // --------------------------------------------------------------------------
  // Decision Queries
  // --------------------------------------------------------------------------

  /**
   * Get a decision by ID.
   *
   * @param id - Decision ID
   * @returns Decision record or null if not found
   */
  getDecision(id: string): DecisionRecord | null {
    const decision = this.decisions.get(id);
    if (decision) {
      decision.accessedAt = new Date().toISOString();
    }
    return decision || null;
  }

  /**
   * Query decisions with filters.
   *
   * @param query - Query filters
   * @returns Matching decision records
   */
  queryDecisions(query: DecisionQuery = {}): DecisionRecord[] {
    let results = Array.from(this.decisions.values());

    // Apply filters
    if (query.type) {
      results = results.filter((d) => d.type === query.type);
    }
    if (query.verdict) {
      results = results.filter((d) => d.decision.verdict === query.verdict);
    }
    if (query.projectId) {
      results = results.filter((d) => d.context.projectId === query.projectId);
    }
    if (query.actor) {
      results = results.filter((d) => d.context.actor === query.actor);
    }
    if (query.policyName) {
      results = results.filter((d) => d.policyName === query.policyName);
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate).getTime();
      results = results.filter((d) => new Date(d.createdAt).getTime() >= from);
    }
    if (query.toDate) {
      const to = new Date(query.toDate).getTime();
      results = results.filter((d) => new Date(d.createdAt).getTime() <= to);
    }

    // Sort by creation time descending
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || results.length;
    results = results.slice(offset, offset + limit);

    // Update accessed timestamps
    for (const decision of results) {
      decision.accessedAt = new Date().toISOString();
    }

    return results;
  }

  /**
   * Get decision statistics.
   */
  getStats(): DecisionStats {
    const decisions = Array.from(this.decisions.values());
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const byVerdict: Record<GovernanceVerdict, number> = { approve: 0, quarantine: 0, reject: 0 };
    const byType: Record<DecisionType, number> = { content_admission: 0, action_execution: 0, policy_override: 0 };
    const byPolicy: Record<string, number> = {};

    let totalConfidence = 0;
    let overriddenCount = 0;
    let last24Hours = 0;

    for (const d of decisions) {
      byVerdict[d.decision.verdict]++;
      byType[d.type]++;
      byPolicy[d.policyName] = (byPolicy[d.policyName] || 0) + 1;
      totalConfidence += d.decision.confidence;
      if (d.overridden) overriddenCount++;
      if (new Date(d.createdAt).getTime() >= oneDayAgo) last24Hours++;
    }

    return {
      totalDecisions: decisions.length,
      byVerdict,
      byType,
      byPolicy,
      averageConfidence: decisions.length > 0 ? totalConfidence / decisions.length : 0,
      last24Hours,
      overriddenCount,
    };
  }

  /**
   * Get decisions for a specific project.
   *
   * @param projectId - Project identifier
   * @param limit - Maximum results
   */
  getProjectDecisions(projectId: string, limit = 100): DecisionRecord[] {
    return this.queryDecisions({ projectId, limit });
  }

  /**
   * Get recent decisions.
   *
   * @param limit - Maximum results
   */
  getRecentDecisions(limit = 50): DecisionRecord[] {
    return this.queryDecisions({ limit });
  }

  /**
   * Get decisions requiring review (quarantined or rejected).
   *
   * @param limit - Maximum results
   */
  getDecisionsRequiringReview(limit = 100): DecisionRecord[] {
    return this.queryDecisions({ limit }).filter(
      (d) => d.decision.verdict === 'quarantine' || d.decision.verdict === 'reject',
    );
  }

  // --------------------------------------------------------------------------
  // Decision Export
  // --------------------------------------------------------------------------

  /**
   * Export decisions to JSONL format.
   *
   * @param query - Optional query to filter exported decisions
   * @returns JSONL string
   */
  exportToJSONL(query?: DecisionQuery): string {
    const decisions = query ? this.queryDecisions(query) : Array.from(this.decisions.values());
    return decisions.map((d) => JSON.stringify(d)).join('\n');
  }

  /**
   * Serialize all engine state for persistence.
   */
  serialize(): {
    decisions: DecisionRecord[];
    currentPolicyName: string;
    maxHistorySize: number;
  } {
    return {
      decisions: Array.from(this.decisions.values()),
      currentPolicyName: this.currentPolicy.name,
      maxHistorySize: this.maxHistorySize,
    };
  }

  /**
   * Load engine state from serialized data.
   *
   * @param data - Serialized state
   * @returns Loaded engine
   */
  static load(data: {
    decisions: DecisionRecord[];
    currentPolicyName: string;
    maxHistorySize: number;
  }): GovernanceDecisionEngine {
    const policy = getPolicyByName(data.currentPolicyName) || DEFAULT_UNIFIED_POLICY;
    const engine = new GovernanceDecisionEngine(policy, data.maxHistorySize);

    for (const decision of data.decisions) {
      engine.decisions.set(decision.id, decision);
    }

    return engine;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private generateDecisionId(): string {
    return `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private recordDecision(
    type: DecisionType,
    decision: GovernanceDecision,
    context: DecisionContext,
    request: ContentAdmissionRequest | ActionExecutionRequest | PolicyOverrideRequest,
  ): DecisionRecord {
    // Enforce history size limit
    if (this.decisions.size >= this.maxHistorySize) {
      this.pruneOldestDecisions();
    }

    const record: DecisionRecord = {
      id: this.generateDecisionId(),
      type,
      decision,
      context,
      request,
      policyName: this.currentPolicy.name,
      createdAt: new Date().toISOString(),
    };

    this.decisions.set(record.id, record);
    return record;
  }

  private pruneOldestDecisions(): void {
    const sorted = Array.from(this.decisions.entries()).sort(
      (a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime(),
    );

    const toRemove = Math.ceil(this.maxHistorySize * 0.1); // Remove 10%
    for (let i = 0; i < toRemove; i++) {
      this.decisions.delete(sorted[i][0]);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalEngine: GovernanceDecisionEngine | null = null;

/**
 * Get the global governance decision engine instance.
 */
export function getGovernanceDecisionEngine(): GovernanceDecisionEngine {
  if (!globalEngine) {
    globalEngine = new GovernanceDecisionEngine();
  }
  return globalEngine;
}

/**
 * Set the global governance decision engine instance.
 *
 * @param engine - Engine to set as global
 */
export function setGovernanceDecisionEngine(engine: GovernanceDecisionEngine): void {
  globalEngine = engine;
}

/**
 * Reset the global governance decision engine.
 */
export function resetGovernanceDecisionEngine(): void {
  globalEngine = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick content admission check.
 *
 * @param content - Content to evaluate
 * @param trustTier - Source trust tier
 * @param origin - Content origin
 * @param actor - Actor requesting evaluation
 * @returns Decision record
 */
export function quickContentAdmission(
  content: string,
  trustTier: 'internal' | 'internal-generated' | 'external-verified' | 'external-untrusted',
  origin: string,
  actor: string,
): DecisionRecord {
  const engine = getGovernanceDecisionEngine();
  return engine.decideContentAdmission(
    { content, trustTier, origin },
    { actor, reason: 'Quick content admission check' },
  );
}

/**
 * Quick action execution check.
 *
 * @param actionId - Action identifier
 * @param description - Action description
 * @param riskLevel - Risk level
 * @param actor - Actor requesting evaluation
 * @param preflightPassed - Whether preflight passed
 * @param groundedQueryPerformed - Whether grounded query was performed
 * @returns Decision record
 */
export function quickActionCheck(
  actionId: string,
  description: string,
  riskLevel: 'low' | 'medium' | 'high',
  actor: string,
  preflightPassed: boolean,
  groundedQueryPerformed: boolean,
): DecisionRecord {
  const engine = getGovernanceDecisionEngine();
  return engine.decideActionExecution(
    {
      actionId,
      description,
      riskLevel,
      preflightPassed,
      groundedQueryPerformed,
    },
    { actor, reason: 'Quick action execution check' },
  );
}
