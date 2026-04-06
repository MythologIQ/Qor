import type { TrustStage } from "./contract";
import { readEvidence } from "./log";
import { appendEvidence } from "./log";

export interface TrustProfile {
  agentId: string;
  stage: TrustStage;
  totalDecisions: number;
  approvalRate: number;
  recentBlocks: number;
  demotions: number;
  lastEvaluatedAt: string;
}

const CBT_MIN_DECISIONS = 0;
const KBT_MIN_DECISIONS = 10;
const KBT_MIN_APPROVAL = 0.7;
const KBT_MAX_RECENT_BLOCKS = 0;
const KBT_RECENT_WINDOW = 5;
const IBT_MIN_DECISIONS = 50;
const IBT_MIN_APPROVAL = 0.85;
const IBT_MAX_RECENT_BLOCKS = 0;
const IBT_RECENT_WINDOW = 20;
const IBT_MIN_FULL_BUNDLES = 5;
const DEMOTION_KBT_BLOCK_THRESHOLD = 3;
const DEMOTION_KBT_BLOCK_WINDOW = 10;

function getAgentDecisions(agentId: string) {
  const all = readEvidence({ kind: "PolicyDecision" });
  return all.filter(e => {
    const p = e.payload as Record<string, unknown>;
    return p.agentId === agentId;
  });
}

function countResult(decisions: { payload: Record<string, unknown> }[], result: string): number {
  return decisions.filter(d => d.payload.result === result).length;
}

function countFullBundles(decisions: { payload: Record<string, unknown> }[]): number {
  return decisions.filter(d => d.payload.evidenceMode === "full").length;
}

function recentBlockCount(decisions: { payload: Record<string, unknown> }[], window: number): number {
  const recent = decisions.slice(-window);
  return countResult(recent, "Block");
}

export function resolveTrustStage(agentId: string): TrustStage {
  const decisions = getAgentDecisions(agentId);
  const total = decisions.length;
  if (total < KBT_MIN_DECISIONS) return "cbt";

  const allowed = countResult(decisions, "Allow");
  const approvalRate = total > 0 ? allowed / total : 0;

  if (total >= IBT_MIN_DECISIONS
    && approvalRate >= IBT_MIN_APPROVAL
    && recentBlockCount(decisions, IBT_RECENT_WINDOW) <= IBT_MAX_RECENT_BLOCKS
    && countFullBundles(decisions) >= IBT_MIN_FULL_BUNDLES) {
    return "ibt";
  }

  if (approvalRate >= KBT_MIN_APPROVAL
    && recentBlockCount(decisions, KBT_RECENT_WINDOW) <= KBT_MAX_RECENT_BLOCKS) {
    return "kbt";
  }

  return "cbt";
}

export function getTrustProfile(agentId: string): TrustProfile {
  const decisions = getAgentDecisions(agentId);
  const total = decisions.length;
  const allowed = countResult(decisions, "Allow");
  const approvalRate = total > 0 ? allowed / total : 0;
  const demotionEntries = readEvidence({ kind: "PolicyDecision" }).filter(e => {
    const p = e.payload as Record<string, unknown>;
    return p.agentId === agentId && p.action === "trust.demotion";
  });

  return {
    agentId,
    stage: resolveTrustStage(agentId),
    totalDecisions: total,
    approvalRate: Math.round(approvalRate * 100) / 100,
    recentBlocks: recentBlockCount(decisions, KBT_RECENT_WINDOW),
    demotions: demotionEntries.length,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

export function checkDemotion(
  agentId: string,
  currentStage: TrustStage,
): TrustStage | null {
  const decisions = getAgentDecisions(agentId);

  if (currentStage === "ibt") {
    if (recentBlockCount(decisions, 1) > 0) {
      recordDemotion(agentId, "ibt", "kbt", "Block event while at ibt");
      return "kbt";
    }
  }

  if (currentStage === "kbt") {
    if (recentBlockCount(decisions, DEMOTION_KBT_BLOCK_WINDOW) >= DEMOTION_KBT_BLOCK_THRESHOLD) {
      recordDemotion(agentId, "kbt", "cbt", `${DEMOTION_KBT_BLOCK_THRESHOLD} blocks in last ${DEMOTION_KBT_BLOCK_WINDOW}`);
      return "cbt";
    }
  }

  return null;
}

function recordDemotion(agentId: string, from: TrustStage, to: TrustStage, reason: string): void {
  appendEvidence({
    kind: "PolicyDecision",
    source: "trust-progression",
    module: "qor",
    payload: {
      agentId,
      action: "trust.demotion",
      from,
      to,
      reason,
    },
    confidence: 1.0,
    ingestionClass: "decision",
  });
}
