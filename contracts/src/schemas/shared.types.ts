/**
 * Shared Types
 *
 * Common types used across the Zo-Qore system.
 */

/**
 * Risk grade levels for governance decisions
 * L1 = Low, L2 = Medium, L3 = High risk requiring approval
 */
export type RiskGrade = "L1" | "L2" | "L3";

/**
 * Operational modes for the system
 */
export type OperationalMode = "lean" | "surge" | "safe" | "normal" | "restricted" | "maintenance" | "emergency";

/**
 * Sentinel decision values (both uppercase and lowercase)
 */
export type SentinelDecision = 
  | "allow" 
  | "warn" 
  | "block" 
  | "escalate"
  | "ALLOW"
  | "WARN"
  | "BLOCK"
  | "ESCALATE"
  | "PASS"
  | "QUARANTINE";

/**
 * Sentinel verdict for governance decisions
 * Always an object with decision, summary, details, and agentDid properties
 */
export interface SentinelVerdict {
  decision: SentinelDecision;
  summary: string;
  details?: Record<string, unknown>;
  agentDid?: string;
}

/**
 * Agent identity information
 */
export interface AgentIdentity {
  did: string;
  name?: string;
  role?: string;
  trustLevel?: number;
  trustScore?: number;
  version?: number;
  persona?: string;
  publicKey?: string;
  trustStage?: string;
  isQuarantined?: boolean;
  verificationsCompleted?: number;
  createdAt?: string;
}

/**
 * Failure modes for error handling
 */
export type FailureMode = 
  | "transient"
  | "permanent"
  | "timeout"
  | "rate_limited"
  | "unauthorized"
  | "not_found"
  | "validation_error"
  | "internal_error"
  | "TRUST_VIOLATION"
  | "SPEC_VIOLATION"
  | "HIGH_COMPLEXITY"
  | "LOGIC_ERROR"
  | "OTHER";

/**
 * Shadow genome entry for learning patterns
 */
export interface ShadowGenomeEntry {
  id: string;
  pattern: string;
  context: Record<string, unknown>;
  outcome: "success" | "failure" | "neutral";
  timestamp: string;
  confidence: number;
  agentDid?: string;
  causalVector?: Record<string, unknown>;
  failureMode?: FailureMode;
}

/**
 * L3 approval state values
 */
export type L3ApprovalState = 
  | "QUEUED"
  | "APPROVED"
  | "REJECTED"
  | "APPROVED_WITH_CONDITIONS"
  | "L3_QUEUED"
  | "L3_APPROVED"
  | "L3_REJECTED";

/**
 * L3 decision values (both uppercase and lowercase forms)
 */
export type L3Decision = 
  | "approved" 
  | "rejected" 
  | "APPROVED" 
  | "REJECTED" 
  | "APPROVED_WITH_CONDITIONS";

/**
 * L3 approval request for high-trust operations
 * All extended properties are optional to allow partial creation
 */
export interface L3ApprovalRequest {
  id: string;
  requestId?: string;
  action?: string;
  payload?: Record<string, unknown>;
  requestedBy?: string;
  requestedAt?: string;
  status?: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
  // Extended properties for runtime
  state?: L3ApprovalState;
  queuedAt?: string;
  slaDeadline?: string;
  agentDid?: string;
  agentTrust?: number;
  filePath?: string;
  riskGrade?: RiskGrade;
  sentinelSummary?: string;
  flags?: string[];
  decidedAt?: string;
  overseerDid?: string;
  decision?: L3Decision;
  conditions?: string[];
}

/**
 * Ledger event types
 */
export type LedgerEventType =
  | "SYSTEM_EVENT"
  | "AGENT_ACTION"
  | "POLICY_DECISION"
  | "GOVERNANCE_EVENT"
  | "INTEGRITY_CHECK"
  | "STATE_MUTATION"
  | "AUDIT_EVENT"
  | "ERROR_EVENT"
  // Extended event types
  | "L3_QUEUED"
  | "L3_APPROVED"
  | "L3_REJECTED"
  | "EVALUATION_ROUTED"
  | "AUDIT_FAIL"
  | "AUDIT_PASS";

/**
 * Ledger entry for audit trail
 */
export interface LedgerEntry {
  id: string;
  timestamp: string;
  eventType: LedgerEventType;
  agentDid: string;
  agentTrustAtAction?: number;
  modelVersion?: string;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: RiskGrade;
  verificationMethod?: string;
  verificationResult?: string;
  sentinelConfidence?: number;
  overseerDid?: string;
  overseerDecision?: string;
  gdprTrigger?: boolean;
  payload?: Record<string, unknown>;
  entryHash: string;
  prevHash: string;
  signature: string;
}

/**
 * Intent history entry for ledger
 * Uses previousHash alias for prevHash
 */
export interface IntentHistoryEntry {
  entryHash: string;
  prevHash?: string;
  previousHash?: string;  // Alias for prevHash
  intentId: string;
  event: string;
  previousStatus: string;
  newStatus: string;
  actor: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * FailSafe event types
 */
export type FailSafeEventType =
  | "system_start"
  | "system_stop"
  | "error"
  | "warning"
  | "policy_violation"
  | "state_change"
  | "audit_log"
  // Extended event types
  | "sentinel.confidence"
  | "evaluation.metrics"
  | "sentinel.alert"
  | "qorelogic.l3Queued"
  | "qorelogic.l3Decided";

/**
 * FailSafe event for event bus
 */
export interface FailSafeEvent<P = unknown> {
  id: string;
  type: FailSafeEventType;
  timestamp: string;
  source: string;
  payload?: P;
  metadata?: Record<string, unknown>;
}
