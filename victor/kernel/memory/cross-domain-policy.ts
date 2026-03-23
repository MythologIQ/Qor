/**
 * Cross-Domain Policy Enforcement
 *
 * Ensures policy constraints flow correctly between content and action domains:
 * - Content trust tier influences action risk assessment
 * - Action audit records reference source content IDs
 * - Policy violations in one domain trigger review requirements in the other
 * - No circular dependencies between content and action evaluation
 *
 * @module cross-domain-policy
 */

import type { DecisionRecord, GovernanceDecisionEngine } from './governance-decision-engine.js';
import type { GovernanceVerdict, ActionRiskLevel } from './unified-policy.js';
import type { SourceTrustTier } from './types.js';
import { getGovernanceDecisionEngine } from './governance-decision-engine.js';

// ============================================================================
// Cross-Domain Violation Types
// ============================================================================

/**
 * Types of cross-domain violations that can trigger review requirements.
 */
export type CrossDomainViolationType =
  | 'content_reject_blocks_action'      // Rejected content referenced by action
  | 'content_quarantine_escalates_action' // Quarantined content raises action risk
  | 'action_reject_flags_content'       // Rejected action flags its source content
  | 'action_failure_reduces_trust';     // Failed action reduces content trust tier

/**
 * A cross-domain violation record linking content and action domains.
 */
export interface CrossDomainViolation {
  /** Unique violation identifier */
  id: string;

  /** Type of cross-domain violation */
  type: CrossDomainViolationType;

  /** Content decision ID that triggered the violation */
  contentDecisionId?: string;

  /** Action decision ID that triggered the violation */
  actionDecisionId?: string;

  /** Content ID affected by this violation */
  contentId?: string;

  /** Action ID affected by this violation */
  actionId?: string;

  /** Trust tier of the content (affects action risk assessment) */
  contentTrustTier?: SourceTrustTier;

  /** Risk level of the action (affects content review requirements) */
  actionRiskLevel?: ActionRiskLevel;

  /** Verdict that triggered the violation */
  triggeringVerdict: GovernanceVerdict;

  /** Timestamp when violation was recorded */
  createdAt: string;

  /** Whether this violation has been reviewed */
  reviewed: boolean;

  /** Timestamp when violation was reviewed */
  reviewedAt?: string;

  /** Actor who reviewed the violation */
  reviewedBy?: string;

  /** Impact assessment */
  impact: {
    /** Whether action risk was elevated */
    actionRiskElevated: boolean;

    /** Whether content requires additional review */
    contentReviewRequired: boolean;

    /** Risk level adjustment (if action risk was elevated) */
    riskLevelAdjustment?: number;

    /** Trust tier adjustment (if content trust was reduced) */
    trustTierAdjustment?: number;
  };

  /** Human-readable explanation */
  explanation: string;
}

/**
 * Review requirement triggered by cross-domain effects.
 */
export interface CrossDomainReviewRequirement {
  /** Content or action ID requiring review */
  subjectId: string;

  /** Type of subject ('content' or 'action') */
  subjectType: 'content' | 'action';

  /** Reason for review requirement */
  reason: string;

  /** Source violations that triggered this requirement */
  sourceViolations: string[];

  /** Timestamp when requirement was created */
  createdAt: string;

  /** Severity of the review requirement */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Query filter for cross-domain violations.
 */
export interface CrossDomainViolationQuery {
  /** Filter by violation type */
  type?: CrossDomainViolationType;

  /** Filter by content ID */
  contentId?: string;

  /** Filter by action ID */
  actionId?: string;

  /** Filter by review status */
  reviewed?: boolean;

  /** Start date (ISO string) */
  fromDate?: string;

  /** End date (ISO string) */
  toDate?: string;

  /** Maximum results */
  limit?: number;
}

/**
 * Statistics about cross-domain violations.
 */
export interface CrossDomainStats {
  /** Total violations recorded */
  totalViolations: number;

  /** Violations by type */
  byType: Record<CrossDomainViolationType, number>;

  /** Pending review count */
  pendingReview: number;

  /** Reviewed count */
  reviewed: number;

  /** Active review requirements */
  activeReviewRequirements: number;
}

// ============================================================================
// Cross-Domain Policy Enforcer
// ============================================================================

/**
 * Enforces cross-domain policy constraints between content governance
 * and action governance domains.
 */
export class CrossDomainPolicyEnforcer {
  private violations: Map<string, CrossDomainViolation> = new Map();
  private reviewRequirements: Map<string, CrossDomainReviewRequirement> = new Map();
  private decisionEngine: GovernanceDecisionEngine;
  private maxHistorySize: number;

  /**
   * Create a new cross-domain policy enforcer.
   *
   * @param decisionEngine - Governance decision engine to monitor
   * @param maxHistorySize - Maximum violations to retain (default: 5000)
   */
  constructor(
    decisionEngine: GovernanceDecisionEngine = getGovernanceDecisionEngine(),
    maxHistorySize = 5000,
  ) {
    this.decisionEngine = decisionEngine;
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Analyze a content admission decision for cross-domain effects.
   * Call this after recording a content admission decision.
   *
   * @param decision - The content admission decision record
   * @returns Any cross-domain violations created
   */
  analyzeContentDecision(decision: DecisionRecord): CrossDomainViolation[] {
    const violations: CrossDomainViolation[] = [];

    // Only process rejections and quarantines (approvals don't trigger violations)
    if (decision.decision.verdict === 'approve') {
      return violations;
    }

    // Content rejection/quarantine affects future actions referencing this content
    const contentId = this.extractContentId(decision);
    if (contentId && (decision.decision.verdict === 'reject' || decision.decision.verdict === 'quarantine')) {
      const violation = this.recordViolation({
        type: decision.decision.verdict === 'reject'
          ? 'content_reject_blocks_action'
          : 'content_quarantine_escalates_action',
        contentDecisionId: decision.id,
        contentId,
        contentTrustTier: this.extractTrustTier(decision),
        triggeringVerdict: decision.decision.verdict,
        impact: {
          actionRiskElevated: decision.decision.verdict === 'quarantine',
          contentReviewRequired: false,
          riskLevelAdjustment: decision.decision.verdict === 'quarantine' ? 1 : undefined,
        },
        explanation: decision.decision.verdict === 'reject'
          ? `Content ${contentId} was rejected. Any action referencing this content should be blocked.`
          : `Content ${contentId} was quarantined. Actions referencing this content require elevated risk assessment.`,
      });
      violations.push(violation);

      // Create review requirement for actions that might reference this content
      this.createReviewRequirement({
        subjectId: contentId,
        subjectType: 'action',
        reason: `Action references ${decision.decision.verdict} content ${contentId}`,
        sourceViolations: [violation.id],
        severity: decision.decision.verdict === 'reject' ? 'high' : 'medium',
      });
    }

    return violations;
  }

  /**
   * Analyze an action execution decision for cross-domain effects.
   * Call this after recording an action execution decision.
   *
   * @param decision - The action execution decision record
   * @returns Any cross-domain violations created
   */
  analyzeActionDecision(decision: DecisionRecord): CrossDomainViolation[] {
    const violations: CrossDomainViolation[] = [];

    // Only process rejections (failed actions flag their source content)
    if (decision.decision.verdict !== 'reject') {
      return violations;
    }

    // Extract source content IDs from the action request
    const sourceContentIds = this.extractSourceContentIds(decision);
    const actionId = this.extractActionId(decision);
    const actionRiskLevel = this.extractRiskLevel(decision);

    for (const contentId of sourceContentIds) {
      const violation = this.recordViolation({
        type: 'action_reject_flags_content',
        actionDecisionId: decision.id,
        actionId,
        contentId,
        actionRiskLevel,
        triggeringVerdict: 'reject',
        impact: {
          actionRiskElevated: false,
          contentReviewRequired: true,
          trustTierAdjustment: -1, // Reduce trust tier by one level
        },
        explanation: `Action ${actionId} was rejected. Source content ${contentId} requires review and trust tier reduction.`,
      });
      violations.push(violation);

      // Create review requirement for the flagged content
      this.createReviewRequirement({
        subjectId: contentId,
        subjectType: 'content',
        reason: `Content flagged by rejected action ${actionId}`,
        sourceViolations: [violation.id],
        severity: actionRiskLevel === 'high' ? 'high' : 'medium',
      });
    }

    // If action failed and no source content IDs, it's a general failure
    if (sourceContentIds.length === 0 && actionId) {
      const violation = this.recordViolation({
        type: 'action_failure_reduces_trust',
        actionDecisionId: decision.id,
        actionId,
        actionRiskLevel,
        triggeringVerdict: 'reject',
        impact: {
          actionRiskElevated: false,
          contentReviewRequired: true,
        },
        explanation: `Action ${actionId} failed without specific source content. General trust reduction may apply.`,
      });
      violations.push(violation);
    }

    return violations;
  }

  /**
   * Check if an action requires elevated risk assessment due to cross-domain effects.
   *
   * @param actionId - Action identifier
   * @param sourceContentIds - Content IDs the action references
   * @returns Risk assessment adjustment
   */
  checkActionRiskElevation(
    actionId: string,
    sourceContentIds: string[],
  ): {
    elevated: boolean;
    originalRiskLevel?: ActionRiskLevel;
    adjustedRiskLevel?: ActionRiskLevel;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let hasQuarantinedContent = false;
    let hasRejectedContent = false;

    for (const contentId of sourceContentIds) {
      // Check for violations related to this content
      const violations = this.findViolationsByContent(contentId);

      for (const v of violations) {
        if (!v.reviewed && v.type === 'content_quarantine_escalates_action') {
          hasQuarantinedContent = true;
          reasons.push(`References quarantined content ${contentId}`);
        }
        if (!v.reviewed && v.type === 'content_reject_blocks_action') {
          hasRejectedContent = true;
          reasons.push(`References rejected content ${contentId}`);
        }
      }
    }

    // Check for direct action violations
    const actionViolations = this.findViolationsByAction(actionId);
    for (const v of actionViolations) {
      if (!v.reviewed) {
        reasons.push(`Previous violation: ${v.explanation}`);
      }
    }

    return {
      elevated: hasQuarantinedContent && !hasRejectedContent,
      reasons,
    };
  }

  /**
   * Check if content requires additional review due to cross-domain effects.
   *
   * @param contentId - Content identifier
   * @returns Review requirement status
   */
  checkContentReviewRequirement(
    contentId: string,
  ): {
    reviewRequired: boolean;
    severity?: 'low' | 'medium' | 'high';
    reasons: string[];
    trustTierAdjustment?: number;
  } {
    const reasons: string[] = [];
    let maxSeverity: 'low' | 'medium' | 'high' = 'low';
    let trustAdjustment = 0;

    // Check for violations related to this content
    const violations = this.findViolationsByContent(contentId);

    for (const v of violations) {
      if (!v.reviewed) {
        reasons.push(v.explanation);

        if (v.impact.trustTierAdjustment) {
          trustAdjustment += v.impact.trustTierAdjustment;
        }

        // Track highest severity
        const req = this.findReviewRequirement(contentId);
        if (req && req.severity === 'high') {
          maxSeverity = 'high';
        } else if (req && req.severity === 'medium' && maxSeverity !== 'high') {
          maxSeverity = 'medium';
        }
      }
    }

    return {
      reviewRequired: reasons.length > 0,
      severity: reasons.length > 0 ? maxSeverity : undefined,
      reasons,
      trustTierAdjustment: trustAdjustment !== 0 ? trustAdjustment : undefined,
    };
  }

  /**
   * Mark a violation as reviewed.
   *
   * @param violationId - Violation identifier
   * @param reviewer - Actor performing the review
   * @returns true if violation was found and marked reviewed
   */
  markViolationReviewed(violationId: string, reviewer: string): boolean {
    const violation = this.violations.get(violationId);
    if (!violation) return false;

    violation.reviewed = true;
    violation.reviewedAt = new Date().toISOString();
    violation.reviewedBy = reviewer;

    // Also mark related review requirements as resolved
    for (const req of this.reviewRequirements.values()) {
      if (req.sourceViolations.includes(violationId)) {
        this.reviewRequirements.delete(req.subjectId);
      }
    }

    return true;
  }

  /**
   * Query cross-domain violations.
   *
   * @param query - Query filters
   * @returns Matching violations
   */
  queryViolations(query: CrossDomainViolationQuery = {}): CrossDomainViolation[] {
    let results = Array.from(this.violations.values());

    if (query.type) {
      results = results.filter((v) => v.type === query.type);
    }
    if (query.contentId) {
      results = results.filter((v) => v.contentId === query.contentId);
    }
    if (query.actionId) {
      results = results.filter((v) => v.actionId === query.actionId);
    }
    if (typeof query.reviewed === 'boolean') {
      results = results.filter((v) => v.reviewed === query.reviewed);
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate).getTime();
      results = results.filter((v) => new Date(v.createdAt).getTime() >= from);
    }
    if (query.toDate) {
      const to = new Date(query.toDate).getTime();
      results = results.filter((v) => new Date(v.createdAt).getTime() <= to);
    }

    // Sort by creation time descending
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get cross-domain statistics.
   */
  getStats(): CrossDomainStats {
    const violations = Array.from(this.violations.values());

    const byType: Record<CrossDomainViolationType, number> = {
      content_reject_blocks_action: 0,
      content_quarantine_escalates_action: 0,
      action_reject_flags_content: 0,
      action_failure_reduces_trust: 0,
    };

    let pendingReview = 0;
    let reviewed = 0;

    for (const v of violations) {
      byType[v.type]++;
      if (v.reviewed) {
        reviewed++;
      } else {
        pendingReview++;
      }
    }

    return {
      totalViolations: violations.length,
      byType,
      pendingReview,
      reviewed,
      activeReviewRequirements: this.reviewRequirements.size,
    };
  }

  /**
   * Get all active review requirements.
   */
  getActiveReviewRequirements(): CrossDomainReviewRequirement[] {
    return Array.from(this.reviewRequirements.values());
  }

  /**
   * Export violations to JSONL format.
   *
   * @param query - Optional query to filter exported violations
   * @returns JSONL string
   */
  exportToJSONL(query?: CrossDomainViolationQuery): string {
    const violations = query ? this.queryViolations(query) : Array.from(this.violations.values());
    return violations.map((v) => JSON.stringify(v)).join('\n');
  }

  /**
   * Serialize enforcer state for persistence.
   */
  serialize(): {
    violations: CrossDomainViolation[];
    reviewRequirements: CrossDomainReviewRequirement[];
    maxHistorySize: number;
  } {
    return {
      violations: Array.from(this.violations.values()),
      reviewRequirements: Array.from(this.reviewRequirements.values()),
      maxHistorySize: this.maxHistorySize,
    };
  }

  /**
   * Load enforcer state from serialized data.
   *
   * @param data - Serialized state
   * @returns Loaded enforcer
   */
  static load(data: {
    violations: CrossDomainViolation[];
    reviewRequirements: CrossDomainReviewRequirement[];
    maxHistorySize: number;
  }): CrossDomainPolicyEnforcer {
    const enforcer = new CrossDomainPolicyEnforcer(undefined, data.maxHistorySize);

    for (const v of data.violations) {
      enforcer.violations.set(v.id, v);
    }
    for (const r of data.reviewRequirements) {
      enforcer.reviewRequirements.set(r.subjectId, r);
    }

    return enforcer;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private recordViolation(
    partial: Omit<CrossDomainViolation, 'id' | 'createdAt' | 'reviewed'>,
  ): CrossDomainViolation {
    // Enforce history size limit
    if (this.violations.size >= this.maxHistorySize) {
      this.pruneOldestViolations();
    }

    const violation: CrossDomainViolation = {
      ...partial,
      id: this.generateViolationId(),
      createdAt: new Date().toISOString(),
      reviewed: false,
    };

    this.violations.set(violation.id, violation);
    return violation;
  }

  private createReviewRequirement(
    partial: Omit<CrossDomainReviewRequirement, 'createdAt'>,
  ): CrossDomainReviewRequirement {
    const requirement: CrossDomainReviewRequirement = {
      ...partial,
      createdAt: new Date().toISOString(),
    };

    this.reviewRequirements.set(partial.subjectId, requirement);
    return requirement;
  }

  private findReviewRequirement(subjectId: string): CrossDomainReviewRequirement | undefined {
    return this.reviewRequirements.get(subjectId);
  }

  private findViolationsByContent(contentId: string): CrossDomainViolation[] {
    return Array.from(this.violations.values()).filter(
      (v) => v.contentId === contentId && !v.reviewed,
    );
  }

  private findViolationsByAction(actionId: string): CrossDomainViolation[] {
    return Array.from(this.violations.values()).filter(
      (v) => v.actionId === actionId && !v.reviewed,
    );
  }

  private extractContentId(decision: DecisionRecord): string | undefined {
    // Extract from request if available
    const request = decision.request as { contentId?: string; origin?: string };
    return request?.contentId;
  }

  private extractTrustTier(decision: DecisionRecord): SourceTrustTier | undefined {
    const request = decision.request as { trustTier?: SourceTrustTier };
    return request?.trustTier;
  }

  private extractSourceContentIds(decision: DecisionRecord): string[] {
    const request = decision.request as { sourceContentIds?: string[] };
    return request?.sourceContentIds || [];
  }

  private extractActionId(decision: DecisionRecord): string | undefined {
    const request = decision.request as { actionId?: string };
    return request?.actionId;
  }

  private extractRiskLevel(decision: DecisionRecord): ActionRiskLevel | undefined {
    const request = decision.request as { riskLevel?: ActionRiskLevel };
    return request?.riskLevel;
  }

  private generateViolationId(): string {
    return `cdv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private pruneOldestViolations(): void {
    const sorted = Array.from(this.violations.entries()).sort(
      (a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime(),
    );

    const toRemove = Math.ceil(this.maxHistorySize * 0.1); // Remove 10%
    for (let i = 0; i < toRemove; i++) {
      this.violations.delete(sorted[i][0]);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalEnforcer: CrossDomainPolicyEnforcer | null = null;

/**
 * Get the global cross-domain policy enforcer instance.
 */
export function getCrossDomainPolicyEnforcer(): CrossDomainPolicyEnforcer {
  if (!globalEnforcer) {
    globalEnforcer = new CrossDomainPolicyEnforcer();
  }
  return globalEnforcer;
}

/**
 * Set the global cross-domain policy enforcer instance.
 *
 * @param enforcer - Enforcer to set as global
 */
export function setCrossDomainPolicyEnforcer(enforcer: CrossDomainPolicyEnforcer): void {
  globalEnforcer = enforcer;
}

/**
 * Reset the global cross-domain policy enforcer.
 */
export function resetCrossDomainPolicyEnforcer(): void {
  globalEnforcer = null;
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Analyze a decision for cross-domain effects and record any violations.
 * This is a convenience function that automatically routes to the correct
 * analyzer based on decision type.
 *
 * @param decision - Decision record to analyze
 * @returns Any cross-domain violations created
 */
export function analyzeDecisionForCrossDomainEffects(
  decision: DecisionRecord,
): CrossDomainViolation[] {
  const enforcer = getCrossDomainPolicyEnforcer();

  if (decision.type === 'content_admission') {
    return enforcer.analyzeContentDecision(decision);
  } else if (decision.type === 'action_execution') {
    return enforcer.analyzeActionDecision(decision);
  }

  return []; // Policy overrides don't create cross-domain effects
}

/**
 * Check if an action should have elevated risk due to cross-domain effects.
 * Convenience function using the global enforcer.
 *
 * @param actionId - Action identifier
 * @param sourceContentIds - Content IDs the action references
 * @returns Risk assessment adjustment
 */
export function checkCrossDomainActionRisk(
  actionId: string,
  sourceContentIds: string[],
): ReturnType<CrossDomainPolicyEnforcer['checkActionRiskElevation']> {
  const enforcer = getCrossDomainPolicyEnforcer();
  return enforcer.checkActionRiskElevation(actionId, sourceContentIds);
}

/**
 * Check if content should have additional review due to cross-domain effects.
 * Convenience function using the global enforcer.
 *
 * @param contentId - Content identifier
 * @returns Review requirement status
 */
export function checkCrossDomainContentReview(
  contentId: string,
): ReturnType<CrossDomainPolicyEnforcer['checkContentReviewRequirement']> {
  const enforcer = getCrossDomainPolicyEnforcer();
  return enforcer.checkContentReviewRequirement(contentId);
}
