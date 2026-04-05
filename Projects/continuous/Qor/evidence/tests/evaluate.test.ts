import { describe, it, expect } from "vitest";
import { evaluate, scoreAction } from "../evaluate";
import type { EvaluationRequest } from "../contract";

function req(action: string, resource?: string, trust: "cbt" | "kbt" | "ibt" = "cbt"): EvaluationRequest {
  return { action, agentId: "test", resource, trustStage: trust, context: resource ? { path: resource } : undefined };
}

describe("evaluate — FailSafe-Pro parity", () => {
  it("file.read at CBT → Allow", () => {
    const r = evaluate(req("file.read", "src/main.rs"));
    expect(r.decision).toBe("Allow");
    expect(r.riskScore).toBeLessThan(0.3);
  });

  it("shell.execute at CBT → Block", () => {
    const r = evaluate(req("shell.execute"));
    expect(r.decision).toBe("Block");
    expect(r.riskScore).toBeGreaterThanOrEqual(0.7);
  });

  it("file.write at CBT → Escalate", () => {
    const r = evaluate(req("file.write", "src/lib.rs"));
    expect(r.decision).toBe("Escalate");
  });

  it("file.write at IBT → Allow", () => {
    const r = evaluate(req("file.write", "src/lib.rs", "ibt"));
    expect(r.decision).toBe("Allow");
  });

  it(".env resource → credential boost", () => {
    const r = evaluate(req("file.read", ".env", "ibt"));
    expect(r.riskScore).toBeGreaterThanOrEqual(0.4);
    expect(r.riskCategory).toBe("medium");
  });

  it("/etc/passwd at CBT → Block", () => {
    const r = evaluate(req("file.write", "/etc/passwd"));
    expect(r.decision).toBe("Block");
    expect(r.riskScore).toBeGreaterThanOrEqual(0.6);
  });

  it("auth.modify at IBT → Block (always critical)", () => {
    const r = evaluate(req("auth.modify", undefined, "ibt"));
    expect(r.riskCategory).toBe("critical");
    expect(r.decision).toBe("Block");
  });

  it("confidence reflects available context", () => {
    const full = evaluate(req("file.read", "test.rs"));
    const minimal = evaluate({ action: "file.read", agentId: "test", trustStage: "cbt" });
    expect(full.confidence).toBeGreaterThan(minimal.confidence);
  });

  it("mitigation present on Block", () => {
    const r = evaluate(req("shell.execute"));
    expect(r.mitigation).toBeDefined();
  });

  it("mitigation absent on Allow", () => {
    const r = evaluate(req("file.read", "readme.md", "ibt"));
    expect(r.mitigation).toBeUndefined();
  });

  it("unknown action defaults to 0.5", () => {
    expect(scoreAction("unknown.action")).toBe(0.5);
  });
});
