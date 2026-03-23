import { describe, test, expect } from "bun:test";
import {
  createCocaptureLink,
  validateSessionBoundary,
  calculatePeerPinningWeight,
  applyPeerPinning,
  applyCrossReferencePinning,
  discoverTransitivePeers,
  inspectPeerPinningParams,
  DEFAULT_PEER_PINNING_PARAMS,
  type CocaptureLink,
  type SessionBoundary,
} from "./cocapture-linking";

describe("cocapture-linking", () => {
  describe("createCocaptureLink", () => {
    test("creates a valid co-capture link with default strength", () => {
      const link = createCocaptureLink("mem1", "mem2", "session1");
      
      expect(link.sourceMemoryId).toBe("mem1");
      expect(link.targetMemoryId).toBe("mem2");
      expect(link.sessionId).toBe("session1");
      expect(link.linkStrength).toBe(1.0);
      expect(link.createdAt).toBeGreaterThan(0);
    });

    test("creates a link with custom strength", () => {
      const link = createCocaptureLink("mem1", "mem2", "session1", 0.7);
      
      expect(link.linkStrength).toBe(0.7);
    });

    test("rejects link strength below 0", () => {
      expect(() => createCocaptureLink("mem1", "mem2", "session1", -0.1)).toThrow();
    });

    test("rejects link strength above 1", () => {
      expect(() => createCocaptureLink("mem1", "mem2", "session1", 1.1)).toThrow();
    });
  });

  describe("validateSessionBoundary", () => {
    test("validates link belonging to session", () => {
      const link = createCocaptureLink("mem1", "mem2", "session1");
      const session: SessionBoundary = {
        sessionId: "session1",
        startedAt: Date.now() - 1000,
        endedAt: null,
      };
      
      expect(validateSessionBoundary(link, session)).toBe(true);
    });

    test("rejects link from different session", () => {
      const link = createCocaptureLink("mem1", "mem2", "session1");
      const session: SessionBoundary = {
        sessionId: "session2",
        startedAt: Date.now() - 1000,
        endedAt: null,
      };
      
      expect(validateSessionBoundary(link, session)).toBe(false);
    });
  });

  describe("calculatePeerPinningWeight", () => {
    test("returns full weight at hop distance 0", () => {
      const weight = calculatePeerPinningWeight(1.0, 0);
      
      expect(weight).toBe(DEFAULT_PEER_PINNING_PARAMS.cocaptureBaseWeight);
    });

    test("applies distance decay at hop distance 1", () => {
      const weight = calculatePeerPinningWeight(1.0, 1);
      const expected =
        DEFAULT_PEER_PINNING_PARAMS.cocaptureBaseWeight *
        DEFAULT_PEER_PINNING_PARAMS.strengthDecayPerHop;
      
      expect(weight).toBeCloseTo(expected, 6);
    });

    test("applies distance decay at hop distance 2", () => {
      const weight = calculatePeerPinningWeight(1.0, 2);
      const expected =
        DEFAULT_PEER_PINNING_PARAMS.cocaptureBaseWeight *
        Math.pow(DEFAULT_PEER_PINNING_PARAMS.strengthDecayPerHop, 2);
      
      expect(weight).toBeCloseTo(expected, 6);
    });

    test("returns 0 beyond max peer distance", () => {
      const weight = calculatePeerPinningWeight(
        1.0,
        DEFAULT_PEER_PINNING_PARAMS.maxPeerDistance + 1
      );
      
      expect(weight).toBe(0);
    });

    test("scales weight by link strength", () => {
      const weight = calculatePeerPinningWeight(0.5, 0);
      const expected = DEFAULT_PEER_PINNING_PARAMS.cocaptureBaseWeight * 0.5;
      
      expect(weight).toBeCloseTo(expected, 6);
    });
  });

  describe("applyPeerPinning", () => {
    test("increases saturation from single peer link", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      const saturation = applyPeerPinning(0.5, [link]);
      
      expect(saturation).toBeGreaterThan(0.5);
    });

    test("increases saturation from multiple peer links", () => {
      const links = [
        createCocaptureLink("mem2", "mem1", "session1"),
        createCocaptureLink("mem3", "mem1", "session1"),
      ];
      const saturation = applyPeerPinning(0.5, links);
      
      expect(saturation).toBeGreaterThan(0.5);
    });

    test("respects ceiling constraint", () => {
      const links = Array.from({ length: 100 }, (_, i) =>
        createCocaptureLink(`mem${i}`, "mem1", "session1")
      );
      const saturation = applyPeerPinning(0.0, links);
      
      expect(saturation).toBeLessThanOrEqual(1.0);
    });

    test("has no effect on already-saturated memory", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      const saturation = applyPeerPinning(1.0, [link]);
      
      expect(saturation).toBe(1.0);
    });

    test("diminishes effectiveness as saturation increases", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      const boost1 = applyPeerPinning(0.2, [link]) - 0.2;
      const boost2 = applyPeerPinning(0.8, [link]) - 0.8;
      
      expect(boost1).toBeGreaterThan(boost2);
    });

    test("rejects saturation below 0", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      expect(() => applyPeerPinning(-0.1, [link])).toThrow();
    });

    test("rejects saturation above ceiling", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      expect(() => applyPeerPinning(1.1, [link])).toThrow();
    });
  });

  describe("applyCrossReferencePinning", () => {
    test("increases saturation from single cross-reference", () => {
      const saturation = applyCrossReferencePinning(0.5, 1);
      
      expect(saturation).toBeGreaterThan(0.5);
    });

    test("cross-reference weight is stronger than co-capture", () => {
      const crossRefBoost = applyCrossReferencePinning(0.5, 1) - 0.5;
      const link = createCocaptureLink("mem2", "mem1", "session1");
      const cocaptureBoost = applyPeerPinning(0.5, [link]) - 0.5;
      
      expect(crossRefBoost).toBeGreaterThan(cocaptureBoost);
    });

    test("increases saturation from multiple cross-references", () => {
      const saturation = applyCrossReferencePinning(0.5, 3);
      
      expect(saturation).toBeGreaterThan(0.5);
    });

    test("respects ceiling constraint", () => {
      const saturation = applyCrossReferencePinning(0.0, 100);
      
      expect(saturation).toBeLessThanOrEqual(1.0);
    });

    test("has no effect on already-saturated memory", () => {
      const saturation = applyCrossReferencePinning(1.0, 5);
      
      expect(saturation).toBe(1.0);
    });
  });

  describe("discoverTransitivePeers", () => {
    test("finds direct peers at hop distance 1", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1"),
        createCocaptureLink("mem1", "mem3", "session1"),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      expect(peers).toHaveLength(2);
      expect(peers.map((p) => p.memoryId).sort()).toEqual(["mem2", "mem3"]);
      expect(peers.every((p) => p.hopDistance === 1)).toBe(true);
    });

    test("finds transitive peers at hop distance 2", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1"),
        createCocaptureLink("mem2", "mem3", "session1"),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      expect(peers).toHaveLength(2);
      const mem3 = peers.find((p) => p.memoryId === "mem3");
      expect(mem3?.hopDistance).toBe(2);
    });

    test("respects max peer distance", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1"),
        createCocaptureLink("mem2", "mem3", "session1"),
        createCocaptureLink("mem3", "mem4", "session1"),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      // With maxPeerDistance=2, should find mem2 (hop 1) and mem3 (hop 2), but not mem4 (hop 3)
      expect(peers).toHaveLength(2);
      expect(peers.map((p) => p.memoryId).sort()).toEqual(["mem2", "mem3"]);
    });

    test("handles bidirectional links correctly", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1"),
        createCocaptureLink("mem2", "mem1", "session1"),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      // Should find mem2 only once despite bidirectional link
      expect(peers).toHaveLength(1);
      expect(peers[0].memoryId).toBe("mem2");
    });

    test("handles complex graph with multiple paths", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1"),
        createCocaptureLink("mem1", "mem3", "session1"),
        createCocaptureLink("mem2", "mem4", "session1"),
        createCocaptureLink("mem3", "mem4", "session1"),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      // Should find mem2, mem3 (hop 1) and mem4 (hop 2)
      expect(peers).toHaveLength(3);
      expect(peers.map((p) => p.memoryId).sort()).toEqual(["mem2", "mem3", "mem4"]);
    });

    test("preserves link strength in transitive discovery", () => {
      const links: CocaptureLink[] = [
        createCocaptureLink("mem1", "mem2", "session1", 0.8),
      ];
      
      const peers = discoverTransitivePeers("mem1", links);
      
      expect(peers[0].linkStrength).toBe(0.8);
    });
  });

  describe("inspectPeerPinningParams", () => {
    test("returns default params when none provided", () => {
      const params = inspectPeerPinningParams();
      
      expect(params.crossReferenceWeight).toBe(0.10);
      expect(params.cocaptureBaseWeight).toBe(0.08);
      expect(params.maxPeerDistance).toBe(2);
      expect(params.strengthDecayPerHop).toBe(0.6);
    });

    test("returns custom params when provided", () => {
      const custom = {
        crossReferenceWeight: 0.15,
        cocaptureBaseWeight: 0.12,
        maxPeerDistance: 3,
        strengthDecayPerHop: 0.7,
      };
      
      const params = inspectPeerPinningParams(custom);
      
      expect(params).toEqual(custom);
    });

    test("returns copy not reference", () => {
      const params1 = inspectPeerPinningParams();
      const params2 = inspectPeerPinningParams();
      
      expect(params1).not.toBe(params2);
      expect(params1).toEqual(params2);
    });
  });

  describe("Acceptance Criteria", () => {
    test("AC1: New session memories create associative links to valid peers", () => {
      // Simulate same-session capture
      const sessionId = "session-123";
      const links = [
        createCocaptureLink("mem1", "mem2", sessionId),
        createCocaptureLink("mem1", "mem3", sessionId),
        createCocaptureLink("mem2", "mem3", sessionId),
      ];
      
      // Verify all links belong to same session
      const session: SessionBoundary = {
        sessionId,
        startedAt: Date.now() - 1000,
        endedAt: null,
      };
      
      const allValid = links.every((link) => validateSessionBoundary(link, session));
      expect(allValid).toBe(true);
      
      // Verify peers are discoverable
      const peers = discoverTransitivePeers("mem1", links);
      expect(peers.length).toBeGreaterThan(0);
    });

    test("AC2: Cross-reference pinning affects linked memories deterministically", () => {
      const link = createCocaptureLink("mem2", "mem1", "session1");
      
      // First application
      const saturation1 = applyPeerPinning(0.5, [link]);
      
      // Second application with same inputs
      const saturation2 = applyPeerPinning(0.5, [link]);
      
      // Results must be identical (deterministic)
      expect(saturation1).toBe(saturation2);
      
      // Cross-reference pinning also deterministic
      const crossRef1 = applyCrossReferencePinning(0.5, 2);
      const crossRef2 = applyCrossReferencePinning(0.5, 2);
      expect(crossRef1).toBe(crossRef2);
    });

    test("AC3: Session boundaries remain explicit so unrelated runs do not smear together", () => {
      const session1Links = [
        createCocaptureLink("mem1", "mem2", "session1"),
      ];
      const session2Links = [
        createCocaptureLink("mem3", "mem4", "session2"),
      ];
      
      const session1: SessionBoundary = {
        sessionId: "session1",
        startedAt: Date.now() - 2000,
        endedAt: Date.now() - 1000,
      };
      const session2: SessionBoundary = {
        sessionId: "session2",
        startedAt: Date.now() - 500,
        endedAt: null,
      };
      
      // Session 1 links should not validate for session 2
      expect(validateSessionBoundary(session1Links[0], session2)).toBe(false);
      
      // Session 2 links should not validate for session 1
      expect(validateSessionBoundary(session2Links[0], session1)).toBe(false);
      
      // Transitive discovery should not cross session boundaries
      const allLinks = [...session1Links, ...session2Links];
      const peers = discoverTransitivePeers("mem1", allLinks);
      
      // Should only find mem2 (same session), not mem3 or mem4 (different session)
      expect(peers).toHaveLength(1);
      expect(peers[0].memoryId).toBe("mem2");
    });
  });
});
