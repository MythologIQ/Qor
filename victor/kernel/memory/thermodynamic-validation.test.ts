/**
 * Governed Validation Tests for Thermodynamic Self-Optimization
 * 
 * Purpose: Substantiate thermodynamic decay foundation with explicit acceptance criteria verification.
 * Phase: Phase 10 - Thermodynamic Decay Foundation
 * Task: task_victor_thermodynamic_validation
 * 
 * Acceptance Criteria (from phases.json):
 * 1. Saturated memories achieve zero-decay ground state
 * 2. Access-driven saturation strengthens retention
 * 3. Self-optimization behavior is deterministic and governed
 */

import { describe, test, expect } from "bun:test";
import {
  calculateTemperature,
  calculateEffectiveLambda,
  applyThermodynamicDecay,
  applyAccessBoost,
  updateStateOnAccess,
  initializeThermodynamicState,
  isGroundState,
  type ThermodynamicState,
} from "./thermodynamic-decay";

describe("Acceptance Criterion 1: Saturated memories achieve zero-decay ground state", () => {
  test("fully saturated memory has zero effective lambda", () => {
    const saturation = 1.0;
    const effectiveLambda = calculateEffectiveLambda(saturation);
    expect(effectiveLambda).toBe(0);
  });

  test("ground state memory has zero temperature", () => {
    const saturation = 1.0;
    const temperature = calculateTemperature(saturation);
    expect(temperature).toBe(0);
  });

  test("ground state detection works correctly", () => {
    const groundState = initializeThermodynamicState(1.0);
    expect(isGroundState(groundState)).toBe(true);
  });

  test("ground state memory does not decay over any time period", () => {
    const initialScore = 1.0;
    const saturation = 1.0;
    
    // Test decay over 1 year
    const oneYearSeconds = 365 * 24 * 60 * 60;
    const decayedScore = applyThermodynamicDecay(initialScore, saturation, oneYearSeconds);
    
    expect(decayedScore).toBe(initialScore);
  });

  test("memory at ground state is stable and permanent", () => {
    let state = initializeThermodynamicState(1.0);
    
    // Verify permanence: multiple time advances do not degrade
    const initialScore = 1.0;
    const day1 = applyThermodynamicDecay(initialScore, state.saturation, 86400);
    const day7 = applyThermodynamicDecay(day1, state.saturation, 86400 * 6);
    const day30 = applyThermodynamicDecay(day7, state.saturation, 86400 * 23);
    
    expect(day30).toBe(initialScore);
    expect(isGroundState(state)).toBe(true);
  });
});

describe("Acceptance Criterion 2: Access-driven saturation strengthens retention", () => {
  test("single access increases saturation from zero baseline", () => {
    const initialSaturation = 0.0;
    const boostedSaturation = applyAccessBoost(initialSaturation, 1);
    
    expect(boostedSaturation).toBeGreaterThan(initialSaturation);
  });

  test("repeated access monotonically increases saturation", () => {
    let saturation = 0.0;
    let previousSaturation = saturation;
    
    for (let i = 1; i <= 10; i++) {
      saturation = applyAccessBoost(saturation, i);
      // Once at ceiling, saturation won't increase further
      if (saturation < 1.0) {
        expect(saturation).toBeGreaterThan(previousSaturation);
      } else {
        expect(saturation).toBe(1.0);
      }
      previousSaturation = saturation;
    }
  });

  test("higher saturation reduces decay rate", () => {
    const lowSaturation = 0.1;
    const highSaturation = 0.8;
    const initialScore = 1.0;
    const timeSeconds = 86400; // 1 day
    
    const lowDecayed = applyThermodynamicDecay(initialScore, lowSaturation, timeSeconds);
    const highDecayed = applyThermodynamicDecay(initialScore, highSaturation, timeSeconds);
    
    // Higher saturation = less decay = higher retained score
    expect(highDecayed).toBeGreaterThan(lowDecayed);
  });

  test("access strengthening is bounded and cannot exceed ceiling", () => {
    const ceiling = 1.0;
    let saturation = 0.0;
    
    // Apply 100 accesses
    for (let i = 1; i <= 100; i++) {
      saturation = applyAccessBoost(saturation, i);
    }
    
    expect(saturation).toBeLessThanOrEqual(ceiling);
    expect(saturation).toBeCloseTo(ceiling, 5);
  });

  test("access strengthening impacts effective lambda predictably", () => {
    const noAccessLambda = calculateEffectiveLambda(0.0);
    const partialAccessSaturation = applyAccessBoost(0.0, 10);
    const partialAccessLambda = calculateEffectiveLambda(partialAccessSaturation);
    const fullAccessLambda = calculateEffectiveLambda(1.0);
    
    expect(partialAccessLambda).toBeLessThan(noAccessLambda);
    expect(partialAccessLambda).toBeGreaterThan(fullAccessLambda);
    expect(fullAccessLambda).toBe(0);
  });
});

describe("Acceptance Criterion 3: Self-optimization behavior is deterministic and governed", () => {
  test("thermodynamic state transitions are deterministic", () => {
    const state1 = initializeThermodynamicState(0.5);
    const state2 = initializeThermodynamicState(0.5);
    
    expect(state1.saturation).toBe(state2.saturation);
    expect(state1.temperature).toBe(state2.temperature);
    expect(state1.effectiveLambda).toBe(state2.effectiveLambda);
  });

  test("identical access sequences produce identical saturation", () => {
    let saturation1 = 0.0;
    let saturation2 = 0.0;
    
    for (let i = 1; i <= 20; i++) {
      saturation1 = applyAccessBoost(saturation1, i);
      saturation2 = applyAccessBoost(saturation2, i);
    }
    
    expect(saturation1).toBe(saturation2);
  });

  test("self-optimization preserves governance visibility", () => {
    const state = initializeThermodynamicState(0.3);
    
    // All thermodynamic state components are inspectable
    expect(state.saturation).toBeDefined();
    expect(state.temperature).toBeDefined();
    expect(state.effectiveLambda).toBeDefined();
    expect(state.accessCount).toBeDefined();
    expect(state.lastAccessedAt).toBeDefined();
  });

  test("updateStateOnAccess is idempotent for same timestamp", () => {
    const initialState = initializeThermodynamicState(0.5);
    const timestamp = Date.now();
    
    const updated1 = updateStateOnAccess(initialState, timestamp);
    const updated2 = updateStateOnAccess(initialState, timestamp);
    
    expect(updated1.saturation).toBe(updated2.saturation);
    expect(updated1.accessCount).toBe(updated2.accessCount);
  });

  test("complete self-optimization cycle is auditable", () => {
    // Start with cold memory
    const initialState = initializeThermodynamicState(0.0);
    const initialScore = 1.0;
    
    // Track complete optimization cycle
    const auditLog: Array<{
      accessCount: number;
      saturation: number;
      temperature: number;
      effectiveLambda: number;
      scoreAfter24h: number;
    }> = [];
    
    let state = initialState;
    for (let access = 1; access <= 50; access++) {
      state = updateStateOnAccess(state);
      const scoreAfter24h = applyThermodynamicDecay(
        initialScore,
        state.saturation,
        86400
      );
      
      auditLog.push({
        accessCount: state.accessCount,
        saturation: state.saturation,
        temperature: state.temperature,
        effectiveLambda: state.effectiveLambda,
        scoreAfter24h,
      });
    }
    
    // Verify optimization trajectory is monotonic and auditable
    for (let i = 1; i < auditLog.length; i++) {
      const prev = auditLog[i - 1];
      const curr = auditLog[i];
      
      // Saturation increases
      expect(curr.saturation).toBeGreaterThanOrEqual(prev.saturation);
      
      // Temperature decreases (cooling)
      expect(curr.temperature).toBeLessThanOrEqual(prev.temperature);
      
      // Effective lambda decreases (slower decay)
      expect(curr.effectiveLambda).toBeLessThanOrEqual(prev.effectiveLambda);
      
      // Retention improves
      expect(curr.scoreAfter24h).toBeGreaterThanOrEqual(prev.scoreAfter24h);
    }
    
    // Final state should approach ground state
    const finalState = auditLog[auditLog.length - 1];
    expect(finalState.saturation).toBeGreaterThan(0.99);
    expect(finalState.temperature).toBeLessThan(0.01);
    expect(finalState.effectiveLambda).toBeLessThan(0.001);
  });
});

describe("End-to-end self-optimization validation", () => {
  test("memory lifecycle: cold → warm → crystallized → ground state", () => {
    // Phase 1: Cold memory (unsaturated)
    const coldState = initializeThermodynamicState(0.0);
    expect(isGroundState(coldState)).toBe(false);
    expect(coldState.temperature).toBeGreaterThan(0.5);
    
    // Phase 2: Warming (10 accesses)
    let warmState = coldState;
    for (let i = 0; i < 10; i++) {
      warmState = updateStateOnAccess(warmState);
    }
    expect(warmState.saturation).toBeGreaterThan(coldState.saturation);
    expect(warmState.temperature).toBeLessThan(coldState.temperature);
    expect(isGroundState(warmState)).toBe(false);
    
    // Phase 3: Crystallizing (40 more accesses)
    let crystallizingState = warmState;
    for (let i = 0; i < 40; i++) {
      crystallizingState = updateStateOnAccess(crystallizingState);
    }
    expect(crystallizingState.saturation).toBeGreaterThan(0.95);
    expect(crystallizingState.temperature).toBeLessThan(0.1);
    
    // Phase 4: Ground state achieved
    expect(isGroundState(crystallizingState)).toBe(true);
    
    // Verify no decay at ground state
    const initialScore = 1.0;
    const decayedScore = applyThermodynamicDecay(
      initialScore,
      crystallizingState.saturation,
      365 * 86400 // 1 year
    );
    expect(decayedScore).toBeCloseTo(initialScore, 10);
  });

  test("decay resistance increases with saturation in governed steps", () => {
    const saturationLevels = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const initialScore = 1.0;
    const timeSeconds = 86400 * 7; // 1 week
    
    let previousDecayedScore = 0;
    
    for (const saturation of saturationLevels) {
      const decayedScore = applyThermodynamicDecay(
        initialScore,
        saturation,
        timeSeconds
      );
      
      // Each step should retain more than the previous
      expect(decayedScore).toBeGreaterThan(previousDecayedScore);
      previousDecayedScore = decayedScore;
    }
    
    // Ground state (saturation=1.0) should have no decay
    expect(previousDecayedScore).toBe(initialScore);
  });
});
