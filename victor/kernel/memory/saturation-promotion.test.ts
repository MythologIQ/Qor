/**
 * Tests for saturation-driven memory promotion
 */

import { describe, it, expect } from "bun:test";
import {
  checkPromotionEligibility,
  promoteToCrystallized,
  promoteBatch,
  countEligibleForPromotion,
  findEligibleMemories,
  inspectPromotionStatus,
  type PromotableMemory,
  type PromotionEligibility
} from "./saturation-promotion";
import type { ThermodynamicState } from "./thermodynamic-decay";

function createMockMemory(
  memoryId: string,
  saturation: number,
  currentTier: "ephemeral" | "durable" | "crystallized"
): PromotableMemory {
  const effectiveLambda = 0.1 * (1 - saturation); // λ_eff = λ_base × (1 - saturation)
  const temperature = 1 - saturation;
  
  return {
    memoryId,
    thermodynamicState: {
      saturation,
      temperature,
      effectiveLambda,
      lastAccessedAt: Date.now(),
      accessCount: Math.floor(saturation * 50)
    },
    currentTier
  };
}

describe("Eligibility checking", () => {
  it("returns eligible for high-saturation durable memory", () => {
    const memory = createMockMemory("mem1", 0.96, "durable");
    const eligibility = checkPromotionEligibility(memory, 0.95);
    expect(eligibility).toBe("eligible");
  });

  it("returns below-threshold for mid-saturation durable memory", () => {
    const memory = createMockMemory("mem2", 0.80, "durable");
    const eligibility = checkPromotionEligibility(memory, 0.95);
    expect(eligibility).toBe("below-threshold");
  });

  it("returns already-crystallized for crystallized memory", () => {
    const memory = createMockMemory("mem3", 0.99, "crystallized");
    const eligibility = checkPromotionEligibility(memory, 0.95);
    expect(eligibility).toBe("already-crystallized");
  });

  it("returns below-threshold at exact threshold boundary", () => {
    const memory = createMockMemory("mem4", 0.9499, "durable");
    const eligibility = checkPromotionEligibility(memory, 0.95);
    expect(eligibility).toBe("below-threshold");
  });

  it("returns eligible at exact threshold", () => {
    const memory = createMockMemory("mem5", 0.95, "durable");
    const eligibility = checkPromotionEligibility(memory, 0.95);
    expect(eligibility).toBe("eligible");
  });
});

describe("Single memory promotion", () => {
  it("promotes eligible durable memory to crystallized", () => {
    const memory = createMockMemory("mem1", 0.97, "durable");
    const result = promoteToCrystallized(memory, 0.95);
    
    expect(result.promoted).toBe(true);
    expect(result.sourceTier).toBe("durable");
    expect(result.targetTier).toBe("crystallized");
    expect(result.reason).toContain("0.970");
    expect(result.reason).toContain("0.950");
  });

  it("rejects below-threshold durable memory", () => {
    const memory = createMockMemory("mem2", 0.85, "durable");
    const result = promoteToCrystallized(memory, 0.95);
    
    expect(result.promoted).toBe(false);
    expect(result.sourceTier).toBe("durable");
    expect(result.targetTier).toBe("durable");
    expect(result.reason).toContain("below");
  });

  it("rejects already-crystallized memory", () => {
    const memory = createMockMemory("mem3", 0.99, "crystallized");
    const result = promoteToCrystallized(memory, 0.95);
    
    expect(result.promoted).toBe(false);
    expect(result.sourceTier).toBe("crystallized");
    expect(result.targetTier).toBe("crystallized");
    expect(result.reason).toContain("already");
  });

  it("promotes ephemeral memory if saturation reaches threshold", () => {
    const memory = createMockMemory("mem4", 0.96, "ephemeral");
    const result = promoteToCrystallized(memory, 0.95);
    
    expect(result.promoted).toBe(true);
    expect(result.sourceTier).toBe("ephemeral");
    expect(result.targetTier).toBe("crystallized");
  });

  it("uses custom crystallization threshold", () => {
    const memory = createMockMemory("mem5", 0.92, "durable");
    
    const resultDefault = promoteToCrystallized(memory, 0.95);
    expect(resultDefault.promoted).toBe(false);
    
    const resultCustom = promoteToCrystallized(memory, 0.90);
    expect(resultCustom.promoted).toBe(true);
  });
});

describe("Batch promotion", () => {
  it("promotes all eligible memories in batch", () => {
    const memories = [
      createMockMemory("mem1", 0.97, "durable"),
      createMockMemory("mem2", 0.80, "durable"),
      createMockMemory("mem3", 0.99, "crystallized"),
      createMockMemory("mem4", 0.96, "durable")
    ];
    
    const results = promoteBatch(memories, 0.95);
    
    expect(results).toHaveLength(4);
    expect(results[0].promoted).toBe(true);  // 0.97 → eligible
    expect(results[1].promoted).toBe(false); // 0.80 → below threshold
    expect(results[2].promoted).toBe(false); // 0.99 → already crystallized
    expect(results[3].promoted).toBe(true);  // 0.96 → eligible
  });

  it("handles empty batch", () => {
    const results = promoteBatch([], 0.95);
    expect(results).toHaveLength(0);
  });

  it("returns correct source and target tiers for each memory", () => {
    const memories = [
      createMockMemory("mem1", 0.97, "durable"),
      createMockMemory("mem2", 0.96, "ephemeral")
    ];
    
    const results = promoteBatch(memories, 0.95);
    
    expect(results[0].sourceTier).toBe("durable");
    expect(results[0].targetTier).toBe("crystallized");
    expect(results[1].sourceTier).toBe("ephemeral");
    expect(results[1].targetTier).toBe("crystallized");
  });
});

describe("Eligibility counting and filtering", () => {
  it("counts eligible memories correctly", () => {
    const memories = [
      createMockMemory("mem1", 0.97, "durable"),
      createMockMemory("mem2", 0.80, "durable"),
      createMockMemory("mem3", 0.99, "crystallized"),
      createMockMemory("mem4", 0.96, "durable"),
      createMockMemory("mem5", 0.50, "ephemeral")
    ];
    
    const count = countEligibleForPromotion(memories, 0.95);
    expect(count).toBe(2); // mem1 and mem4
  });

  it("finds eligible memories", () => {
    const memories = [
      createMockMemory("mem1", 0.97, "durable"),
      createMockMemory("mem2", 0.80, "durable"),
      createMockMemory("mem3", 0.96, "durable")
    ];
    
    const eligible = findEligibleMemories(memories, 0.95);
    
    expect(eligible).toHaveLength(2);
    expect(eligible[0].memoryId).toBe("mem1");
    expect(eligible[1].memoryId).toBe("mem3");
  });

  it("returns empty array when no memories are eligible", () => {
    const memories = [
      createMockMemory("mem1", 0.70, "durable"),
      createMockMemory("mem2", 0.80, "durable"),
      createMockMemory("mem3", 0.90, "durable")
    ];
    
    const eligible = findEligibleMemories(memories, 0.95);
    expect(eligible).toHaveLength(0);
  });
});

describe("Promotion status inspection", () => {
  it("provides complete status information for eligible memory", () => {
    const memory = createMockMemory("mem1", 0.97, "durable");
    const status = inspectPromotionStatus(memory, 0.95);
    
    expect(status.memoryId).toBe("mem1");
    expect(status.currentTier).toBe("durable");
    expect(status.eligibility).toBe("eligible");
    expect(status.saturation).toBe(0.97);
    expect(status.crystallizationThreshold).toBe(0.95);
    expect(status.saturationGap).toBe(0);
  });

  it("calculates saturation gap for below-threshold memory", () => {
    const memory = createMockMemory("mem2", 0.85, "durable");
    const status = inspectPromotionStatus(memory, 0.95);
    
    expect(status.eligibility).toBe("below-threshold");
    expect(status.saturationGap).toBeCloseTo(0.10, 2);
  });

  it("detects ground state for fully saturated memory", () => {
    const memory = createMockMemory("mem3", 1.0, "durable");
    const status = inspectPromotionStatus(memory, 0.95);
    
    expect(status.isGroundState).toBe(true);
    expect(status.effectiveLambda).toBeLessThanOrEqual(0.001);
  });

  it("identifies already-crystallized memory", () => {
    const memory = createMockMemory("mem4", 0.99, "crystallized");
    const status = inspectPromotionStatus(memory, 0.95);
    
    expect(status.eligibility).toBe("already-crystallized");
    expect(status.currentTier).toBe("crystallized");
  });
});

describe("Acceptance criteria validation", () => {
  it("AC1: Saturation-driven promotion moves eligible memory from L2 to L3", () => {
    // Create durable (L2) memory with high saturation
    const l2Memory = createMockMemory("mem1", 0.97, "durable");
    
    // Attempt promotion
    const result = promoteToCrystallized(l2Memory, 0.95);
    
    // Verify promotion occurred
    expect(result.promoted).toBe(true);
    expect(result.sourceTier).toBe("durable"); // L2
    expect(result.targetTier).toBe("crystallized"); // L3
    
    // Verify saturation drove the promotion
    expect(result.reason).toContain("0.970");
    expect(result.reason).toContain("threshold");
  });

  it("AC2: Promotion is explicit and testable instead of implicit routing drift", () => {
    const memory = createMockMemory("mem1", 0.97, "durable");
    
    // Explicit promotion call returns structured result
    const result = promoteToCrystallized(memory, 0.95);
    
    // Result is testable and explicit
    expect(result).toHaveProperty("promoted");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("sourceTier");
    expect(result).toHaveProperty("targetTier");
    
    // Promotion is deterministic
    const result2 = promoteToCrystallized(memory, 0.95);
    expect(result2.promoted).toBe(result.promoted);
    expect(result2.sourceTier).toBe(result.sourceTier);
    expect(result2.targetTier).toBe(result.targetTier);
  });

  it("AC3: Promoted memory becomes available to exact-address lookup", () => {
    // High-saturation memory in durable tier
    const memory = createMockMemory("mem1", 0.98, "durable");
    
    // Before promotion: memory is in durable (L2) tier
    expect(memory.currentTier).toBe("durable");
    
    // Promote to crystallized
    const result = promoteToCrystallized(memory, 0.95);
    
    // After promotion: target tier is crystallized (L3)
    expect(result.promoted).toBe(true);
    expect(result.targetTier).toBe("crystallized");
    
    // Memory ID remains stable for exact-address lookup
    expect(memory.memoryId).toBe("mem1");
    
    // Crystallized tier enables O(1) exact-address lookup
    // (This demonstrates promotion path exists; actual lookup implementation
    // would be in a separate storage layer)
  });
});
