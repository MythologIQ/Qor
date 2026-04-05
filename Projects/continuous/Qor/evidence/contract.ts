export type EvidenceKind =
  | "CapabilityReceipt"
  | "PolicyDecision"
  | "TestResult"
  | "CodeDelta"
  | "ReviewRecord"
  | "ReleaseRecord"
  | "MemoryRecall";

export type Decision = "Allow" | "Block" | "Modify" | "Escalate" | "Quarantine";
export type TrustStage = "cbt" | "kbt" | "ibt";
export type RiskCategory = "none" | "low" | "medium" | "high" | "critical";

export interface EvidenceEntry {
  id: string;
  timestamp: string;
  kind: EvidenceKind;
  workCellId?: string;
  source: string;
  module: "victor" | "qora" | "forge" | "continuum" | "qor";
  payload: Record<string, unknown>;
  confidence: number;
}

export interface EvaluationRequest {
  action: string;
  agentId: string;
  resource?: string;
  context?: Record<string, unknown>;
  trustStage: TrustStage;
}

export interface EvaluationResponse {
  decision: Decision;
  riskScore: number;
  riskCategory: RiskCategory;
  trustStage: TrustStage;
  mitigation?: string;
  confidence: number;
  memoryContext?: unknown[];
}

export interface EvidencePolicy {
  requireTests: boolean;
  requireReview: boolean;
}

export interface BundleCompleteness {
  hasTests: boolean;
  hasReview: boolean;
  hasPolicyDecisions: boolean;
  hasCodeDeltas: boolean;
  missing: string[];
}

export interface EvidenceBundle {
  id: string;
  sessionId: string;
  intentId: string;
  workCellIds: string[];
  entries: EvidenceEntry[];
  confidence: number;
  completeness: BundleCompleteness;
  generatedAt: string;
}

export type GovernedEvidenceLite = {
  intent: string;
  justification: string;
  inputs: string[];
  expectedOutcome: string;
};

export type GovernedEvidence = EvidenceBundle | GovernedEvidenceLite;

export type EvidenceMode = "full" | "lite";

export interface GovernedActionInput {
  module: "forge" | "qora" | "victor" | "continuum";
  action: string;
  agentId: string;
  payload: Record<string, unknown>;
  evidence: GovernedEvidence;
  resource?: string;
  trustStage?: TrustStage;
}

export interface GovernanceDecision {
  decisionId: string;
  timestamp: string;
  module: string;
  action: string;
  result: Decision;
  evidenceMode: EvidenceMode;
  riskScore: number;
  riskCategory: RiskCategory;
  confidence: number;
  mitigation?: string;
  agentId: string;
}
