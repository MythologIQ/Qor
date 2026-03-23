/**
 * Quarantine Governance Gate — Routing logic for external content
 *
 * Routes content through HOSTILE/SUSPICIOUS/CLEAN pathways based on scan verdicts,
 * applies confidence caps by source trust tier, and enforces quarantine policies.
 *
 * Integration points:
 * - quarantine-scan.ts: ScanResult with verdict and score
 * - quarantine-sanitize.ts: Content sanitization for suspicious items
 * - types.ts: SourceTrustTier, ScanVerdict, SourceTrustMetadata
 */

import type {
  ScanVerdict,
  ScanResult,
  SourceTrustTier,
  SourceTrustMetadata,
  GovernanceMetadata,
  GovernanceState,
  EpistemicType,
} from './types.js';

// ============================================================================
// Gate Result Types
// ============================================================================

export type GateAction =
  | 'admit'           // Clean content → normal pipeline
  | 'sanitize-admit'    // Suspicious → sanitize then admit with reduced confidence
  | 'quarantine'        // Hostile/suspicious → hold for review
  | 'reject';           // Hostile → block permanently

export interface GateDecision {
  action: GateAction;
  confidenceCap: number;     // Max confidence allowed for this content
  recommendedGovernanceState: GovernanceState;
  recommendedEpistemicType: EpistemicType;
  requiresReview: boolean;
  reason: string;
  sanitizedContent?: string;   // If sanitize-admit action
  audit: GateAuditRecord;
}

export interface GateAuditRecord {
  gateVersion: string;
  decidedAt: number;
  scanScore: number;
  trustTier: SourceTrustTier;
  appliedPolicy: string;
  confidenceBeforeCap?: number;
}

export interface QuarantineRecord {
  id: string;
  content: string;
  sourceMetadata: SourceTrustMetadata;
  scanResult: ScanResult;
  gateDecision: GateDecision;
  quarantinedAt: number;
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewedBy?: string;
  reviewedAt?: number;
  reviewNotes?: string;
  expiresAt: number;
}

// ============================================================================
// Confidence Caps by Trust Tier
// ============================================================================

/** Maximum confidence allowed per source trust tier */
export const CONFIDENCE_CAPS: Record<SourceTrustTier, number> = {
  internal: 0.95,            // High trust but not absolute
  'internal-generated': 0.90, // Victor's own synthesis (lower to encourage verification)
  'external-verified': 0.75,  // Verified external sources
  'external-untrusted': 0.50, // Moltbook, unknown agents (capped low)
};

/** Default confidence by trust tier when no explicit confidence provided */
export const DEFAULT_CONFIDENCE: Record<SourceTrustTier, number> = {
  internal: 0.85,
  'internal-generated': 0.75,
  'external-verified': 0.60,
  'external-untrusted': 0.30,
};

// ============================================================================
// Gate Policies
// ============================================================================

export interface GatePolicy {
  name: string;
  /** Score threshold for suspicious classification */
  suspiciousThreshold: number;
  /** Score threshold for hostile classification */
  hostileThreshold: number;
  /** Whether to auto-sanitize suspicious content */
  autoSanitize: boolean;
  /** Max age (ms) for quarantined items before auto-rejection */
  quarantineExpiryMs: number;
  /** Whether hostile content can ever be admitted */
  allowHostileAdmit: boolean;
}

/** Default production policy */
export const DEFAULT_GATE_POLICY: GatePolicy = {
  name: 'production',
  suspiciousThreshold: 30,
  hostileThreshold: 70,
  autoSanitize: true,
  quarantineExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  allowHostileAdmit: false,
};

/** Strict policy for high-security contexts */
export const STRICT_GATE_POLICY: GatePolicy = {
  name: 'strict',
  suspiciousThreshold: 15,
  hostileThreshold: 50,
  autoSanitize: false,        // Don't auto-sanitize, always quarantine suspicious
  quarantineExpiryMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  allowHostileAdmit: false,
};

/** Permissive policy for internal-only contexts */
export const PERMISSIVE_GATE_POLICY: GatePolicy = {
  name: 'permissive',
  suspiciousThreshold: 50,
  hostileThreshold: 85,
  autoSanitize: true,
  quarantineExpiryMs: 14 * 24 * 60 * 60 * 1000, // 14 days
  allowHostileAdmit: false,
};

// ============================================================================
// Core Gate Functions
// ============================================================================

/**
 * Route content through the governance gate based on scan verdict and trust tier.
 *
 * @param scanResult - Result from quarantine-scan.ts
 * @param trustTier - Source trust classification
 * @param originalContent - Raw content for potential sanitization
 * @param policy - Gate policy to apply (defaults to production)
 * @returns GateDecision with routing action and confidence cap
 */
export function evaluateGate(
  scanResult: ScanResult,
  trustTier: SourceTrustTier,
  originalContent: string,
  policy: GatePolicy = DEFAULT_GATE_POLICY,
): GateDecision {
  const decidedAt = Date.now();
  const confidenceCap = CONFIDENCE_CAPS[trustTier];

  // Hostile content: always reject or quarantine
  if (scanResult.verdict === 'hostile') {
    if (policy.allowHostileAdmit) {
      // Extremely rare case - hostile content allowed through with minimal confidence
      return {
        action: 'quarantine',
        confidenceCap: Math.min(confidenceCap, 0.10),
        recommendedGovernanceState: 'quarantined',
        recommendedEpistemicType: 'conjecture',
        requiresReview: true,
        reason: `Hostile content detected (score: ${scanResult.score}). Policy allows admission with extreme restrictions.`,
        audit: {
          gateVersion: '1.0.0',
          decidedAt,
          scanScore: scanResult.score,
          trustTier,
          appliedPolicy: policy.name,
          confidenceBeforeCap: 0.10,
        },
      };
    }

    return {
      action: 'reject',
      confidenceCap: 0,
      recommendedGovernanceState: 'rejected',
      recommendedEpistemicType: 'conjecture',
      requiresReview: false,
      reason: `Hostile content detected (score: ${scanResult.score}). Permanently blocked per policy '${policy.name}'.`,
      audit: {
        gateVersion: '1.0.0',
        decidedAt,
        scanScore: scanResult.score,
        trustTier,
        appliedPolicy: policy.name,
      },
    };
  }

  // Suspicious content: sanitize-admit or quarantine
  if (scanResult.verdict === 'suspicious') {
    // High suspicion score → quarantine regardless of auto-sanitize setting
    if (scanResult.score >= policy.hostileThreshold * 0.7) {
      return {
        action: 'quarantine',
        confidenceCap: Math.min(confidenceCap, 0.30),
        recommendedGovernanceState: 'quarantined',
        recommendedEpistemicType: 'source-claim',
        requiresReview: true,
        reason: `High-suspicion content (score: ${scanResult.score}) requires manual review before admission.`,
        audit: {
          gateVersion: '1.0.0',
          decidedAt,
          scanScore: scanResult.score,
          trustTier,
          appliedPolicy: policy.name,
        },
      };
    }

    // Auto-sanitize path
    if (policy.autoSanitize) {
      return {
        action: 'sanitize-admit',
        confidenceCap: Math.min(confidenceCap, 0.50),
        recommendedGovernanceState: 'provisional',
        recommendedEpistemicType: 'source-claim',
        requiresReview: false,
        reason: `Suspicious content (score: ${scanResult.score}) admitted after sanitization. Confidence capped at 50%.`,
        sanitizedContent: originalContent, // Will be processed by sanitizer externally
        audit: {
          gateVersion: '1.0.0',
          decidedAt,
          scanScore: scanResult.score,
          trustTier,
          appliedPolicy: policy.name,
          confidenceBeforeCap: 0.50,
        },
      };
    }

    // No auto-sanitize → quarantine for manual review
    return {
      action: 'quarantine',
      confidenceCap: Math.min(confidenceCap, 0.30),
      recommendedGovernanceState: 'quarantined',
      recommendedEpistemicType: 'source-claim',
      requiresReview: true,
      reason: `Suspicious content (score: ${scanResult.score}) quarantined for manual review (auto-sanitize disabled).`,
      audit: {
        gateVersion: '1.0.0',
        decidedAt,
        scanScore: scanResult.score,
        trustTier,
        appliedPolicy: policy.name,
      },
    };
  }

  // Clean content: admit with confidence cap
  return {
    action: 'admit',
    confidenceCap,
    recommendedGovernanceState: trustTier === 'external-untrusted' ? 'provisional' : 'durable',
    recommendedEpistemicType: trustTier === 'internal-generated' ? 'inferred-relation' : 'source-claim',
    requiresReview: false,
    reason: `Clean content from ${trustTier} source admitted with ${Math.round(confidenceCap * 100)}% confidence cap.`,
    audit: {
      gateVersion: '1.0.0',
      decidedAt,
      scanScore: scanResult.score,
      trustTier,
      appliedPolicy: policy.name,
    },
  };
}

/**
 * Create SourceTrustMetadata for a piece of external content.
 *
 * @param tier - Trust tier classification
 * @param origin - Origin identifier (e.g., "moltbook", "workspace")
 * @param originId - Optional unique ID from origin
 * @param scanResult - Scan result to include in metadata
 * @returns Complete SourceTrustMetadata
 */
export function createSourceTrustMetadata(
  tier: SourceTrustTier,
  origin: string,
  originId: string | undefined,
  scanResult: ScanResult,
): SourceTrustMetadata {
  return {
    tier,
    origin,
    originId,
    fetchedAt: new Date().toISOString(),
    scanVerdict: scanResult.verdict,
    scanDetails: scanResult.details,
    confidenceCap: CONFIDENCE_CAPS[tier],
  };
}

/**
 * Apply confidence cap to a governance metadata object.
 *
 * @param metadata - Base governance metadata
 * @param cap - Maximum confidence to allow
 * @returns Governance metadata with confidence capped
 */
export function applyConfidenceCap(
  metadata: Omit<GovernanceMetadata, 'confidence'> & { confidence?: number },
  cap: number,
): GovernanceMetadata {
  const originalConfidence = metadata.confidence ?? 0.5;
  const cappedConfidence = Math.min(originalConfidence, cap);

  return {
    ...metadata,
    confidence: cappedConfidence,
  } as GovernanceMetadata;
}

/**
 * Determine if a gate action allows content into the memory pipeline.
 *
 * @param action - Gate action to check
 * @returns true if content should be processed for memory ingestion
 */
export function isAdmissible(action: GateAction): boolean {
  return action === 'admit' || action === 'sanitize-admit';
}

/**
 * Determine if content requires quarantine storage.
 *
 * @param action - Gate action to check
 * @returns true if content should be stored in quarantine
 */
export function requiresQuarantine(action: GateAction): boolean {
  return action === 'quarantine';
}

/**
 * Get a human-readable description of a gate policy.
 *
 * @param policy - Gate policy to describe
 * @returns Description string
 */
export function describePolicy(policy: GatePolicy): string {
  return `${policy.name}: suspicious≥${policy.suspiciousThreshold}, hostile≥${policy.hostileThreshold}, ` +
    `auto-sanitize=${policy.autoSanitize}, expiry=${Math.round(policy.quarantineExpiryMs / 86400000)}d`;
}

// ============================================================================
// Batch Processing
// ============================================================================

export interface BatchGateResult {
  decisions: GateDecision[];
  admitted: number;
  sanitized: number;
  quarantined: number;
  rejected: number;
  requiresReview: number;
}

/**
 * Process multiple items through the gate in batch.
 *
 * @param items - Array of {scanResult, trustTier, content} tuples
 * @param policy - Gate policy to apply
 * @returns BatchGateResult with aggregated statistics
 */
export function evaluateGateBatch(
  items: Array<{ scanResult: ScanResult; trustTier: SourceTrustTier; content: string }>,
  policy: GatePolicy = DEFAULT_GATE_POLICY,
): BatchGateResult {
  const decisions = items.map(item =>
    evaluateGate(item.scanResult, item.trustTier, item.content, policy),
  );

  return {
    decisions,
    admitted: decisions.filter(d => d.action === 'admit').length,
    sanitized: decisions.filter(d => d.action === 'sanitize-admit').length,
    quarantined: decisions.filter(d => d.action === 'quarantine').length,
    rejected: decisions.filter(d => d.action === 'reject').length,
    requiresReview: decisions.filter(d => d.requiresReview).length,
  };
}
