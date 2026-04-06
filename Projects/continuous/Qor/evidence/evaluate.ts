import type { EvaluationRequest, EvaluationResponse, Decision, RiskCategory, TrustStage } from "./contract";

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
  if (CREDENTIAL_PATTERNS.some(p => path.includes(p))) return CREDENTIAL_BOOST;
  if (SYSTEM_PATTERNS.some(p => path.startsWith(p))) return SYSTEM_BOOST;
  if (CONFIG_PATTERNS.some(p => path.endsWith(p))) return CONFIG_BOOST;
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
  const t = TRUST_THRESHOLDS[trustStage];
  if (riskScore < t.allowCeiling) return "Allow";
  if (riskScore < t.escalateCeiling) return "Escalate";
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
