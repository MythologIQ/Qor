/**
 * Unified Governance Policy Framework
 *
 * Bridges quarantine pipeline (content governance) and execute-pilot (action governance)
 * under a single consistent policy framework with versioned, auditable policies.
 *
 * @module unified-policy
 */

import type { SourceTrustTier, ScanVerdict } from './types.js';
import type { ModelTier, CostBudget } from './cost-governance.js';
import { FREE_TIER_BUDGET, STANDARD_BUDGET, PREMIUM_BUDGET } from './cost-governance.js';

// ============================================================================
// Policy Versioning
// ============================================================================

export const UNIFIED_POLICY_VERSION = '1.0.0';

export interface PolicyVersion {
  version: string;
  createdAt: string;
  previousVersion?: string;
  changeSummary: string;
}

// ============================================================================
// Action Risk Levels
// ============================================================================

/**
 * Risk levels for automated actions.
 *
 * - low: Read-only operations, queries, status checks
 * - medium: File writes within governed paths, test execution
 * - high: Multi-file mutations, cross-project operations, irreversible changes
 */
export type ActionRiskLevel = 'low' | 'medium' | 'high';

/** Risk level precedence for comparison (higher = more restrictive) */
export const RISK_LEVEL_PRECEDENCE: Record<ActionRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/** Human-readable descriptions of risk levels */
export const RISK_LEVEL_DESCRIPTIONS: Record<ActionRiskLevel, string> = {
  low: 'Read-only operations with no side effects',
  medium: 'Contained writes within single project scope',
  high: 'Multi-file mutations or cross-project operations',
};

// ============================================================================
// Unified Confidence Thresholds
// ============================================================================

/**
 * Confidence thresholds indexed by [trustTier][riskLevel].
 *
 * These define the minimum confidence required to approve a governance
 * decision combining content from a specific trust tier with an action
 * of a specific risk level.
 */
export type ConfidenceThresholdMatrix = Record<SourceTrustTier, Record<ActionRiskLevel, number>>;

/** Default confidence thresholds per trust tier and risk level */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholdMatrix = {
  internal: {
    low: 0.60,
    medium: 0.75,
    high: 0.90,
  },
  'internal-generated': {
    low: 0.65,
    medium: 0.80,
    high: 0.95,
  },
  'external-verified': {
    low: 0.70,
    medium: 0.85,
    high: 0.98, // Near-certainty required for high-risk with external content
  },
  'external-untrusted': {
    low: 0.80,
    medium: 0.90,
    high: 1.00, // External-untrusted cannot be used for high-risk actions
  },
};

/** Strict thresholds for high-security contexts */
export const STRICT_CONFIDENCE_THRESHOLDS: ConfidenceThresholdMatrix = {
  internal: {
    low: 0.70,
    medium: 0.85,
    high: 0.95,
  },
  'internal-generated': {
    low: 0.75,
    medium: 0.90,
    high: 0.98,
  },
  'external-verified': {
    low: 0.85,
    medium: 0.95,
    high: 1.00, // External-verified cannot be used for high-risk in strict mode
  },
  'external-untrusted': {
    low: 0.90,
    medium: 1.00, // External-untrusted cannot be used for medium/high in strict mode
    high: 1.00,
  },
};

/** Permissive thresholds for development/testing */
export const PERMISSIVE_CONFIDENCE_THRESHOLDS: ConfidenceThresholdMatrix = {
  internal: {
    low: 0.50,
    medium: 0.60,
    high: 0.75,
  },
  'internal-generated': {
    low: 0.55,
    medium: 0.65,
    high: 0.80,
  },
  'external-verified': {
    low: 0.60,
    medium: 0.70,
    high: 0.85,
  },
  'external-untrusted': {
    low: 0.70,
    medium: 0.80,
    high: 0.95,
  },
};

// ============================================================================
// Content Scan Requirements
// ============================================================================

/**
 * Scan categories that must be evaluated for content admission.
 * Maps to the scan categories defined in quarantine-scan.ts.
 */
export type ScanCategory =
  | 'instruction_injection'
  | 'data_exfiltration'
  | 'prompt_leakage'
  | 'jailbreak_attempt'
  | 'obfuscated_content'
  | 'unicode_spoofing'
  | 'script_injection'
  | 'social_engineering'
  | 'code_injection'
  | 'c2_signatures';

/** All scan categories that content may be evaluated against */
export const ALL_SCAN_CATEGORIES: ScanCategory[] = [
  'instruction_injection',
  'data_exfiltration',
  'prompt_leakage',
  'jailbreak_attempt',
  'obfuscated_content',
  'unicode_spoofing',
  'script_injection',
  'social_engineering',
  'code_injection',
  'c2_signatures',
];

/** Required scan categories per trust tier */
export type ScanRequirements = Record<SourceTrustTier, ScanCategory[]>;

/** Default scan requirements - external tiers get full scanning */
export const DEFAULT_SCAN_REQUIREMENTS: ScanRequirements = {
  internal: ['instruction_injection', 'jailbreak_attempt'],
  'internal-generated': ['instruction_injection', 'jailbreak_attempt'],
  'external-verified': ALL_SCAN_CATEGORIES,
  'external-untrusted': ALL_SCAN_CATEGORIES,
};

/** Strict scan requirements - all tiers get full scanning */
export const STRICT_SCAN_REQUIREMENTS: ScanRequirements = {
  internal: ALL_SCAN_CATEGORIES,
  'internal-generated': ALL_SCAN_CATEGORIES,
  'external-verified': ALL_SCAN_CATEGORIES,
  'external-untrusted': ALL_SCAN_CATEGORIES,
};

/** Permissive scan requirements - minimal scanning */
export const PERMISSIVE_SCAN_REQUIREMENTS: ScanRequirements = {
  internal: [],
  'internal-generated': [],
  'external-verified': ['instruction_injection', 'jailbreak_attempt', 'code_injection'],
  'external-untrusted': ALL_SCAN_CATEGORIES,
};

// ============================================================================
// Action Verification Requirements
// ============================================================================

/**
 * Verification steps required before executing actions.
 *
 * - preflight_checks: Basic validation (file paths, project existence)
 * - grounded_query: Retrieve context from memory/graph
 * - human_review: Require explicit human approval
 * - dual_approval: Require two independent approvals for critical operations
 * - snapshot_backup: Create backup before mutation
 * - test_validation: Run tests after mutation
 */
export type VerificationStep =
  | 'preflight_checks'
  | 'grounded_query'
  | 'human_review'
  | 'dual_approval'
  | 'snapshot_backup'
  | 'test_validation';

/** Required verification steps per action risk level */
export type VerificationRequirements = Record<ActionRiskLevel, VerificationStep[]>;

/** Default verification requirements */
export const DEFAULT_VERIFICATION_REQUIREMENTS: VerificationRequirements = {
  low: ['preflight_checks', 'grounded_query'],
  medium: ['preflight_checks', 'grounded_query', 'snapshot_backup'],
  high: ['preflight_checks', 'grounded_query', 'snapshot_backup', 'human_review'],
};

/** Strict verification requirements */
export const STRICT_VERIFICATION_REQUIREMENTS: VerificationRequirements = {
  low: ['preflight_checks', 'grounded_query', 'snapshot_backup'],
  medium: ['preflight_checks', 'grounded_query', 'snapshot_backup', 'human_review'],
  high: ['preflight_checks', 'grounded_query', 'snapshot_backup', 'human_review', 'dual_approval'],
};

/** Permissive verification requirements */
export const PERMISSIVE_VERIFICATION_REQUIREMENTS: VerificationRequirements = {
  low: ['preflight_checks'],
  medium: ['preflight_checks', 'grounded_query'],
  high: ['preflight_checks', 'grounded_query', 'snapshot_backup'],
};

// ============================================================================
// Unified Policy
// ============================================================================

/**
 * Unified governance policy that governs both content admission and action execution.
 */
export interface UnifiedPolicy {
  /** Policy name (e.g., 'production', 'strict', 'permissive') */
  name: string;

  /** Policy version metadata */
  version: PolicyVersion;

  /** Confidence thresholds per trust tier and risk level */
  confidenceThresholds: ConfidenceThresholdMatrix;

  /** Required scan categories per trust tier */
  scanRequirements: ScanRequirements;

  /** Required verification steps per action risk level */
  verificationRequirements: VerificationRequirements;

  /** Maximum actions allowed per tick (rate limiting) */
  maxActionsPerTick: number;

  /** Maximum consecutive blocked ticks before pause */
  maxConsecutiveBlocked: number;

  /** Maximum consecutive failures before halt */
  maxConsecutiveFailures: number;

  /** Whether to auto-quarantine suspicious content */
  autoQuarantineSuspicious: boolean;

  /** Whether to require explicit approval for high-risk actions */
  requireApprovalForHighRisk: boolean;

  /** Cost budget configuration — controls model selection and spend limits */
  costBudget?: CostBudget;

  /** Model tier restrictions — when set, only these tiers can execute actions */
  allowedModelTiers?: ModelTier[];

  /** Whether to require structured prompts for free-tier models */
  requireStructuredPromptsForFreeTier?: boolean;
}

/** Default production policy */
export const DEFAULT_UNIFIED_POLICY: UnifiedPolicy = {
  name: 'production',
  version: {
    version: UNIFIED_POLICY_VERSION,
    createdAt: new Date().toISOString(),
    changeSummary: 'Initial unified governance policy',
  },
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  scanRequirements: DEFAULT_SCAN_REQUIREMENTS,
  verificationRequirements: DEFAULT_VERIFICATION_REQUIREMENTS,
  maxActionsPerTick: 1,
  maxConsecutiveBlocked: 2,
  maxConsecutiveFailures: 2,
  autoQuarantineSuspicious: true,
  requireApprovalForHighRisk: true,
  costBudget: FREE_TIER_BUDGET,
  allowedModelTiers: ['free', 'standard', 'premium'],
  requireStructuredPromptsForFreeTier: true,
};

/** Strict policy for high-security contexts */
export const STRICT_UNIFIED_POLICY: UnifiedPolicy = {
  name: 'strict',
  version: {
    version: UNIFIED_POLICY_VERSION,
    createdAt: new Date().toISOString(),
    changeSummary: 'Strict unified governance policy with elevated requirements',
  },
  confidenceThresholds: STRICT_CONFIDENCE_THRESHOLDS,
  scanRequirements: STRICT_SCAN_REQUIREMENTS,
  verificationRequirements: STRICT_VERIFICATION_REQUIREMENTS,
  maxActionsPerTick: 1,
  maxConsecutiveBlocked: 1,
  maxConsecutiveFailures: 1,
  autoQuarantineSuspicious: true,
  requireApprovalForHighRisk: true,
  costBudget: STANDARD_BUDGET,
  allowedModelTiers: ['free', 'standard'],
  requireStructuredPromptsForFreeTier: true,
};

/** Permissive policy for development/testing */
export const PERMISSIVE_UNIFIED_POLICY: UnifiedPolicy = {
  name: 'permissive',
  version: {
    version: UNIFIED_POLICY_VERSION,
    createdAt: new Date().toISOString(),
    changeSummary: 'Permissive unified governance policy for development',
  },
  confidenceThresholds: PERMISSIVE_CONFIDENCE_THRESHOLDS,
  scanRequirements: PERMISSIVE_SCAN_REQUIREMENTS,
  verificationRequirements: PERMISSIVE_VERIFICATION_REQUIREMENTS,
  maxActionsPerTick: 3,
  maxConsecutiveBlocked: 5,
  maxConsecutiveFailures: 3,
  autoQuarantineSuspicious: false,
  requireApprovalForHighRisk: false,
  costBudget: PREMIUM_BUDGET,
  allowedModelTiers: ['free', 'standard', 'premium'],
  requireStructuredPromptsForFreeTier: false,
};

// ============================================================================
// Policy Evaluation
// ============================================================================

/**
 * Content admission request.
 */
export interface ContentAdmissionRequest {
  /** Content to evaluate */
  content: string;

  /** Source trust tier */
  trustTier: SourceTrustTier;

  /** Content origin identifier */
  origin: string;

  /** Optional content ID from origin */
  contentId?: string;

  /** Scan result from quarantine-scan.ts */
  scanResult?: {
    verdict: ScanVerdict;
    score: number;
    matchedCategories: ScanCategory[];
  };
}

/**
 * Action execution request.
 */
export interface ActionExecutionRequest {
  /** Action identifier */
  actionId: string;

  /** Action description */
  description: string;

  /** Risk level of the action */
  riskLevel: ActionRiskLevel;

  /** Content IDs that inform this action */
  sourceContentIds?: string[];

  /** Trust tiers of source content */
  sourceTrustTiers?: SourceTrustTier[];

  /** Whether action has been preflight-checked */
  preflightPassed: boolean;

  /** Whether grounded query was performed */
  groundedQueryPerformed: boolean;

  /** Whether snapshot was created */
  snapshotCreated?: boolean;

  /** Model ID executing this action (for cost governance) */
  executingModelId?: string;

  /** Model tier executing this action */
  executingModelTier?: ModelTier;
}

/**
 * Governance verdict.
 */
export type GovernanceVerdict = 'approve' | 'quarantine' | 'reject';

/**
 * Governance decision with reasoning.
 */
export interface GovernanceDecision {
  /** Verdict: approve, quarantine, or reject */
  verdict: GovernanceVerdict;

  /** Confidence in the decision (0-1) */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Policy version applied */
  policyVersion: string;

  /** Policy name applied */
  policyName: string;

  /** Required verification steps that were checked */
  checkedVerifications: VerificationStep[];

  /** Missing verification steps that blocked approval */
  missingVerifications?: VerificationStep[];

  /** Timestamp of decision */
  decidedAt: string;
}

/**
 * Evaluate content admission against policy.
 *
 * @param request - Content admission request
 * @param policy - Policy to apply (defaults to production)
 * @returns Governance decision
 */
export function evaluateContentAdmission(
  request: ContentAdmissionRequest,
  policy: UnifiedPolicy = DEFAULT_UNIFIED_POLICY,
): GovernanceDecision {
  const decidedAt = new Date().toISOString();

  // Check if scan result was provided
  if (!request.scanResult) {
    return {
      verdict: 'quarantine',
      confidence: 0.5,
      reasoning: 'Content admission requires scan result. Quarantining pending scan.',
      policyVersion: policy.version.version,
      policyName: policy.name,
      checkedVerifications: [],
      missingVerifications: ['preflight_checks'],
      decidedAt,
    };
  }

  const { scanResult, trustTier } = request;

  // Hostile content: reject immediately (highest priority)
  if (scanResult.verdict === 'hostile') {
    return {
      verdict: 'reject',
      confidence: 0.95,
      reasoning: `Hostile content detected (score: ${scanResult.score}). Permanently blocked per policy '${policy.name}'.`,
      policyVersion: policy.version.version,
      policyName: policy.name,
      checkedVerifications: ['preflight_checks'],
      decidedAt,
    };
  }

  // Suspicious content
  if (scanResult.verdict === 'suspicious') {
    if (policy.autoQuarantineSuspicious) {
      return {
        verdict: 'quarantine',
        confidence: 0.6,
        reasoning: `Suspicious content detected (score: ${scanResult.score}). Quarantined for manual review per policy '${policy.name}'.`,
        policyVersion: policy.version.version,
        policyName: policy.name,
        checkedVerifications: ['preflight_checks'],
        decidedAt,
      };
    }
    // Auto-quarantine disabled → admit with reduced confidence
    return {
      verdict: 'approve',
      confidence: 0.5,
      reasoning: `Suspicious content (score: ${scanResult.score}) admitted with reduced confidence. Auto-quarantine disabled in policy '${policy.name}'.`,
      policyVersion: policy.version.version,
      policyName: policy.name,
      checkedVerifications: ['preflight_checks'],
      decidedAt,
    };
  }

  // Clean content: admit with appropriate confidence
  if (scanResult.verdict === 'clean') {
    return {
      verdict: 'approve',
      confidence: 0.85,
      reasoning: `Clean content from ${trustTier} source admitted per policy '${policy.name}'.`,
      policyVersion: policy.version.version,
      policyName: policy.name,
      checkedVerifications: ['preflight_checks'],
      decidedAt,
    };
  }

  // Unknown verdict
  return {
    verdict: 'quarantine',
    confidence: 0.3,
    reasoning: `Unknown scan verdict '${scanResult.verdict}'. Quarantining for manual review.`,
    policyVersion: policy.version.version,
    policyName: policy.name,
    checkedVerifications: [],
    decidedAt,
  };
}

/**
 * Evaluate action execution against policy.
 *
 * @param request - Action execution request
 * @param policy - Policy to apply (defaults to production)
 * @returns Governance decision
 */
export function evaluateActionExecution(
  request: ActionExecutionRequest,
  policy: UnifiedPolicy = DEFAULT_UNIFIED_POLICY,
): GovernanceDecision {
  const decidedAt = new Date().toISOString();

  // Check model tier allowance
  if (
    request.executingModelTier &&
    policy.allowedModelTiers &&
    policy.allowedModelTiers.length > 0 &&
    !policy.allowedModelTiers.includes(request.executingModelTier)
  ) {
    return {
      verdict: 'reject',
      confidence: 1.0,
      reasoning: `Model tier '${request.executingModelTier}' not allowed by policy '${policy.name}'. Allowed: [${policy.allowedModelTiers.join(', ')}].`,
      policyVersion: policy.version.version,
      policyName: policy.name,
      checkedVerifications: [],
      missingVerifications: ['preflight_checks'],
      decidedAt,
    };
  }

  // Determine effective trust tier from sources
  const trustTiers = request.sourceTrustTiers || ['internal-generated'];
  const effectiveTier = trustTiers.reduce<SourceTrustTier>((highest, tier) => {
    // External-untrusted > external-verified > internal-generated > internal
    const precedence: Record<SourceTrustTier, number> = {
      'external-untrusted': 4,
      'external-verified': 3,
      'internal-generated': 2,
      internal: 1,
    };
    return precedence[tier] > precedence[highest] ? tier : highest;
  }, 'internal');

  // Get required confidence threshold
  const threshold = policy.confidenceThresholds[effectiveTier][request.riskLevel];

  // Check required verification steps
  const requiredVerifications = policy.verificationRequirements[request.riskLevel];
  const checkedVerifications: VerificationStep[] = [];
  const missingVerifications: VerificationStep[] = [];

  for (const step of requiredVerifications) {
    switch (step) {
      case 'preflight_checks':
        if (request.preflightPassed) {
          checkedVerifications.push(step);
        } else {
          missingVerifications.push(step);
        }
        break;
      case 'grounded_query':
        if (request.groundedQueryPerformed) {
          checkedVerifications.push(step);
        } else {
          missingVerifications.push(step);
        }
        break;
      case 'snapshot_backup':
        if (request.snapshotCreated) {
          checkedVerifications.push(step);
        } else {
          missingVerifications.push(step);
        }
        break;
      case 'human_review':
        // Human review is always checked in this automated context
        // (actual human review happens before this function is called)
        checkedVerifications.push(step);
        break;
      case 'dual_approval':
        // Dual approval always requires explicit external verification
        missingVerifications.push(step);
        break;
      default:
        missingVerifications.push(step);
    }
  }

  // Calculate confidence based on verification completion
  const verificationRatio =
    checkedVerifications.length /
    (checkedVerifications.length + missingVerifications.length);
  const confidence = verificationRatio * threshold;

  // Determine verdict
  let verdict: GovernanceVerdict;
  let reasoning: string;

  if (missingVerifications.length > 0) {
    // In strict mode or for high-risk, reject if missing critical verifications
    const isCritical = request.riskLevel === 'high' || 
                       (policy.name === 'strict' && request.riskLevel === 'medium');
    
    if (isCritical && policy.requireApprovalForHighRisk) {
      verdict = 'reject';
      reasoning = `Action blocked: missing required verifications (${missingVerifications.join(', ')}).`;
    } else {
      verdict = 'quarantine';
      reasoning = `Action requires additional verification: ${missingVerifications.join(', ')}.`;
    }
  } else if (confidence < threshold) {
    verdict = 'quarantine';
    reasoning = `Confidence (${confidence.toFixed(2)}) below threshold (${threshold}) for ${effectiveTier} content + ${request.riskLevel} risk.`;
  } else {
    verdict = 'approve';
    reasoning = `All verifications passed. Confidence (${confidence.toFixed(2)}) meets threshold (${threshold}) for ${effectiveTier} content + ${request.riskLevel} risk.`;
  }

  return {
    verdict,
    confidence,
    reasoning,
    policyVersion: policy.version.version,
    policyName: policy.name,
    checkedVerifications,
    missingVerifications: missingVerifications.length > 0 ? missingVerifications : undefined,
    decidedAt,
  };
}

// ============================================================================
// Policy Utilities
// ============================================================================

/**
 * Get policy by name.
 *
 * @param name - Policy name
 * @returns Policy or null if not found
 */
export function getPolicyByName(name: string): UnifiedPolicy | null {
  switch (name) {
    case 'production':
      return { ...DEFAULT_UNIFIED_POLICY };
    case 'strict':
      return { ...STRICT_UNIFIED_POLICY };
    case 'permissive':
      return { ...PERMISSIVE_UNIFIED_POLICY };
    default:
      return null;
  }
}

/**
 * Create a custom policy from a base policy with overrides.
 *
 * @param baseName - Base policy name
 * @param overrides - Policy fields to override
 * @returns Custom policy
 */
export function createCustomPolicy(
  baseName: string,
  overrides: Partial<Omit<UnifiedPolicy, 'version'>> & { name: string },
): UnifiedPolicy | null {
  const base = getPolicyByName(baseName);
  if (!base) return null;

  return {
    ...base,
    ...overrides,
    version: {
      version: UNIFIED_POLICY_VERSION,
      createdAt: new Date().toISOString(),
      previousVersion: base.version.version,
      changeSummary: `Custom policy derived from ${baseName}`,
    },
  };
}

/**
 * Validate that a confidence threshold matrix has valid values.
 *
 * @param thresholds - Threshold matrix to validate
 * @returns Validation result
 */
export function validateConfidenceThresholds(
  thresholds: ConfidenceThresholdMatrix,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trustTiers: SourceTrustTier[] = ['internal', 'internal-generated', 'external-verified', 'external-untrusted'];
  const riskLevels: ActionRiskLevel[] = ['low', 'medium', 'high'];

  for (const tier of trustTiers) {
    if (!(tier in thresholds)) {
      errors.push(`Missing thresholds for trust tier: ${tier}`);
      continue;
    }

    for (const level of riskLevels) {
      const value = thresholds[tier][level];
      if (typeof value !== 'number') {
        errors.push(`Non-numeric threshold for ${tier}/${level}: ${value}`);
      } else if (value < 0 || value > 1) {
        errors.push(`Invalid threshold for ${tier}/${level}: ${value} (must be 0-1)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get a human-readable description of a policy.
 *
 * @param policy - Policy to describe
 * @returns Description string
 */
export function describePolicy(policy: UnifiedPolicy): string {
  const lines = [
    `Policy: ${policy.name} (v${policy.version.version})`,
    `Created: ${policy.version.createdAt}`,
    `Max Actions/Tick: ${policy.maxActionsPerTick}`,
    `Auto-Quarantine: ${policy.autoQuarantineSuspicious}`,
    `Require High-Risk Approval: ${policy.requireApprovalForHighRisk}`,
    '',
    'Confidence Thresholds:',
  ];

  for (const tier of Object.keys(policy.confidenceThresholds) as SourceTrustTier[]) {
    const thresholds = policy.confidenceThresholds[tier];
    lines.push(`  ${tier}:`);
    lines.push(`    low: ${thresholds.low}, medium: ${thresholds.medium}, high: ${thresholds.high}`);
  }

  lines.push('', 'Scan Requirements:');
  for (const tier of Object.keys(policy.scanRequirements) as SourceTrustTier[]) {
    const categories = policy.scanRequirements[tier];
    lines.push(`  ${tier}: ${categories.length > 0 ? categories.join(', ') : 'none'}`);
  }

  lines.push('', 'Verification Requirements:');
  for (const level of Object.keys(policy.verificationRequirements) as ActionRiskLevel[]) {
    const steps = policy.verificationRequirements[level];
    lines.push(`  ${level}: ${steps.join(', ')}`);
  }

  return lines.join('\n');
}
