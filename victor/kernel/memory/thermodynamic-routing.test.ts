import { describe, test, expect } from "bun:test";
import {
  routeByThermodynamicState,
  routeByState,
  routeByScore,
  routeHybrid,
  canCrystallize,
  getThresholdForTier,
  DEFAULT_THERMODYNAMIC_THRESHOLDS,
  type MemoryTier,
  type ThermodynamicRoutingThresholds,
} from "./thermodynamic-routing";
import { initializeThermodynamicState } from "./thermodynamic-decay";

describe("routeByThermodynamicState", () => {
  test("routes low saturation to ephemeral tier", () => {
    expect(routeByThermodynamicState(0.0)).toBe("ephemeral");
    expect(routeByThermodynamicState(0.3)).toBe("ephemeral");
    expect(routeByThermodynamicState(0.59)).toBe("ephemeral");
  });

  test("routes medium saturation to durable tier", () => {
    expect(routeByThermodynamicState(0.60)).toBe("durable");
    expect(routeByThermodynamicState(0.75)).toBe("durable");
    expect(routeByThermodynamicState(0.94)).toBe("durable");
  });

  test("routes high saturation to crystallized tier", () => {
    expect(routeByThermodynamicState(0.95)).toBe("crystallized");
    expect(routeByThermodynamicState(0.98)).toBe("crystallized");
    expect(routeByThermodynamicState(1.0)).toBe("crystallized");
  });

  test("clamps saturation to valid range", () => {
    expect(routeByThermodynamicState(-0.5)).toBe("ephemeral");
    expect(routeByThermodynamicState(1.5)).toBe("crystallized");
  });

  test("uses custom thresholds when provided", () => {
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.90,
      durableThreshold: 0.50,
      ephemeralCeiling: 0.50,
    };

    expect(routeByThermodynamicState(0.49, customThresholds)).toBe("ephemeral");
    expect(routeByThermodynamicState(0.50, customThresholds)).toBe("durable");
    expect(routeByThermodynamicState(0.89, customThresholds)).toBe("durable");
    expect(routeByThermodynamicState(0.90, customThresholds)).toBe("crystallized");
  });

  test("routing is deterministic", () => {
    const saturation = 0.75;
    const tier1 = routeByThermodynamicState(saturation);
    const tier2 = routeByThermodynamicState(saturation);
    expect(tier1).toBe(tier2);
  });
});

describe("routeByState", () => {
  test("extracts saturation from thermodynamic state", () => {
    const state1 = initializeThermodynamicState(0.95);
    expect(routeByState(state1)).toBe("crystallized");

    const state2 = initializeThermodynamicState(0.75);
    expect(routeByState(state2)).toBe("durable");

    const state3 = initializeThermodynamicState(0.25);
    expect(routeByState(state3)).toBe("ephemeral");
  });

  test("uses custom thresholds with state", () => {
    const state = initializeThermodynamicState(0.85);
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.80,
      durableThreshold: 0.40,
      ephemeralCeiling: 0.40,
    };

    expect(routeByState(state, customThresholds)).toBe("crystallized");
  });
});

describe("routeByScore", () => {
  test("routes low score to ephemeral tier", () => {
    expect(routeByScore(0.0)).toBe("ephemeral");
    expect(routeByScore(0.3)).toBe("ephemeral");
    expect(routeByScore(0.59)).toBe("ephemeral");
  });

  test("routes medium score to durable tier", () => {
    expect(routeByScore(0.60)).toBe("durable");
    expect(routeByScore(0.75)).toBe("durable");
    expect(routeByScore(0.94)).toBe("durable");
  });

  test("routes high score to crystallized tier", () => {
    expect(routeByScore(0.95)).toBe("crystallized");
    expect(routeByScore(0.98)).toBe("crystallized");
    expect(routeByScore(1.0)).toBe("crystallized");
  });

  test("clamps score to valid range", () => {
    expect(routeByScore(-0.5)).toBe("ephemeral");
    expect(routeByScore(1.5)).toBe("crystallized");
  });

  test("legacy score thresholds align with thermodynamic defaults", () => {
    // Score-based and saturation-based should produce same tier for same value
    expect(routeByScore(0.95)).toBe(routeByThermodynamicState(0.95));
    expect(routeByScore(0.75)).toBe(routeByThermodynamicState(0.75));
    expect(routeByScore(0.30)).toBe(routeByThermodynamicState(0.30));
  });
});

describe("routeHybrid", () => {
  test("prefers thermodynamic routing when saturation is available", () => {
    const saturation = 0.95;
    const score = 0.30; // Intentionally low to test preference
    const tier = routeHybrid(saturation, score);

    // Should use saturation (0.95) → crystallized, not score (0.30) → ephemeral
    expect(tier).toBe("crystallized");
  });

  test("falls back to score-based routing when saturation is undefined", () => {
    const tier = routeHybrid(undefined, 0.75);
    expect(tier).toBe("durable");
  });

  test("falls back to score-based routing when saturation is null", () => {
    const tier = routeHybrid(null as any, 0.98);
    expect(tier).toBe("crystallized");
  });

  test("handles custom thresholds with thermodynamic routing", () => {
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.85,
      durableThreshold: 0.45,
      ephemeralCeiling: 0.45,
    };

    const tier = routeHybrid(0.90, 0.30, customThresholds);
    expect(tier).toBe("crystallized");
  });

  test("hybrid routing is backwards compatible", () => {
    // Legacy usage (no saturation) should still work
    const tier1 = routeHybrid(undefined, 0.70);
    expect(tier1).toBe("durable");

    // New usage (with saturation) should use thermodynamic
    const tier2 = routeHybrid(0.70, 0.30);
    expect(tier2).toBe("durable");
  });
});

describe("canCrystallize", () => {
  test("returns true for saturation at crystallization threshold", () => {
    expect(canCrystallize(0.95)).toBe(true);
  });

  test("returns true for saturation above crystallization threshold", () => {
    expect(canCrystallize(0.98)).toBe(true);
    expect(canCrystallize(1.0)).toBe(true);
  });

  test("returns false for saturation below crystallization threshold", () => {
    expect(canCrystallize(0.94)).toBe(false);
    expect(canCrystallize(0.75)).toBe(false);
    expect(canCrystallize(0.0)).toBe(false);
  });

  test("uses custom crystallization threshold", () => {
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.80,
      durableThreshold: 0.40,
      ephemeralCeiling: 0.40,
    };

    expect(canCrystallize(0.79, customThresholds)).toBe(false);
    expect(canCrystallize(0.80, customThresholds)).toBe(true);
    expect(canCrystallize(0.85, customThresholds)).toBe(true);
  });
});

describe("getThresholdForTier", () => {
  test("returns crystallization threshold for crystallized tier", () => {
    expect(getThresholdForTier("crystallized")).toBe(0.95);
  });

  test("returns durable threshold for durable tier", () => {
    expect(getThresholdForTier("durable")).toBe(0.60);
  });

  test("returns zero threshold for ephemeral tier", () => {
    expect(getThresholdForTier("ephemeral")).toBe(0.0);
  });

  test("uses custom thresholds", () => {
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.85,
      durableThreshold: 0.50,
      ephemeralCeiling: 0.50,
    };

    expect(getThresholdForTier("crystallized", customThresholds)).toBe(0.85);
    expect(getThresholdForTier("durable", customThresholds)).toBe(0.50);
    expect(getThresholdForTier("ephemeral", customThresholds)).toBe(0.0);
  });
});

describe("Acceptance Criteria: Tier routing can promote highly saturated memory to crystallized storage", () => {
  test("highly saturated memory (>= 0.95) routes to crystallized tier", () => {
    const state = initializeThermodynamicState(0.95);
    const tier = routeByState(state);
    expect(tier).toBe("crystallized");
  });

  test("ground state memory (saturation = 1.0) routes to crystallized tier", () => {
    const state = initializeThermodynamicState(1.0);
    const tier = routeByState(state);
    expect(tier).toBe("crystallized");
  });

  test("saturation progression moves memory through tiers", () => {
    // Low saturation → ephemeral
    const state1 = initializeThermodynamicState(0.30);
    expect(routeByState(state1)).toBe("ephemeral");

    // Medium saturation → durable
    const state2 = initializeThermodynamicState(0.75);
    expect(routeByState(state2)).toBe("durable");

    // High saturation → crystallized
    const state3 = initializeThermodynamicState(0.95);
    expect(routeByState(state3)).toBe("crystallized");
  });
});

describe("Acceptance Criteria: Thermodynamic thresholds are explicit and inspectable", () => {
  test("default thresholds are exported and documented", () => {
    expect(DEFAULT_THERMODYNAMIC_THRESHOLDS).toBeDefined();
    expect(DEFAULT_THERMODYNAMIC_THRESHOLDS.crystallizationThreshold).toBe(0.95);
    expect(DEFAULT_THERMODYNAMIC_THRESHOLDS.durableThreshold).toBe(0.60);
    expect(DEFAULT_THERMODYNAMIC_THRESHOLDS.ephemeralCeiling).toBe(0.60);
  });

  test("thresholds are inspectable via getThresholdForTier", () => {
    const crystallizedThreshold = getThresholdForTier("crystallized");
    const durableThreshold = getThresholdForTier("durable");
    const ephemeralThreshold = getThresholdForTier("ephemeral");

    expect(typeof crystallizedThreshold).toBe("number");
    expect(typeof durableThreshold).toBe("number");
    expect(typeof ephemeralThreshold).toBe("number");

    expect(crystallizedThreshold).toBeGreaterThan(durableThreshold);
    expect(durableThreshold).toBeGreaterThanOrEqual(ephemeralThreshold);
  });

  test("custom thresholds can be provided and inspected", () => {
    const customThresholds: ThermodynamicRoutingThresholds = {
      crystallizationThreshold: 0.92,
      durableThreshold: 0.55,
      ephemeralCeiling: 0.55,
    };

    expect(routeByThermodynamicState(0.92, customThresholds)).toBe("crystallized");
    expect(routeByThermodynamicState(0.55, customThresholds)).toBe("durable");
    expect(getThresholdForTier("crystallized", customThresholds)).toBe(0.92);
  });
});

describe("Acceptance Criteria: Routing remains compatible with existing score-based heuristics during transition", () => {
  test("routeByScore maintains legacy behavior", () => {
    // Legacy callers using score-only routing should continue to work
    expect(routeByScore(0.98)).toBe("crystallized");
    expect(routeByScore(0.75)).toBe("durable");
    expect(routeByScore(0.30)).toBe("ephemeral");
  });

  test("hybrid routing supports gradual migration", () => {
    // Old code (no saturation) → uses score
    const legacyTier = routeHybrid(undefined, 0.70);
    expect(legacyTier).toBe("durable");

    // New code (with saturation) → uses thermodynamic
    const modernTier = routeHybrid(0.95, 0.30);
    expect(modernTier).toBe("crystallized");
  });

  test("score and saturation thresholds are aligned", () => {
    // Same value should produce same tier regardless of routing method
    const testValues = [0.30, 0.60, 0.75, 0.95, 1.0];

    for (const value of testValues) {
      const scoreTier = routeByScore(value);
      const saturationTier = routeByThermodynamicState(value);
      expect(scoreTier).toBe(saturationTier);
    }
  });

  test("hybrid routing is backwards compatible with null/undefined saturation", () => {
    // Should not crash or produce unexpected results
    expect(routeHybrid(undefined, 0.85)).toBe("durable");
    expect(routeHybrid(null as any, 0.97)).toBe("crystallized");
  });
});
