import { randomUUID } from "node:crypto";
import { evaluate } from "./evaluate";
import { appendEvidence } from "./log";
import type {
  GovernedActionInput,
  GovernanceDecision,
  GovernedEvidenceLite,
  EvidenceBundle,
  EvidenceMode,
  Decision,
  RiskCategory,
} from "./contract";

export function classifyEvidence(e: unknown): EvidenceMode | "invalid" {
  if (!e || typeof e !== "object") return "invalid";
  const obj = e as Record<string, unknown>;
  if ("entries" in obj && "sessionId" in obj && "intentId" in obj) return "full";
  if ("intent" in obj && "justification" in obj && "inputs" in obj && "expectedOutcome" in obj) return "lite";
  return "invalid";
}

export function validateLite(e: GovernedEvidenceLite): boolean {
  return Boolean(
    e.intent?.trim() &&
    e.justification?.trim() &&
    Array.isArray(e.inputs) && e.inputs.length > 0 &&
    e.expectedOutcome?.trim()
  );
}

export function validateFull(e: EvidenceBundle): boolean {
  return Boolean(
    e.id && e.sessionId && e.intentId &&
    Array.isArray(e.entries) && e.entries.length > 0
  );
}

export async function executeGovernedAction(
  input: GovernedActionInput
): Promise<{ decision: GovernanceDecision; allowed: boolean }> {
  const decisionId = `gov_${randomUUID().slice(0, 12)}`;
  const timestamp = new Date().toISOString();

  const mode = classifyEvidence(input.evidence);
  if (mode === "invalid") {
    const decision = buildDecision(decisionId, timestamp, input, "Block", "lite", 0, "critical", 0, "Governance violation: missing or invalid evidence");
    recordDecision(decision);
    return { decision, allowed: false };
  }

  const valid = mode === "full"
    ? validateFull(input.evidence as EvidenceBundle)
    : validateLite(input.evidence as GovernedEvidenceLite);

  if (!valid) {
    const decision = buildDecision(decisionId, timestamp, input, "Block", mode, 0, "critical", 0, "Governance violation: evidence failed validation");
    recordDecision(decision);
    return { decision, allowed: false };
  }

  const evalResult = evaluate({
    action: input.action,
    agentId: input.agentId,
    resource: input.resource,
    context: input.payload,
    trustStage: input.trustStage || "kbt",
  });

  const confidence = mode === "full" ? evalResult.confidence : evalResult.confidence * 0.7;
  const decision = buildDecision(
    decisionId, timestamp, input,
    evalResult.decision, mode,
    evalResult.riskScore, evalResult.riskCategory,
    confidence, evalResult.mitigation,
  );

  recordDecision(decision);
  return { decision, allowed: evalResult.decision === "Allow" };
}

function buildDecision(
  decisionId: string, timestamp: string, input: GovernedActionInput,
  result: Decision, evidenceMode: EvidenceMode, riskScore: number,
  riskCategory: RiskCategory, confidence: number, mitigation?: string,
): GovernanceDecision {
  return {
    decisionId, timestamp,
    module: input.module,
    action: input.action,
    result, evidenceMode,
    riskScore, riskCategory, confidence,
    mitigation,
    agentId: input.agentId,
  };
}

function recordDecision(decision: GovernanceDecision): void {
  appendEvidence({
    kind: "PolicyDecision",
    source: `governance-gate/${decision.module}`,
    module: decision.module as "forge" | "qora" | "victor" | "continuum" | "qor",
    payload: {
      decisionId: decision.decisionId,
      action: decision.action,
      result: decision.result,
      evidenceMode: decision.evidenceMode,
      riskScore: decision.riskScore,
      riskCategory: decision.riskCategory,
      confidence: decision.confidence,
      mitigation: decision.mitigation,
      agentId: decision.agentId,
    },
    confidence: decision.confidence,
  });
}
