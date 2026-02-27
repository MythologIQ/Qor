import { describe, expect, it } from "vitest";
import { TrustEngine } from "../runtime/api/TrustEngine";
import { ShadowGenomeManager } from "../runtime/api/ShadowGenomeManager";

describe("TrustEngine", () => {
  it("registers agents with normalized persona and bounded trust updates", async () => {
    const trust = new TrustEngine();

    const unknownPersona = await trust.registerAgent("builder", "pk-builder");
    expect(unknownPersona.did.startsWith("did:myth:builder:")).toBe(true);
    expect(unknownPersona.persona).toBe("scrivener");
    expect(unknownPersona.trustScore).toBe(0.5);

    const sentinel = await trust.registerAgent("sentinel", "pk-sentinel");
    expect(sentinel.persona).toBe("sentinel");

    const boosted = await trust.updateTrust(sentinel.did, "success");
    expect(boosted).toBeGreaterThan(0.5);

    let reduced = boosted;
    for (let i = 0; i < 20; i += 1) {
      reduced = await trust.updateTrust(sentinel.did, "failure");
    }
    expect(reduced).toBeGreaterThanOrEqual(0);

    const unknownDidScore = await trust.updateTrust("did:myth:missing", "success");
    expect(unknownDidScore).toBe(0.5);
  });
});

describe("ShadowGenomeManager", () => {
  it("archives failures and derives constraints/patterns by agent", async () => {
    const manager = new ShadowGenomeManager();

    const entry1 = await manager.archiveFailure({
      verdict: {
        decision: "BLOCK",
        summary: "blocked",
        details: { reason: "unsafe write", eventId: "e1" },
        agentDid: "did:myth:a1",
      },
      inputVector: "vec-1",
      causalVector: { constraint: "avoid unsafe write" },
      decisionRationale: "policy breach",
    });

    const entry2 = await manager.archiveFailure({
      verdict: {
        decision: "QUARANTINE",
        summary: "quarantined",
        details: { reason: "critical violation", eventId: "e2" },
        agentDid: "did:myth:a1",
      },
      inputVector: "vec-2",
      causalVector: { constraint: "avoid critical secret access" },
    });

    expect(entry1.id).toBeDefined();
    expect(entry2.id).toBeDefined();

    const agentEntries = await manager.getEntriesByAgent("did:myth:a1", 10);
    expect(agentEntries).toHaveLength(2);

    const constraints = await manager.getNegativeConstraintsForAgent("did:myth:a1");
    expect(constraints).toContainEqual({ constraint: "avoid unsafe write" });
    expect(constraints).toContainEqual({ constraint: "avoid critical secret access" });

    const patterns = await manager.analyzeFailurePatterns();
    const modes = patterns.map((item) => item.failureMode);
    expect(modes).toContain("SPEC_VIOLATION");
    expect(modes).toContain("TRUST_VIOLATION");

    manager.close();
    const afterClose = await manager.getEntriesByAgent("did:myth:a1", 10);
    expect(afterClose).toHaveLength(0);
  });
});

