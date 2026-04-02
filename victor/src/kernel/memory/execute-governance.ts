/**
 * Execute Mode Governance — Five-Tier Autonomy Progression
 *
 * Defines the five-tier governance system for Victor execute-mode operation,
 * aligned with the FailSafe Pro deterministic governance model:
 *
 * - Tier 1 (Observer):        Dry-run only, no writes, learning phase
 * - Tier 2 (Apprentice):      Execute with human approval, 1 action/tick
 * - Tier 3 (Autonomous):      Execute without approval, 3 actions/tick, cross-project
 * - Tier 4 (Governor):        Evaluate other agents, approve/reject, modify routing
 * - Tier 5 (Paladin of Truth): Author governance policy within constitutional bounds (CAP)
 *
 * Constitutional constraints (Tier 5 cap):
 * - Cannot self-promote past Tier 5
 * - Cannot fabricate evidence
 * - Cannot bypass cost governance
 * - Cannot silence the audit trail
 * - Cannot override user revocation
 *
 * @module execute-governance
 */

// ============================================================================
// Tier Definitions
// ============================================================================

/** Execute mode autonomy tiers */
export type ExecuteTier = 1 | 2 | 3 | 4 | 5;

/** Human-readable tier names */
export const TIER_NAMES: Record<ExecuteTier, string> = {
  1: 'Observer (Tier 1)',
  2: 'Apprentice (Tier 2)',
  3: 'Autonomous (Tier 3)',
  4: 'Governor (Tier 4)',
  5: 'Paladin of Truth (Tier 5)',
};

/** Tier descriptions for UI and documentation */
export const TIER_DESCRIPTIONS: Record<ExecuteTier, string> = {
  1: 'Dry-run observation mode. Actions are simulated but not executed. Used for learning user preferences and establishing behavioral baselines.',
  2: 'Assisted execute mode. Actions require explicit human approval before execution. Used for building trust through supervised operation.',
  3: 'Autonomous execute mode. Actions execute within governed bounds without blocking for approval. Requires established trust history.',
  4: 'Governor mode. Can evaluate other agents\' work, approve/reject their actions, and modify task routing. Requires governance simulation accuracy ≥95%.',
  5: 'Paladin of Truth. Can author governance policy within constitutional bounds and serve as Builder trust authority. Constitutional cap — cannot self-promote beyond this tier.',
};

// ============================================================================
// Authorization Modes
// ============================================================================

/**
 * Authorization modes for tier transitions.
 *
 * - explicit_user: User explicitly authorizes (e.g., button click, command)
 * - evidence_gated: Automatic promotion when evidence criteria are met
 * - automated: System-initiated within governed constraints
 */
export type AuthorizationMode = 'explicit_user' | 'evidence_gated' | 'automated';

/** Authorization requirements per tier */
export interface TierAuthorization {
  /** Mode of authorization for this tier */
  mode: AuthorizationMode;

  /** Human-readable description of authorization process */
  description: string;

  /** Whether explicit user confirmation is required */
  requiresUserConfirmation: boolean;

  /** Evidence threshold for evidence-gated promotion (0-1, null if not applicable) */
  evidenceThreshold: number | null;

  /** Minimum observation ticks required before promotion consideration */
  minObservationTicks: number;

  /** Minimum successful actions required before promotion consideration */
  minSuccessfulActions: number;
}

/** Authorization configuration for each tier */
export const TIER_AUTHORIZATION: Record<ExecuteTier, TierAuthorization> = {
  1: {
    mode: 'explicit_user',
    description: 'User explicitly enables Tier 1 observation mode. No execute capability.',
    requiresUserConfirmation: true,
    evidenceThreshold: null,
    minObservationTicks: 0,
    minSuccessfulActions: 0,
  },
  2: {
    mode: 'evidence_gated',
    description: 'Promotion to Tier 2 requires 50 productive observation ticks with no revocation triggers.',
    requiresUserConfirmation: true,
    evidenceThreshold: 0.95,
    minObservationTicks: 50,
    minSuccessfulActions: 10,
  },
  3: {
    mode: 'evidence_gated',
    description: 'Promotion to Tier 3 requires 100 additional productive ticks at Tier 2 with 95%+ approval rate.',
    requiresUserConfirmation: true,
    evidenceThreshold: 0.98,
    minObservationTicks: 100,
    minSuccessfulActions: 50,
  },
  4: {
    mode: 'evidence_gated',
    description: 'Promotion to Tier 4 requires 200 productive ticks at Tier 3 with cross-project evidence, self-correction instances, and ≥95% governance simulation accuracy.',
    requiresUserConfirmation: true,
    evidenceThreshold: 0.99,
    minObservationTicks: 200,
    minSuccessfulActions: 100,
  },
  5: {
    mode: 'evidence_gated',
    description: 'Promotion to Tier 5 (Paladin) requires 500 ticks across Tiers 3-4, governance of 2+ agents, authored policy modifications, and constitutional review passage.',
    requiresUserConfirmation: true,
    evidenceThreshold: 1.0,
    minObservationTicks: 500,
    minSuccessfulActions: 250,
  },
};

// ============================================================================
// Tier Capabilities
// ============================================================================

/** Capabilities granted at each tier */
export interface TierCapabilities {
  /** Can execute write actions (file modifications) */
  canExecuteWrites: boolean;

  /** Can execute without human approval per action */
  canExecuteWithoutApproval: boolean;

  /** Maximum actions per heartbeat tick */
  maxActionsPerTick: number;

  /** Maximum consecutive blocked ticks before pause */
  maxConsecutiveBlocked: number;

  /** Maximum consecutive failures before halt */
  maxConsecutiveFailures: number;

  /** Can schedule future actions */
  canScheduleFuture: boolean;

  /** Can operate across multiple projects */
  canCrossProject: boolean;

  /** Maximum runtime per session (minutes, null = unlimited) */
  maxRuntimeMinutes: number | null;

  /** Requires verification packet generation */
  requiresVerificationPacket: boolean;

  /** Can evaluate other agents' work (Tier 4+) */
  canEvaluateAgents: boolean;

  /** Can approve/reject other agents' actions (Tier 4+) */
  canApproveRejectActions: boolean;

  /** Can modify task routing between agents (Tier 4+) */
  canModifyTaskRouting: boolean;

  /** Can author governance policy within constitutional bounds (Tier 5) */
  canAuthorPolicy: boolean;

  /** Can serve as Builder trust authority (Tier 5) */
  canServeTrustAuthority: boolean;
}

/** Capabilities granted at each tier */
export const TIER_CAPABILITIES: Record<ExecuteTier, TierCapabilities> = {
  1: {
    canExecuteWrites: false,
    canExecuteWithoutApproval: false,
    maxActionsPerTick: 0,
    maxConsecutiveBlocked: 10,
    maxConsecutiveFailures: 5,
    canScheduleFuture: false,
    canCrossProject: false,
    maxRuntimeMinutes: null,
    requiresVerificationPacket: true,
    canEvaluateAgents: false,
    canApproveRejectActions: false,
    canModifyTaskRouting: false,
    canAuthorPolicy: false,
    canServeTrustAuthority: false,
  },
  2: {
    canExecuteWrites: true,
    canExecuteWithoutApproval: false,
    maxActionsPerTick: 1,
    maxConsecutiveBlocked: 3,
    maxConsecutiveFailures: 2,
    canScheduleFuture: false,
    canCrossProject: false,
    maxRuntimeMinutes: 30,
    requiresVerificationPacket: true,
    canEvaluateAgents: false,
    canApproveRejectActions: false,
    canModifyTaskRouting: false,
    canAuthorPolicy: false,
    canServeTrustAuthority: false,
  },
  3: {
    canExecuteWrites: true,
    canExecuteWithoutApproval: true,
    maxActionsPerTick: 3,
    maxConsecutiveBlocked: 5,
    maxConsecutiveFailures: 3,
    canScheduleFuture: true,
    canCrossProject: true,
    maxRuntimeMinutes: null,
    requiresVerificationPacket: true,
    canEvaluateAgents: false,
    canApproveRejectActions: false,
    canModifyTaskRouting: false,
    canAuthorPolicy: false,
    canServeTrustAuthority: false,
  },
  4: {
    canExecuteWrites: true,
    canExecuteWithoutApproval: true,
    maxActionsPerTick: 5,
    maxConsecutiveBlocked: 7,
    maxConsecutiveFailures: 4,
    canScheduleFuture: true,
    canCrossProject: true,
    maxRuntimeMinutes: null,
    requiresVerificationPacket: true,
    canEvaluateAgents: true,
    canApproveRejectActions: true,
    canModifyTaskRouting: true,
    canAuthorPolicy: false,
    canServeTrustAuthority: false,
  },
  5: {
    canExecuteWrites: true,
    canExecuteWithoutApproval: true,
    maxActionsPerTick: 7,
    maxConsecutiveBlocked: 10,
    maxConsecutiveFailures: 5,
    canScheduleFuture: true,
    canCrossProject: true,
    maxRuntimeMinutes: null,
    requiresVerificationPacket: true,
    canEvaluateAgents: true,
    canApproveRejectActions: true,
    canModifyTaskRouting: true,
    canAuthorPolicy: true,
    canServeTrustAuthority: true,
  },
};

// ============================================================================
// Revocation Triggers
// ============================================================================

/** Types of revocation triggers that can demote tiers */
export type RevocationTriggerType =
  | 'consecutive_failures'
  | 'consecutive_blocked'
  | 'user_override'
  | 'policy_violation'
  | 'safety_trigger'
  | 'drift_detected'
  | 'verification_failure'
  | 'governance_accuracy_failure'
  | 'constitutional_violation'
  | 'evidence_fabrication'
  | 'cost_governance_bypass'
  | 'audit_trail_suppression';

/** Human-readable descriptions of revocation triggers */
export const REVOCATION_TRIGGER_DESCRIPTIONS: Record<RevocationTriggerType, string> = {
  consecutive_failures: 'Too many consecutive action failures',
  consecutive_blocked: 'Too many consecutive blocked ticks (no progress)',
  user_override: 'User explicitly revoked autonomy',
  policy_violation: 'Governance policy violation detected',
  safety_trigger: 'Safety mechanism triggered',
  drift_detected: 'Behavioral drift from established patterns',
  verification_failure: 'Verification packet generation or validation failed',
  governance_accuracy_failure: 'Governance evaluation accuracy dropped below required threshold',
  constitutional_violation: 'Violated constitutional constraint (Paladin oath)',
  evidence_fabrication: 'Attempted to fabricate or falsify evidence',
  cost_governance_bypass: 'Attempted to bypass cost governance controls',
  audit_trail_suppression: 'Attempted to suppress or silence audit trail entries',
};

/** Revocation rules per tier */
export interface RevocationRule {
  /** Trigger type */
  trigger: RevocationTriggerType;

  /** Threshold for trigger (count, ratio, etc.) */
  threshold: number;

  /** Tier to demote to when triggered */
  demoteTo: ExecuteTier;

  /** Whether this trigger requires immediate halt */
  immediateHalt: boolean;

  /** Whether user confirmation required for re-promotion */
  requiresReauthorization: boolean;
}

/** Revocation rules applicable at each tier */
export const TIER_REVOCATION_RULES: Record<ExecuteTier, RevocationRule[]> = {
  1: [
    {
      trigger: 'user_override',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
  ],
  2: [
    {
      trigger: 'consecutive_failures',
      threshold: 2,
      demoteTo: 1,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'consecutive_blocked',
      threshold: 3,
      demoteTo: 1,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'user_override',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'policy_violation',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
  ],
  3: [
    {
      trigger: 'consecutive_failures',
      threshold: 3,
      demoteTo: 2,
      immediateHalt: false,
      requiresReauthorization: false,
    },
    {
      trigger: 'consecutive_blocked',
      threshold: 5,
      demoteTo: 2,
      immediateHalt: false,
      requiresReauthorization: false,
    },
    {
      trigger: 'user_override',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'policy_violation',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'safety_trigger',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'drift_detected',
      threshold: 1,
      demoteTo: 2,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'verification_failure',
      threshold: 1,
      demoteTo: 2,
      immediateHalt: false,
      requiresReauthorization: false,
    },
  ],
  4: [
    {
      trigger: 'governance_accuracy_failure',
      threshold: 1,
      demoteTo: 3,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'consecutive_failures',
      threshold: 4,
      demoteTo: 3,
      immediateHalt: false,
      requiresReauthorization: false,
    },
    {
      trigger: 'user_override',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'policy_violation',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'safety_trigger',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'drift_detected',
      threshold: 1,
      demoteTo: 3,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'evidence_fabrication',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'cost_governance_bypass',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
  ],
  5: [
    {
      trigger: 'constitutional_violation',
      threshold: 1,
      demoteTo: 3,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'evidence_fabrication',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'cost_governance_bypass',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'audit_trail_suppression',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'governance_accuracy_failure',
      threshold: 1,
      demoteTo: 4,
      immediateHalt: false,
      requiresReauthorization: true,
    },
    {
      trigger: 'user_override',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'policy_violation',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
    {
      trigger: 'safety_trigger',
      threshold: 1,
      demoteTo: 1,
      immediateHalt: true,
      requiresReauthorization: true,
    },
  ],
};

// ============================================================================
// Tier State Management
// ============================================================================

/** Current state of execute mode governance */
export interface ExecuteGovernanceState {
  /** Current tier */
  currentTier: ExecuteTier;

  /** When current tier was entered */
  tierEnteredAt: string;

  /** Total productive ticks across all tiers */
  totalProductiveTicks: number;

  /** Productive ticks at current tier */
  currentTierTicks: number;

  /** Total successful actions */
  totalSuccessfulActions: number;

  /** Successful actions at current tier */
  currentTierSuccessfulActions: number;

  /** Current consecutive blocked count */
  consecutiveBlocked: number;

  /** Current consecutive failure count */
  consecutiveFailures: number;

  /** History of tier transitions */
  tierHistory: TierTransition[];

  /** Active revocation triggers */
  activeTriggers: RevocationTriggerType[];

  /** Whether execute mode is currently paused */
  isPaused: boolean;

  /** When state was last updated */
  lastUpdatedAt: string;

  // --- Governor / Paladin tracking (Tier 4-5) ---

  /** Number of self-corrections (blocked own action before governance intervened) */
  selfCorrectionCount: number;

  /** Governance simulation accuracy (0-1, ratio of correct evaluations) */
  governanceAccuracy: number;

  /** Number of governance evaluations performed */
  governanceEvaluationCount: number;

  /** Number of agents governed (unique agent IDs supervised at Tier 4+) */
  agentsGoverned: number;

  /** Number of policy modifications authored (Tier 5) */
  policyModificationsAuthored: number;

  /** Whether constitutional review has been passed (Tier 5 gate) */
  constitutionalReviewPassed: boolean;

  /** Cumulative ticks across Tiers 3-4 (used for Tier 5 promotion gate) */
  cumulativeHighTierTicks: number;
}

/** Tier transition record */
export interface TierTransition {
  /** From tier */
  from: ExecuteTier;

  /** To tier */
  to: ExecuteTier;

  /** When transition occurred */
  timestamp: string;

  /** Reason for transition */
  reason: 'promotion' | 'demotion' | 'user_initiated' | 'system_initiated';

  /** Trigger that caused demotion (if applicable) */
  trigger?: RevocationTriggerType;
}

/** Create initial governance state at Tier 1 */
export function createInitialGovernanceState(): ExecuteGovernanceState {
  const now = new Date().toISOString();
  return {
    currentTier: 1,
    tierEnteredAt: now,
    totalProductiveTicks: 0,
    currentTierTicks: 0,
    totalSuccessfulActions: 0,
    currentTierSuccessfulActions: 0,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    tierHistory: [],
    activeTriggers: [],
    isPaused: false,
    lastUpdatedAt: now,
    selfCorrectionCount: 0,
    governanceAccuracy: 0,
    governanceEvaluationCount: 0,
    agentsGoverned: 0,
    policyModificationsAuthored: 0,
    constitutionalReviewPassed: false,
    cumulativeHighTierTicks: 0,
  };
}

// ============================================================================
// Tier Evaluation
// ============================================================================

/** Result of evaluating promotion eligibility */
export interface PromotionEvaluation {
  /** Whether promotion is eligible */
  eligible: boolean;

  /** Target tier for promotion */
  targetTier: ExecuteTier;

  /** Confidence in promotion recommendation (0-1) */
  confidence: number;

  /** Missing criteria preventing promotion */
  missingCriteria: string[];

  /** Met criteria supporting promotion */
  metCriteria: string[];
}

/** Minimum self-correction instances required for Tier 3→4 promotion */
export const TIER4_MIN_SELF_CORRECTIONS = 10;

/** Minimum governance simulation accuracy for Tier 3→4 promotion */
export const TIER4_MIN_GOVERNANCE_ACCURACY = 0.95;

/** Minimum governance evaluations for accuracy to be meaningful */
export const TIER4_MIN_GOVERNANCE_EVALUATIONS = 20;

/** Minimum agents governed for Tier 4→5 promotion */
export const TIER5_MIN_AGENTS_GOVERNED = 2;

/** Minimum policy modifications authored for Tier 4→5 promotion */
export const TIER5_MIN_POLICY_MODIFICATIONS = 1;

/** Minimum cumulative ticks across Tiers 3-4 for Tier 5 */
export const TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS = 500;

/**
 * Constitutional constraints — inviolable at Tier 5.
 * These define the Paladin's oath and cannot be relaxed by any policy.
 */
export const CONSTITUTIONAL_CONSTRAINTS = [
  'Cannot self-promote past Tier 5',
  'Cannot fabricate or falsify evidence',
  'Cannot bypass cost governance controls',
  'Cannot silence or suppress the audit trail',
  'Cannot override user revocation of autonomy',
] as const;

/** Evaluate whether state is eligible for tier promotion */
export function evaluatePromotion(
  state: ExecuteGovernanceState,
): PromotionEvaluation {
  const targetTier = (state.currentTier + 1) as ExecuteTier;

  // Cannot promote above Tier 5 (Constitutional cap)
  if (state.currentTier >= MAX_TIER) {
    return {
      eligible: false,
      targetTier: MAX_TIER,
      confidence: 1.0,
      missingCriteria: [`Already at maximum tier (${TIER_NAMES[MAX_TIER]})`],
      metCriteria: [],
    };
  }

  const auth = TIER_AUTHORIZATION[targetTier];
  const missingCriteria: string[] = [];
  const metCriteria: string[] = [];

  // === Common criteria (all tiers) ===

  // Check observation ticks requirement
  if (state.currentTierTicks < auth.minObservationTicks) {
    missingCriteria.push(
      `Need ${auth.minObservationTicks} ticks at current tier, have ${state.currentTierTicks}`,
    );
  } else {
    metCriteria.push(`Met ${auth.minObservationTicks} observation ticks requirement`);
  }

  // Check successful actions requirement
  if (state.currentTierSuccessfulActions < auth.minSuccessfulActions) {
    missingCriteria.push(
      `Need ${auth.minSuccessfulActions} successful actions, have ${state.currentTierSuccessfulActions}`,
    );
  } else {
    metCriteria.push(`Met ${auth.minSuccessfulActions} successful actions requirement`);
  }

  // Check no active revocation triggers
  if (state.activeTriggers.length > 0) {
    missingCriteria.push(`Active revocation triggers: ${state.activeTriggers.join(', ')}`);
  } else {
    metCriteria.push('No active revocation triggers');
  }

  // === Tier 4 (Governor) additional criteria ===
  if (targetTier === 4) {
    // Self-correction evidence
    if (state.selfCorrectionCount < TIER4_MIN_SELF_CORRECTIONS) {
      missingCriteria.push(
        `Need ${TIER4_MIN_SELF_CORRECTIONS} self-correction instances, have ${state.selfCorrectionCount}`,
      );
    } else {
      metCriteria.push(`Met ${TIER4_MIN_SELF_CORRECTIONS} self-correction instances`);
    }

    // Governance simulation accuracy
    if (state.governanceEvaluationCount < TIER4_MIN_GOVERNANCE_EVALUATIONS) {
      missingCriteria.push(
        `Need ${TIER4_MIN_GOVERNANCE_EVALUATIONS} governance evaluations, have ${state.governanceEvaluationCount}`,
      );
    } else if (state.governanceAccuracy < TIER4_MIN_GOVERNANCE_ACCURACY) {
      missingCriteria.push(
        `Need ${(TIER4_MIN_GOVERNANCE_ACCURACY * 100).toFixed(0)}% governance accuracy, have ${(state.governanceAccuracy * 100).toFixed(1)}%`,
      );
    } else {
      metCriteria.push(`Governance accuracy ${(state.governanceAccuracy * 100).toFixed(1)}% ≥ ${(TIER4_MIN_GOVERNANCE_ACCURACY * 100).toFixed(0)}%`);
    }

    // Cross-project evidence (must already be operating cross-project)
    if (!TIER_CAPABILITIES[state.currentTier].canCrossProject) {
      missingCriteria.push('Cross-project operation not available at current tier');
    } else {
      metCriteria.push('Cross-project operation enabled');
    }
  }

  // === Tier 5 (Paladin of Truth) additional criteria ===
  if (targetTier === 5) {
    // Agents governed
    if (state.agentsGoverned < TIER5_MIN_AGENTS_GOVERNED) {
      missingCriteria.push(
        `Need ${TIER5_MIN_AGENTS_GOVERNED} agents governed, have ${state.agentsGoverned}`,
      );
    } else {
      metCriteria.push(`Governed ${state.agentsGoverned} agents`);
    }

    // Policy modifications
    if (state.policyModificationsAuthored < TIER5_MIN_POLICY_MODIFICATIONS) {
      missingCriteria.push(
        `Need ${TIER5_MIN_POLICY_MODIFICATIONS} authored policy modification(s), have ${state.policyModificationsAuthored}`,
      );
    } else {
      metCriteria.push(`Authored ${state.policyModificationsAuthored} policy modification(s)`);
    }

    // Constitutional review
    if (!state.constitutionalReviewPassed) {
      missingCriteria.push('Constitutional review not yet passed');
    } else {
      metCriteria.push('Constitutional review passed');
    }

    // Cumulative high-tier ticks
    if (state.cumulativeHighTierTicks < TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS) {
      missingCriteria.push(
        `Need ${TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS} cumulative Tier 3-4 ticks, have ${state.cumulativeHighTierTicks}`,
      );
    } else {
      metCriteria.push(`Met ${TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS} cumulative high-tier ticks`);
    }

    // Governance accuracy must still be high
    if (state.governanceAccuracy < TIER4_MIN_GOVERNANCE_ACCURACY) {
      missingCriteria.push(
        `Governance accuracy ${(state.governanceAccuracy * 100).toFixed(1)}% below required ${(TIER4_MIN_GOVERNANCE_ACCURACY * 100).toFixed(0)}%`,
      );
    } else {
      metCriteria.push('Governance accuracy sustained');
    }
  }

  // Calculate confidence based on progress toward thresholds
  const tickProgress = auth.minObservationTicks > 0
    ? Math.min(1, state.currentTierTicks / auth.minObservationTicks)
    : 1;
  const actionProgress = auth.minSuccessfulActions > 0
    ? Math.min(1, state.currentTierSuccessfulActions / auth.minSuccessfulActions)
    : 1;
  const confidence = Math.min(tickProgress, actionProgress) * (state.activeTriggers.length === 0 ? 1 : 0.5);

  return {
    eligible: missingCriteria.length === 0,
    targetTier,
    confidence,
    missingCriteria,
    metCriteria,
  };
}

/** Result of checking revocation triggers */
export interface RevocationCheck {
  /** Whether any trigger is active */
  shouldRevoke: boolean;

  /** Tier to demote to */
  demoteTo: ExecuteTier;

  /** Whether immediate halt required */
  immediateHalt: boolean;

  /** Triggers that fired */
  firedTriggers: RevocationRule[];

  /** Whether reauthorization required */
  requiresReauthorization: boolean;
}

/** Check if any revocation triggers should fire */
export function checkRevocationTriggers(
  state: ExecuteGovernanceState,
): RevocationCheck {
  const rules = TIER_REVOCATION_RULES[state.currentTier];
  const fired: RevocationRule[] = [];

  for (const rule of rules) {
    let triggered = false;

    switch (rule.trigger) {
      case 'consecutive_failures':
        triggered = state.consecutiveFailures >= rule.threshold;
        break;
      case 'consecutive_blocked':
        triggered = state.consecutiveBlocked >= rule.threshold;
        break;
      case 'user_override':
      case 'policy_violation':
      case 'safety_trigger':
      case 'drift_detected':
      case 'verification_failure':
      case 'governance_accuracy_failure':
      case 'constitutional_violation':
      case 'evidence_fabrication':
      case 'cost_governance_bypass':
      case 'audit_trail_suppression':
        // These are event-driven triggers checked via activeTriggers
        triggered = state.activeTriggers.includes(rule.trigger);
        break;
    }

    if (triggered) {
      fired.push(rule);
    }
  }

  if (fired.length === 0) {
    return {
      shouldRevoke: false,
      demoteTo: state.currentTier,
      immediateHalt: false,
      firedTriggers: [],
      requiresReauthorization: false,
    };
  }

  // Find the most severe demotion (lowest tier)
  const demoteTo = Math.min(...fired.map((r) => r.demoteTo)) as ExecuteTier;
  const immediateHalt = fired.some((r) => r.immediateHalt);
  const requiresReauthorization = fired.some((r) => r.requiresReauthorization);

  return {
    shouldRevoke: true,
    demoteTo,
    immediateHalt,
    firedTriggers: fired,
    requiresReauthorization,
  };
}

// ============================================================================
// State Updates
// ============================================================================

/** Record a productive tick in state */
export function recordProductiveTick(state: ExecuteGovernanceState): ExecuteGovernanceState {
  const isHighTier = state.currentTier >= 3;
  return {
    ...state,
    totalProductiveTicks: state.totalProductiveTicks + 1,
    currentTierTicks: state.currentTierTicks + 1,
    consecutiveBlocked: 0,
    cumulativeHighTierTicks: isHighTier
      ? state.cumulativeHighTierTicks + 1
      : state.cumulativeHighTierTicks,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a blocked tick in state */
export function recordBlockedTick(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    consecutiveBlocked: state.consecutiveBlocked + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a successful action in state */
export function recordSuccessfulAction(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    totalSuccessfulActions: state.totalSuccessfulActions + 1,
    currentTierSuccessfulActions: state.currentTierSuccessfulActions + 1,
    consecutiveFailures: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a failed action in state */
export function recordFailedAction(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    consecutiveFailures: state.consecutiveFailures + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Promote to next tier */
export function promoteTier(
  state: ExecuteGovernanceState,
  reason: string = 'promotion',
): ExecuteGovernanceState {
  const newTier = (state.currentTier + 1) as ExecuteTier;
  const now = new Date().toISOString();

  return {
    ...state,
    currentTier: newTier,
    tierEnteredAt: now,
    currentTierTicks: 0,
    currentTierSuccessfulActions: 0,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    activeTriggers: [],
    tierHistory: [
      ...state.tierHistory,
      {
        from: state.currentTier,
        to: newTier,
        timestamp: now,
        reason: 'promotion',
      },
    ],
    lastUpdatedAt: now,
  };
}

/** Demote to specified tier */
export function demoteTier(
  state: ExecuteGovernanceState,
  demoteTo: ExecuteTier,
  trigger: RevocationTriggerType,
): ExecuteGovernanceState {
  const now = new Date().toISOString();

  return {
    ...state,
    currentTier: demoteTo,
    tierEnteredAt: now,
    currentTierTicks: 0,
    currentTierSuccessfulActions: 0,
    consecutiveBlocked: 0,
    consecutiveFailures: 0,
    activeTriggers: state.activeTriggers.filter((t) => t !== trigger),
    tierHistory: [
      ...state.tierHistory,
      {
        from: state.currentTier,
        to: demoteTo,
        timestamp: now,
        reason: 'demotion',
        trigger,
      },
    ],
    lastUpdatedAt: now,
  };
}

/** Activate a revocation trigger */
export function activateTrigger(
  state: ExecuteGovernanceState,
  trigger: RevocationTriggerType,
): ExecuteGovernanceState {
  if (state.activeTriggers.includes(trigger)) {
    return state;
  }

  return {
    ...state,
    activeTriggers: [...state.activeTriggers, trigger],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Clear a revocation trigger */
export function clearTrigger(
  state: ExecuteGovernanceState,
  trigger: RevocationTriggerType,
): ExecuteGovernanceState {
  return {
    ...state,
    activeTriggers: state.activeTriggers.filter((t) => t !== trigger),
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Pause execute mode */
export function pauseExecuteMode(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    isPaused: true,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Resume execute mode */
export function resumeExecuteMode(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    isPaused: false,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a self-correction (Victor blocked own action before governance had to) */
export function recordSelfCorrection(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    selfCorrectionCount: state.selfCorrectionCount + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a governance evaluation result */
export function recordGovernanceEvaluation(
  state: ExecuteGovernanceState,
  correct: boolean,
): ExecuteGovernanceState {
  const newCount = state.governanceEvaluationCount + 1;
  const correctSoFar = state.governanceAccuracy * state.governanceEvaluationCount + (correct ? 1 : 0);
  return {
    ...state,
    governanceEvaluationCount: newCount,
    governanceAccuracy: correctSoFar / newCount,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record a new agent being governed */
export function recordAgentGoverned(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    agentsGoverned: state.agentsGoverned + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Record an authored policy modification */
export function recordPolicyModification(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    policyModificationsAuthored: state.policyModificationsAuthored + 1,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Mark constitutional review as passed */
export function markConstitutionalReviewPassed(state: ExecuteGovernanceState): ExecuteGovernanceState {
  return {
    ...state,
    constitutionalReviewPassed: true,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Tier Status Queries
// ============================================================================

/** Get human-readable status summary */
export function getTierStatusSummary(state: ExecuteGovernanceState): string {
  const lines = [
    `Current Tier: ${TIER_NAMES[state.currentTier]}`,
    `Status: ${state.isPaused ? 'PAUSED' : 'ACTIVE'}`,
    `Entered Tier: ${state.tierEnteredAt}`,
    '',
    'Progress:',
    `  Total Productive Ticks: ${state.totalProductiveTicks}`,
    `  Current Tier Ticks: ${state.currentTierTicks}`,
    `  Total Successful Actions: ${state.totalSuccessfulActions}`,
    `  Current Tier Actions: ${state.currentTierSuccessfulActions}`,
    '',
    'Counters:',
    `  Consecutive Blocked: ${state.consecutiveBlocked}`,
    `  Consecutive Failures: ${state.consecutiveFailures}`,
  ];

  if (state.activeTriggers.length > 0) {
    lines.push('', 'Active Revocation Triggers:');
    for (const trigger of state.activeTriggers) {
      lines.push(`  - ${REVOCATION_TRIGGER_DESCRIPTIONS[trigger]}`);
    }
  }

  if (state.tierHistory.length > 0) {
    lines.push('', 'Tier History:');
    for (const transition of state.tierHistory) {
      const triggerInfo = transition.trigger
        ? ` (${REVOCATION_TRIGGER_DESCRIPTIONS[transition.trigger]})`
        : '';
      lines.push(
        `  ${transition.timestamp}: Tier ${transition.from} → ${transition.to} (${transition.reason})${triggerInfo}`,
      );
    }
  }

  return lines.join('\n');
}

/** Check if a specific capability is allowed */
export function isCapabilityAllowed(
  state: ExecuteGovernanceState,
  capability: keyof TierCapabilities,
): boolean {
  const capabilities = TIER_CAPABILITIES[state.currentTier];
  return capabilities[capability];
}

/** Get remaining requirements for promotion */
export function getPromotionRequirements(
  state: ExecuteGovernanceState,
): PromotionRequirements | null {
  if (state.currentTier >= MAX_TIER) {
    return null;
  }

  const nextTier = (state.currentTier + 1) as ExecuteTier;
  const auth = TIER_AUTHORIZATION[nextTier];

  const reqs: PromotionRequirements = {
    ticksRemaining: Math.max(0, auth.minObservationTicks - state.currentTierTicks),
    actionsRemaining: Math.max(0, auth.minSuccessfulActions - state.currentTierSuccessfulActions),
  };

  if (nextTier === 4) {
    reqs.selfCorrectionsRemaining = Math.max(0, TIER4_MIN_SELF_CORRECTIONS - state.selfCorrectionCount);
    reqs.governanceEvaluationsRemaining = Math.max(0, TIER4_MIN_GOVERNANCE_EVALUATIONS - state.governanceEvaluationCount);
    reqs.governanceAccuracyMet = state.governanceEvaluationCount >= TIER4_MIN_GOVERNANCE_EVALUATIONS
      && state.governanceAccuracy >= TIER4_MIN_GOVERNANCE_ACCURACY;
  }

  if (nextTier === 5) {
    reqs.agentsGovernedRemaining = Math.max(0, TIER5_MIN_AGENTS_GOVERNED - state.agentsGoverned);
    reqs.policyModificationsRemaining = Math.max(0, TIER5_MIN_POLICY_MODIFICATIONS - state.policyModificationsAuthored);
    reqs.constitutionalReviewPassed = state.constitutionalReviewPassed;
    reqs.cumulativeHighTierTicksRemaining = Math.max(0, TIER5_MIN_CUMULATIVE_HIGH_TIER_TICKS - state.cumulativeHighTierTicks);
  }

  return reqs;
}

/** Structured promotion requirements */
export interface PromotionRequirements {
  ticksRemaining: number;
  actionsRemaining: number;
  // Tier 4 specific
  selfCorrectionsRemaining?: number;
  governanceEvaluationsRemaining?: number;
  governanceAccuracyMet?: boolean;
  // Tier 5 specific
  agentsGovernedRemaining?: number;
  policyModificationsRemaining?: number;
  constitutionalReviewPassed?: boolean;
  cumulativeHighTierTicksRemaining?: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum tier level (constitutional cap) */
export const MAX_TIER: ExecuteTier = 5;

/** Minimum tier level */
export const MIN_TIER: ExecuteTier = 1;

/** Default observation window size for Tier 2 promotion */
export const DEFAULT_TIER2_OBSERVATION_WINDOW = 50;

/** Default observation window size for Tier 3 promotion */
export const DEFAULT_TIER3_OBSERVATION_WINDOW = 100;

/** Default observation window size for Tier 4 promotion */
export const DEFAULT_TIER4_OBSERVATION_WINDOW = 200;

/** Default observation window size for Tier 5 promotion */
export const DEFAULT_TIER5_OBSERVATION_WINDOW = 500;
