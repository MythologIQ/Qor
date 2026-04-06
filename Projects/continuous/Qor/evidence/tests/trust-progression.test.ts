import { describe, it, expect, beforeEach } from "bun:test";
import { resolveTrustStage, getTrustProfile, checkDemotion } from "../trust-progression";
import { appendEvidence } from "../log";
import { existsSync, unlinkSync } from "node:fs";

const LEDGER = "/home/workspace/Projects/continuous/Qor/evidence/ledger.jsonl";
const TEST_AGENT = "test-agent-trust";

function clearLedger() {
  if (existsSync(LEDGER)) unlinkSync(LEDGER);
}

function seedDecisions(count: number, result: "Allow" | "Block" = "Allow", mode: "lite" | "full" = "lite") {
  for (let i = 0; i < count; i++) {
    appendEvidence({
      kind: "PolicyDecision",
      source: "governance-gate/test",
      module: "forge",
      payload: { agentId: TEST_AGENT, action: "task.update", result, evidenceMode: mode, riskScore: 0.2, confidence: 0.7 },
      confidence: 0.7,
      ingestionClass: "decision",
    });
  }
}

describe("resolveTrustStage", () => {
  beforeEach(clearLedger);

  it("defaults to cbt with no decisions", () => {
    expect(resolveTrustStage(TEST_AGENT)).toBe("cbt");
  });

  it("stays cbt with fewer than 10 decisions", () => {
    seedDecisions(5);
    expect(resolveTrustStage(TEST_AGENT)).toBe("cbt");
  });

  it("promotes to kbt with 10+ decisions and 70%+ approval", () => {
    seedDecisions(10);
    expect(resolveTrustStage(TEST_AGENT)).toBe("kbt");
  });

  it("stays cbt if approval rate below 70%", () => {
    seedDecisions(5);
    seedDecisions(5, "Block");
    expect(resolveTrustStage(TEST_AGENT)).toBe("cbt");
  });

  it("promotes to ibt with 50+ decisions, 85%+ approval, 5+ full bundles", () => {
    seedDecisions(45, "Allow", "full");
    seedDecisions(5, "Allow", "lite");
    expect(resolveTrustStage(TEST_AGENT)).toBe("ibt");
  });

  it("stays kbt if not enough full bundles for ibt", () => {
    seedDecisions(50, "Allow", "lite");
    expect(resolveTrustStage(TEST_AGENT)).toBe("kbt");
  });
});

describe("getTrustProfile", () => {
  beforeEach(clearLedger);

  it("returns complete profile for new agent", () => {
    const profile = getTrustProfile(TEST_AGENT);
    expect(profile.agentId).toBe(TEST_AGENT);
    expect(profile.stage).toBe("cbt");
    expect(profile.totalDecisions).toBe(0);
    expect(profile.approvalRate).toBe(0);
  });

  it("returns correct stats for established agent", () => {
    seedDecisions(8);
    seedDecisions(2, "Block");
    const profile = getTrustProfile(TEST_AGENT);
    expect(profile.totalDecisions).toBe(10);
    expect(profile.approvalRate).toBe(0.8);
  });
});

describe("checkDemotion", () => {
  beforeEach(clearLedger);

  it("demotes ibt to kbt on any block", () => {
    seedDecisions(50, "Allow", "full");
    seedDecisions(1, "Block");
    const result = checkDemotion(TEST_AGENT, "ibt");
    expect(result).toBe("kbt");
  });

  it("demotes kbt to cbt on 3 blocks in 10", () => {
    seedDecisions(7);
    seedDecisions(3, "Block");
    const result = checkDemotion(TEST_AGENT, "kbt");
    expect(result).toBe("cbt");
  });

  it("returns null when no demotion needed", () => {
    seedDecisions(10);
    const result = checkDemotion(TEST_AGENT, "kbt");
    expect(result).toBeNull();
  });

  it("returns null for cbt (cannot demote further)", () => {
    seedDecisions(3, "Block");
    const result = checkDemotion(TEST_AGENT, "cbt");
    expect(result).toBeNull();
  });
});
