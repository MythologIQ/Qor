import type { Unit, CubeCoord } from "../shared/types";

export interface RetargetInput {
  attacker: Unit;
  originalTarget: CubeCoord;
  enemyUnits: Unit[];
  range: number;
}

/**
 * Find a fallback target when the original target has moved or been removed.
 * Candidate set: enemy units within `range` of attacker, excluding any at the
 * original target coord. Sort by (ascending distance, ascending id); return
 * head or null if no candidates.
 */
export function findRetarget(input: RetargetInput): Unit | null {
  const { attacker, originalTarget, enemyUnits, range } = input;
  const candidates = enemyUnits
    .filter((u) => hexDistance(attacker.position, u.position) <= range)
    .filter((u) => !samePos(u.position, originalTarget));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = hexDistance(attacker.position, a.position);
    const db = hexDistance(attacker.position, b.position);
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

function samePos(a: CubeCoord, b: CubeCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

function hexDistance(a: CubeCoord, b: CubeCoord): number {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s),
  );
}
