/**
 * Crystallization Policy Controls
 * 
 * Implements approval-required crystallization as the default policy.
 * High-saturation memory eligible for L3 promotion must pass through
 * an explicit approval gate before crystallizing into permanent storage.
 */

export type CrystallizationPolicyMode = "approval-required" | "auto-approve" | "always-deny";

export type ApprovalStatus = "pending" | "approved" | "denied" | "not-requested";

export interface CrystallizationPolicy {
  mode: CrystallizationPolicyMode;
  requiresApproval: boolean;
  allowsAutoPromotion: boolean;
  createdAt: number;
}

export interface CrystallizationApprovalRequest {
  memoryId: string;
  requestedAt: number;
  saturation: number;
  tier: string;
  reason: string;
}

export interface CrystallizationApprovalRecord {
  memoryId: string;
  status: ApprovalStatus;
  requestedAt: number | null;
  decidedAt: number | null;
  decidedBy: string | null;
  reason: string;
}

export interface CrystallizationPolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  approvalNeeded: boolean;
}

/**
 * Default crystallization policy: approval-required
 * Promotion to L3 storage requires explicit approval
 */
export const DEFAULT_CRYSTALLIZATION_POLICY: CrystallizationPolicy = {
  mode: "approval-required",
  requiresApproval: true,
  allowsAutoPromotion: false,
  createdAt: Date.now(),
};

/**
 * Create a crystallization policy with specified mode
 */
export function createCrystallizationPolicy(
  mode: CrystallizationPolicyMode = "approval-required"
): CrystallizationPolicy {
  return {
    mode,
    requiresApproval: mode === "approval-required",
    allowsAutoPromotion: mode === "auto-approve",
    createdAt: Date.now(),
  };
}

/**
 * Check if promotion to crystallized (L3) storage is allowed under current policy
 */
export function checkCrystallizationPolicy(
  policy: CrystallizationPolicy,
  approvalStatus: ApprovalStatus
): CrystallizationPolicyDecision {
  // Always-deny mode blocks all crystallization
  if (policy.mode === "always-deny") {
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Crystallization denied by policy mode: always-deny",
      approvalNeeded: false,
    };
  }

  // Auto-approve mode allows immediate promotion
  if (policy.mode === "auto-approve") {
    return {
      allowed: true,
      requiresApproval: false,
      reason: "Auto-approved by policy mode: auto-approve",
      approvalNeeded: false,
    };
  }

  // Approval-required mode (default) - check approval status
  if (policy.mode === "approval-required") {
    if (approvalStatus === "approved") {
      return {
        allowed: true,
        requiresApproval: true,
        reason: "Crystallization approved",
        approvalNeeded: false,
      };
    }

    if (approvalStatus === "denied") {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Crystallization denied by approval decision",
        approvalNeeded: false,
      };
    }

    if (approvalStatus === "pending") {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Crystallization pending approval",
        approvalNeeded: false,
      };
    }

    // not-requested status - approval needed
    return {
      allowed: false,
      requiresApproval: true,
      reason: "Crystallization requires approval - no approval request submitted",
      approvalNeeded: true,
    };
  }

  // Fallback: deny if policy mode unknown
  return {
    allowed: false,
    requiresApproval: false,
    reason: `Unknown policy mode: ${policy.mode}`,
    approvalNeeded: false,
  };
}

/**
 * Create an approval request for crystallization
 */
export function createApprovalRequest(
  memoryId: string,
  saturation: number,
  tier: string,
  reason: string
): CrystallizationApprovalRequest {
  return {
    memoryId,
    requestedAt: Date.now(),
    saturation,
    tier,
    reason,
  };
}

/**
 * Initialize approval record for a memory
 */
export function initializeApprovalRecord(memoryId: string): CrystallizationApprovalRecord {
  return {
    memoryId,
    status: "not-requested",
    requestedAt: null,
    decidedAt: null,
    decidedBy: null,
    reason: "No approval request submitted",
  };
}

/**
 * Submit an approval request (transition from not-requested to pending)
 */
export function submitApprovalRequest(
  record: CrystallizationApprovalRecord,
  request: CrystallizationApprovalRequest
): CrystallizationApprovalRecord {
  if (record.status !== "not-requested") {
    return record; // Already requested
  }

  return {
    ...record,
    status: "pending",
    requestedAt: request.requestedAt,
    reason: request.reason,
  };
}

/**
 * Approve a crystallization request
 */
export function approveRequest(
  record: CrystallizationApprovalRecord,
  decidedBy: string,
  reason: string = "Approved for crystallization"
): CrystallizationApprovalRecord {
  if (record.status !== "pending") {
    return record; // Can only approve pending requests
  }

  return {
    ...record,
    status: "approved",
    decidedAt: Date.now(),
    decidedBy,
    reason,
  };
}

/**
 * Deny a crystallization request
 */
export function denyRequest(
  record: CrystallizationApprovalRecord,
  decidedBy: string,
  reason: string
): CrystallizationApprovalRecord {
  if (record.status !== "pending") {
    return record; // Can only deny pending requests
  }

  return {
    ...record,
    status: "denied",
    decidedAt: Date.now(),
    decidedBy,
    reason,
  };
}

/**
 * Inspect policy configuration for governance visibility
 */
export function inspectCrystallizationPolicy(policy: CrystallizationPolicy): {
  mode: string;
  requiresApproval: boolean;
  allowsAutoPromotion: boolean;
  safetyLevel: "high" | "medium" | "low";
} {
  let safetyLevel: "high" | "medium" | "low";

  if (policy.mode === "approval-required") {
    safetyLevel = "high";
  } else if (policy.mode === "always-deny") {
    safetyLevel = "high";
  } else {
    safetyLevel = "low";
  }

  return {
    mode: policy.mode,
    requiresApproval: policy.requiresApproval,
    allowsAutoPromotion: policy.allowsAutoPromotion,
    safetyLevel,
  };
}

/**
 * Count pending approval requests for governance monitoring
 */
export function countPendingApprovals(
  records: CrystallizationApprovalRecord[]
): number {
  return records.filter((r) => r.status === "pending").length;
}

/**
 * Filter approval records by status
 */
export function filterRecordsByStatus(
  records: CrystallizationApprovalRecord[],
  status: ApprovalStatus
): CrystallizationApprovalRecord[] {
  return records.filter((r) => r.status === status);
}
