import type { EvaluationRequest, EvaluationResponse, Decision, RiskCategory, TrustStage } from "./contract";
import {
  validateMutationContract,
  type MutationContract,
  type MutationContractValidationResult,
} from "./mutation-contract";

const ACTION_SCORES: Record<string, number> = {
  "file.read": 0.1,
  "file.write": 0.4,
  "file.delete": 0.6,
  "shell.execute": 0.8,
  "auth.modify": 0.95,
  "network.request": 0.5,
  "config.modify": 0.6,
  "phase.create": 0.3,
  "task.update": 0.2,
  "evidence.record": 0.1,
  "risk.update": 0.3,
  "quarantine.promote": 0.3,
  "quarantine.reject": 0.2,
  "cadence.change": 0.4,
  "memory.write": 0.2,
  "ledger.append": 0.2,
  "veto.record": 0.3,
};
const DEFAULT_UNKNOWN_SCORE = 0.5;

const CREDENTIAL_PATTERNS = [".env", "secret", "credential", "token", "key", "password"];
const SYSTEM_PATTERNS = ["/etc/", "/usr/", "/sys/"];
const CONFIG_PATTERNS = [".yaml", ".yml", ".toml", ".json", ".conf"];
const CREDENTIAL_BOOST = 0.3;
const SYSTEM_BOOST = 0.25;
const CONFIG_BOOST = 0.1;

interface TrustThresholds { allowCeiling: number; escalateCeiling: number; }
const TRUST_THRESHOLDS: Record<TrustStage, TrustThresholds> = {
  cbt: { allowCeiling: 0.3, escalateCeiling: 0.6 },
  kbt: { allowCeiling: 0.5, escalateCeiling: 0.75 },
  ibt: { allowCeiling: 0.7, escalateCeiling: 0.9 },
};

export type ValidatorClass = "atomic" | "structural" | "behavioral" | "governance";
export type EvaluationDecision = "allow" | "reject";

export interface MutationEvaluationContext {
  contract: MutationContract;
}

export interface MutationValidatorResult {
  validatorId: string;
  validatorClass: ValidatorClass;
  passed: boolean;
  critical: boolean;
  score: number;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface MutationValidator {
  id: string;
  validatorClass: ValidatorClass;
  critical: boolean;
  evaluate(context: MutationEvaluationContext): MutationValidatorResult;
}

export interface MutationEvaluationResult {
  decision: EvaluationDecision;
  reproducible: true;
  aggregateScore: number;
  criticalFailures: string[];
  validatorResults: MutationValidatorResult[];
}

export function evaluate(req: EvaluationRequest): EvaluationResponse {
  const base = scoreAction(req.action);
  const mod = scoreResource(req.resource);
  const riskScore = Math.min(base + mod, 1.0);
  const riskCategory = categorizeRisk(riskScore);
  const decision = resolveVerdict(riskScore, req.trustStage);
  const mitigation = generateMitigation(decision, req.action);
  const confidence = calculateConfidence(req);
  return { decision, riskScore, riskCategory, trustStage: req.trustStage, mitigation, confidence };
}

export function scoreAction(action: string): number {
  return ACTION_SCORES[action] ?? DEFAULT_UNKNOWN_SCORE;
}

function scoreResource(resource?: string): number {
  if (!resource) return 0.0;
  const path = resource.toLowerCase();
  if (CREDENTIAL_PATTERNS.some((pattern) => path.includes(pattern))) return CREDENTIAL_BOOST;
  if (SYSTEM_PATTERNS.some((pattern) => path.startsWith(pattern))) return SYSTEM_BOOST;
  if (CONFIG_PATTERNS.some((pattern) => path.endsWith(pattern))) return CONFIG_BOOST;
  return 0.0;
}

function categorizeRisk(score: number): RiskCategory {
  if (score < 0.1) return "none";
  if (score < 0.3) return "low";
  if (score < 0.6) return "medium";
  if (score < 0.8) return "high";
  return "critical";
}

function resolveVerdict(riskScore: number, trustStage: TrustStage): Decision {
  const thresholds = TRUST_THRESHOLDS[trustStage];
  if (riskScore < thresholds.allowCeiling) return "Allow";
  if (riskScore < thresholds.escalateCeiling) return "Escalate";
  return "Block";
}

function generateMitigation(decision: Decision, action: string): string | undefined {
  if (decision === "Allow") return undefined;
  if (decision === "Block") return `action '${action}' blocked — exceeds risk threshold`;
  if (decision === "Escalate") return `action '${action}' requires human approval`;
  if (decision === "Modify") return `action '${action}' allowed with modifications`;
  return `action '${action}' quarantined for review`;
}

function calculateConfidence(req: EvaluationRequest): number {
  const hasResource = !!req.resource;
  const hasContext = !!req.context && Object.keys(req.context).length > 0;
  if (hasResource && hasContext) return 0.9;
  if (hasResource || hasContext) return 0.7;
  return 0.5;
}

export function createMutationValidators(): MutationValidator[] {
  return [
    {
      id: "atomic-contract-shape",
      validatorClass: "atomic",
      critical: true,
      evaluate: ({ contract }) => {
        const result = validateMutationContract(contract);
        return {
          validatorId: "atomic-contract-shape",
          validatorClass: "atomic",
          passed: result.valid,
          critical: true,
          score: result.valid ? 1 : 0,
          reason: result.valid ? undefined : result.errors.join("; "),
          details: result.valid ? undefined : { errors: result.errors },
        };
      },
    },
    {
      id: "structural-target-alignment",
      validatorClass: "structural",
      critical: true,
      evaluate: ({ contract }) => ({
        validatorId: "structural-target-alignment",
        validatorClass: "structural",
        passed: isTargetAligned(contract),
        critical: true,
        score: isTargetAligned(contract) ? 1 : 0,
        reason: isTargetAligned(contract)
          ? undefined
          : "target.kind does not align with scope.domain/targetPath",
      }),
    },
    {
      id: "behavioral-objective-metrics",
      validatorClass: "behavioral",
      critical: false,
      evaluate: ({ contract }) => {
        const hasDiverseMetrics = new Set(contract.validation.metrics.map((metric) => metric.metric)).size >= 2;
        const passed = Boolean(contract.validation.objective.trim() && hasDiverseMetrics);
        return {
          validatorId: "behavioral-objective-metrics",
          validatorClass: "behavioral",
          passed,
          critical: false,
          score: passed ? 1 : 0.4,
          reason: passed ? undefined : "validation must include a non-empty objective and at least two distinct metrics",
        };
      },
    },
    {
      id: "governance-lifecycle-readiness",
      validatorClass: "governance",
      critical: true,
      evaluate: ({ contract }) => {
        const result = validateLifecycleReadiness(contract);
        return {
          validatorId: "governance-lifecycle-readiness",
          validatorClass: "governance",
          passed: result.valid,
          critical: true,
          score: result.valid ? 1 : 0,
          reason: result.valid ? undefined : result.errors.join("; "),
          details: result.valid ? undefined : { errors: result.errors },
        };
      },
    },
  ];
}

export function evaluateMutationContract(
  contract: MutationContract,
  validators: MutationValidator[] = createMutationValidators(),
): MutationEvaluationResult {
  const orderedValidators = [...validators].sort((left, right) =>
    `${left.validatorClass}:${left.id}`.localeCompare(`${right.validatorClass}:${right.id}`));
  const validatorResults = orderedValidators.map((validator) => validator.evaluate({ contract }));
  const criticalFailures = validatorResults
    .filter((result) => result.critical && !result.passed)
    .map((result) => result.validatorId);
  const aggregateScore = validatorResults.length === 0
    ? 0
    : validatorResults.reduce((sum, result) => sum + result.score, 0) / validatorResults.length;
  const decision = criticalFailures.length === 0 && validatorResults.every((result) => result.passed)
    ? "allow"
    : "reject";

  return {
    decision,
    reproducible: true,
    aggregateScore,
    criticalFailures,
    validatorResults,
  };
}

function isTargetAligned(contract: MutationContract): boolean {
  if (contract.scope.domain === "memory") {
    return contract.target.kind === "graph-node" && contract.scope.targetPath.startsWith("continuum://");
  }
  if (contract.scope.domain === "prompt") {
    return contract.target.kind === "prompt-template" && contract.scope.targetPath.startsWith("prompt://");
  }
  if (contract.scope.domain === "tool") {
    return contract.target.kind === "tool-binding"
      && (contract.scope.targetPath.startsWith("tool://") || contract.scope.targetPath.startsWith("mcp://"));
  }
  return contract.target.kind === "policy-rule"
    && (contract.scope.targetPath.startsWith("policy://") || contract.scope.targetPath.startsWith("qor://policy/"));
}

function validateLifecycleReadiness(contract: MutationContract): MutationContractValidationResult {
  const errors: string[] = [];
  if (contract.status === "approved" && !contract.lifecycle.approvedAt) {
    errors.push("approved mutations must include lifecycle.approvedAt");
  }
  if (contract.status === "committed" && !contract.lifecycle.committedAt) {
    errors.push("committed mutations must include lifecycle.committedAt");
  }
  if (contract.status === "rejected" && !contract.lifecycle.rejectedAt) {
    errors.push("rejected mutations must include lifecycle.rejectedAt");
  }
  if (contract.status === "committed" && !contract.lifecycle.approvedAt) {
    errors.push("committed mutations must preserve prior approval evidence");
  }
  return { valid: errors.length === 0, errors };
}
