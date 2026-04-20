import { describe, it, expect } from "bun:test";
import { resolveCombat } from "../../src/engine/combat.ts";

describe("resolveCombat", () => {
  it("equal strength on plain → attacker destroyed (tie favors defender)", () => {
    const attacker = { id: "atk-1", hp: 10, strength: 10, position: [0, 0] };
    const defender = { id: "def-1", hp: 10, strength: 10, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "plain");
    expect(result.destroyed).toContain("atk-1");
    expect(result.destroyed).not.toContain("def-1");
  });

  it("forest adds +1 defense bonus", () => {
    // Attacker has strength 5, defender has strength 5 on forest
    // Defender defense = 5 (strength) + 1 (forest bonus) = 6
    // Attacker deals 5 damage → defender HP: 10 - 5 = 5 (survives)
    // Defender deals 6 damage → attacker HP: 10 - 6 = 4 (survives)
    const attacker = { id: "atk-2", hp: 10, strength: 5, position: [0, 0] };
    const defender = { id: "def-2", hp: 10, strength: 5, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "forest");
    expect(result.defenderHp).toBe(5); // 10 - 5
    expect(result.attackerHp).toBe(4); // 10 - 6 (5 + 1 forest bonus)
    expect(result.destroyed).not.toContain("atk-2");
    expect(result.destroyed).not.toContain("def-2");
  });

  it("mountain terrain attack not allowed", () => {
    const attacker = { id: "atk-3", hp: 10, strength: 10, position: [0, 0] };
    const defender = { id: "def-3", hp: 10, strength: 2, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "mountain");
    // Attacker on mountain: atkDmgActual = 0 (cannot reach)
    // Defender deals: 2 + 2 (mountain defense bonus) = 4 damage
    expect(result.defenderHp).toBe(10); // Not hit
    expect(result.attackerHp).toBe(6);   // 10 - 4
    expect(result.destroyed).not.toContain("def-3");
  });

  it("attacker deals lethal damage and survives", () => {
    const attacker = { id: "atk-4", hp: 10, strength: 12, position: [0, 0] };
    const defender = { id: "def-4", hp: 10, strength: 5, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "plain");
    expect(result.defenderHp).toBe(0);
    expect(result.attackerHp).toBe(5);  // 10 - 5
    expect(result.destroyed).toContain("def-4");
    expect(result.destroyed).not.toContain("atk-4");
  });

  it("defender counter-kills attacker and survives", () => {
    const attacker = { id: "atk-5", hp: 10, strength: 3, position: [0, 0] };
    const defender = { id: "def-5", hp: 10, strength: 10, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "plain");
    expect(result.attackerHp).toBe(0);
    expect(result.defenderHp).toBe(7); // 10 - 3
    expect(result.destroyed).toContain("atk-5");
    expect(result.destroyed).not.toContain("def-5");
  });

  it("mountain with strong defender beats weak attacker", () => {
    const attacker = { id: "atk-6", hp: 10, strength: 3, position: [0, 0] };
    const defender = { id: "def-6", hp: 10, strength: 8, position: [1, 0] };
    const result = resolveCombat(attacker, defender, "mountain");
    // Attacker deals 0 (mountain block)
    // Defender deals: 8 + 2 (mountain defense bonus) = 10 → lethal
    expect(result.attackerHp).toBe(0);
    expect(result.destroyed).toContain("atk-6");
  });
});