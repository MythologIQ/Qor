/**
 * Tests for Thermodynamic Decay and Saturation Boost Functions
 * 
 * Validates:
 * 1. Decay functions use effective lambda derived from saturation
 * 2. Saturated memories can reach zero-decay ground state
 * 3. Access-driven saturation boosts are deterministic and bounded
 */

import { describe, test, expect } from "bun:test";
import {
  ThermodynamicState,
  DecayParameters,
  DEFAULT_DECAY_PARAMS,
  calculateTemperature,
  calculateEffectiveLambda,
  applyThermodynamicDecay,
  applyAccessBoost,
  updateStateOnAccess,
  initializeThermodynamicState,
  isGroundState,
} from "./thermodynamic-decay";

describe("calculateTemperature", () => {
  test("returns max temperature for zero saturation", () => {
    const temp = calculateTemperature(0.0);
    expect(temp).toBe(DEFAULT_DECAY_PARAMS.tempMax);
  });

  test("returns min temperature for full saturation", () => {
    const temp = calculateTemperature(1.0);
    expect(temp).toBe(DEFAULT_DECAY_PARAMS.tempMin);
  });

  test("returns intermediate temperature for partial saturation", () => {
    const temp = calculateTemperature(0.5);
    expect(temp).toBe(0.5);
  });

  test("clamps values outside [0, 1] range", () => {
    expect(calculateTemperature(-0.5)).toBe(DEFAULT_DECAY_PARAMS.tempMax);
    expect(calculateTemperature(1.5)).toBe(DEFAULT_DECAY_PARAMS.tempMin);
  });
});

describe("calculateEffectiveLambda", () => {
  test("returns base lambda for zero saturation", () => {
    const lambda = calculateEffectiveLambda(0.0);
    expect(lambda).toBe(DEFAULT_DECAY_PARAMS.baseLambda);
  });

  test("returns zero lambda for full saturation (ground state)", () => {
    const lambda = calculateEffectiveLambda(1.0);
    expect(lambda).toBe(0.0);
  });

  test("returns intermediate lambda for partial saturation", () => {
    const lambda = calculateEffectiveLambda(0.5);
    expect(lambda).toBeCloseTo(DEFAULT_DECAY_PARAMS.baseLambda * 0.5, 5);
  });

  test("decay rate decreases monotonically with saturation", () => {
    const lambda0 = calculateEffectiveLambda(0.0);
    const lambda25 = calculateEffectiveLambda(0.25);
    const lambda50 = calculateEffectiveLambda(0.50);
    const lambda75 = calculateEffectiveLambda(0.75);
    const lambda100 = calculateEffectiveLambda(1.0);

    expect(lambda0).toBeGreaterThan(lambda25);
    expect(lambda25).toBeGreaterThan(lambda50);
    expect(lambda50).toBeGreaterThan(lambda75);
    expect(lambda75).toBeGreaterThan(lambda100);
  });
});

describe("applyThermodynamicDecay", () => {
  test("fully decays unsaturated memory over time", () => {
    const initialScore = 1.0;
    const saturation = 0.0;
    const oneDay = 24 * 60 * 60 * 1000;

    const score = applyThermodynamicDecay(
      initialScore,
      saturation,
      oneDay
    );

    // With base lambda = 0.693 (ln 2), one day should give ~50% decay
    expect(score).toBeCloseTo(0.5, 1);
  });

  test("does not decay saturated memory (ground state)", () => {
    const initialScore = 1.0;
    const saturation = 1.0;
    const oneDay = 24 * 60 * 60 * 1000;

    const score = applyThermodynamicDecay(
      initialScore,
      saturation,
      oneDay
    );

    // With lambda = 0 at saturation = 1.0, no decay should occur
    expect(score).toBe(1.0);
  });

  test("partially decays moderately saturated memory", () => {
    const initialScore = 1.0;
    const saturation = 0.5;
    const oneDay = 24 * 60 * 60 * 1000;

    const scoreUnsaturated = applyThermodynamicDecay(1.0, 0.0, oneDay);
    const scoreSaturated = applyThermodynamicDecay(1.0, 0.5, oneDay);

    // 50% saturation should decay less than 0% saturation
    expect(scoreSaturated).toBeGreaterThan(scoreUnsaturated);
    // But still some decay should occur
    expect(scoreSaturated).toBeLessThan(1.0);
  });

  test("decay increases with time", () => {
    const initialScore = 1.0;
    const saturation = 0.0;
    
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    const scoreHour = applyThermodynamicDecay(initialScore, saturation, oneHour);
    const scoreDay = applyThermodynamicDecay(initialScore, saturation, oneDay);
    const scoreWeek = applyThermodynamicDecay(initialScore, saturation, oneWeek);

    expect(scoreHour).toBeGreaterThan(scoreDay);
    expect(scoreDay).toBeGreaterThan(scoreWeek);
  });
});

describe("applyAccessBoost", () => {
  test("increases saturation on access", () => {
    const initialSaturation = 0.0;
    const newSaturation = applyAccessBoost(initialSaturation, 1);

    expect(newSaturation).toBeGreaterThan(initialSaturation);
  });

  test("boost is bounded by saturation ceiling", () => {
    const initialSaturation = 0.95;
    const newSaturation = applyAccessBoost(initialSaturation, 100);

    expect(newSaturation).toBeLessThanOrEqual(DEFAULT_DECAY_PARAMS.saturationCeiling);
    expect(newSaturation).toBe(1.0);
  });

  test("multiple accesses increase saturation more than single access", () => {
    const initialSaturation = 0.0;
    const singleAccess = applyAccessBoost(initialSaturation, 1);
    const multipleAccess = applyAccessBoost(initialSaturation, 5);

    expect(multipleAccess).toBeGreaterThan(singleAccess);
  });

  test("boost exhibits diminishing returns", () => {
    let saturation = 0.0;
    
    // Apply 10 individual boosts and track increments
    const increments: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = saturation;
      saturation = applyAccessBoost(saturation, 1);
      increments.push(saturation - before);
    }

    // Each increment should be smaller than the previous
    for (let i = 1; i < increments.length; i++) {
      expect(increments[i]).toBeLessThanOrEqual(increments[i - 1]);
    }
  });

  test("boost is deterministic for same inputs", () => {
    const saturation = 0.3;
    const boost1 = applyAccessBoost(saturation, 3);
    const boost2 = applyAccessBoost(saturation, 3);

    expect(boost1).toBe(boost2);
  });

  test("floor clamp prevents negative saturation", () => {
    const invalidSaturation = -0.5;
    const newSaturation = applyAccessBoost(invalidSaturation, 1);

    expect(newSaturation).toBeGreaterThanOrEqual(DEFAULT_DECAY_PARAMS.saturationFloor);
  });
});

describe("updateStateOnAccess", () => {
  test("increments access count", () => {
    const state = initializeThermodynamicState(0.0);
    const updated = updateStateOnAccess(state);

    expect(updated.accessCount).toBe(state.accessCount + 1);
  });

  test("increases saturation", () => {
    const state = initializeThermodynamicState(0.5);
    const updated = updateStateOnAccess(state);

    expect(updated.saturation).toBeGreaterThan(state.saturation);
  });

  test("decreases temperature (inversely proportional to saturation)", () => {
    const state = initializeThermodynamicState(0.5);
    const updated = updateStateOnAccess(state);

    expect(updated.temperature).toBeLessThan(state.temperature);
  });

  test("decreases effective lambda (decay rate)", () => {
    const state = initializeThermodynamicState(0.5);
    const updated = updateStateOnAccess(state);

    expect(updated.effectiveLambda).toBeLessThan(state.effectiveLambda);
  });

  test("updates lastAccessedAt timestamp", () => {
    const state = initializeThermodynamicState(0.0);
    const beforeTime = Date.now();
    const updated = updateStateOnAccess(state);
    const afterTime = Date.now();

    expect(updated.lastAccessedAt).toBeGreaterThanOrEqual(beforeTime);
    expect(updated.lastAccessedAt).toBeLessThanOrEqual(afterTime);
  });

  test("repeated access can drive memory to ground state", () => {
    let state = initializeThermodynamicState(0.0);
    
    // Apply many accesses
    for (let i = 0; i < 50; i++) {
      state = updateStateOnAccess(state);
    }

    expect(state.saturation).toBe(1.0);
    expect(state.temperature).toBe(0.0);
    expect(state.effectiveLambda).toBe(0.0);
    expect(isGroundState(state)).toBe(true);
  });
});

describe("initializeThermodynamicState", () => {
  test("creates state with specified initial saturation", () => {
    const state = initializeThermodynamicState(0.3);

    expect(state.saturation).toBe(0.3);
  });

  test("defaults to zero saturation if not specified", () => {
    const state = initializeThermodynamicState();

    expect(state.saturation).toBe(0.0);
  });

  test("derives temperature from saturation", () => {
    const state = initializeThermodynamicState(0.4);

    expect(state.temperature).toBe(calculateTemperature(0.4));
  });

  test("derives effective lambda from saturation", () => {
    const state = initializeThermodynamicState(0.6);

    expect(state.effectiveLambda).toBe(calculateEffectiveLambda(0.6));
  });

  test("initializes with zero access count", () => {
    const state = initializeThermodynamicState(0.5);

    expect(state.accessCount).toBe(0);
  });

  test("clamps initial saturation to valid range", () => {
    const stateNegative = initializeThermodynamicState(-0.5);
    const stateExcessive = initializeThermodynamicState(1.5);

    expect(stateNegative.saturation).toBe(0.0);
    expect(stateExcessive.saturation).toBe(1.0);
  });
});

describe("isGroundState", () => {
  test("returns true for fully saturated memory", () => {
    const state = initializeThermodynamicState(1.0);

    expect(isGroundState(state)).toBe(true);
  });

  test("returns false for partially saturated memory", () => {
    const state = initializeThermodynamicState(0.99);

    expect(isGroundState(state)).toBe(false);
  });

  test("returns false for unsaturated memory", () => {
    const state = initializeThermodynamicState(0.0);

    expect(isGroundState(state)).toBe(false);
  });
});

describe("Integration: Self-optimization behavior", () => {
  test("repeated access reduces decay and improves retention", () => {
    // Start with identical memories
    let accessedMemory = initializeThermodynamicState(0.0);
    const unAccessedMemory = initializeThermodynamicState(0.0);

    // Simulate repeated access to one memory
    for (let i = 0; i < 10; i++) {
      accessedMemory = updateStateOnAccess(accessedMemory);
    }

    // After 7 days, check decay
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    const accessedScore = applyThermodynamicDecay(
      1.0,
      accessedMemory.saturation,
      sevenDays
    );
    
    const unAccessedScore = applyThermodynamicDecay(
      1.0,
      unAccessedMemory.saturation,
      sevenDays
    );

    // Accessed memory should retain more score
    expect(accessedScore).toBeGreaterThan(unAccessedScore);
    
    // Accessed memory has higher saturation
    expect(accessedMemory.saturation).toBeGreaterThan(unAccessedMemory.saturation);
    
    // Accessed memory has lower temperature
    expect(accessedMemory.temperature).toBeLessThan(unAccessedMemory.temperature);
    
    // Accessed memory has lower decay rate
    expect(accessedMemory.effectiveLambda).toBeLessThan(unAccessedMemory.effectiveLambda);
  });

  test("ground state memory has zero decay regardless of time", () => {
    let state = initializeThermodynamicState(0.0);
    
    // Drive to ground state
    for (let i = 0; i < 50; i++) {
      state = updateStateOnAccess(state);
    }

    expect(isGroundState(state)).toBe(true);

    // Test decay over extreme time periods
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const score = applyThermodynamicDecay(1.0, state.saturation, oneYear);

    expect(score).toBe(1.0); // No decay
  });

  test("thermodynamic state is queryable and inspectable", () => {
    const state = initializeThermodynamicState(0.7);

    // All properties are accessible
    expect(state.saturation).toBeDefined();
    expect(state.temperature).toBeDefined();
    expect(state.effectiveLambda).toBeDefined();
    expect(state.lastAccessedAt).toBeDefined();
    expect(state.accessCount).toBeDefined();

    // Derived properties are consistent
    expect(state.temperature).toBe(calculateTemperature(state.saturation));
    expect(state.effectiveLambda).toBe(calculateEffectiveLambda(state.saturation));
  });
});
