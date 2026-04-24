import { describe, it, expect } from "bun:test";
import { findRetarget } from "../../src/engine/retarget";
import type { Unit, CubeCoord } from "../../src/shared/types";

function u(id: string, owner: "A" | "B", q: number, r: number): Unit {
  return {
    id, owner,
    position: { q, r, s: -q - r },
    strength: 3, hp: 5, type: "infantry", weight: 2,
  };
}

describe("findRetarget", () => {
  const attacker = u("atk-1", "A", 0, 0);

  it("null when no enemy in range", () => {
    const enemies = [u("far", "B", 5, 0)];
    expect(findRetarget({ attacker, originalTarget: { q: 10, r: 0, s: -10 }, enemyUnits: enemies, range: 1 })).toBeNull();
  });

  it("null when only enemy is at original target", () => {
    const enemies = [u("orig", "B", 1, 0)];
    expect(findRetarget({ attacker, originalTarget: { q: 1, r: 0, s: -1 }, enemyUnits: enemies, range: 1 })).toBeNull();
  });

  it("prefers closer candidate", () => {
    const enemies = [
      u("far", "B", 2, 0),
      u("near", "B", 1, 0),
    ];
    const r = findRetarget({ attacker, originalTarget: { q: 5, r: 0, s: -5 }, enemyUnits: enemies, range: 2 });
    expect(r?.id).toBe("near");
  });

  it("ties break by lowest id lexicographically", () => {
    const enemies = [
      u("b-unit", "B", 1, 0),
      u("a-unit", "B", 0, 1),
    ];
    const r = findRetarget({ attacker, originalTarget: { q: 5, r: 0, s: -5 }, enemyUnits: enemies, range: 1 });
    expect(r?.id).toBe("a-unit");
  });

  it("excludes out-of-range units", () => {
    const enemies = [u("oor", "B", 3, 0)];
    expect(findRetarget({ attacker, originalTarget: { q: 5, r: 0, s: -5 }, enemyUnits: enemies, range: 1 })).toBeNull();
  });

  it("includes exactly at range boundary", () => {
    const enemies = [u("edge", "B", 2, 0)];
    const r = findRetarget({ attacker, originalTarget: { q: 5, r: 0, s: -5 }, enemyUnits: enemies, range: 2 });
    expect(r?.id).toBe("edge");
  });
});
