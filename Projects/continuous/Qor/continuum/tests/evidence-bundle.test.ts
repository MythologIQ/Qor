import { describe, it, expect } from "bun:test";
import { materializeEvidenceBundle } from "../src/service/evidence-bundle";

describe("materializeEvidenceBundle", () => {
  it("returns bundle with averaged confidence", () => {
    const bundle = materializeEvidenceBundle({
      sessionId: "s1",
      intentId: "i1",
      entries: [
        { kind: "TestResult", confidence: 1, source: "test" },
        { kind: "CodeDelta", confidence: 0.5, source: "code" },
      ],
    });
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.confidence).toBe(0.75);
  });

  it("reports missing tests when policy requires them", () => {
    const bundle = materializeEvidenceBundle({
      sessionId: "s1",
      intentId: "i1",
      entries: [{ kind: "CodeDelta", confidence: 1, source: "code" }],
      policy: { requireTests: true },
    });
    expect(bundle.completeness.missing).toContain("tests");
  });
});
