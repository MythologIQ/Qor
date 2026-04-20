import type { MatchState } from "../shared/types.ts";

interface VictoryResult {
  winner: "A" | "B" | "draw" | null;
  reason: string | null;
}

const TERRITORY_THRESHOLD = 0.6;
const TERRITORY_TURNS = 3;

export function checkVictory(state: MatchState): VictoryResult {
  const units = state.units;
  const visible = state.visible;

  const unitCountA = units.filter((u) => u.owner === "A").length;
  const unitCountB = units.filter((u) => u.owner === "B").length;

  if (unitCountA === 0 && unitCountB === 0) {
    return { winner: "draw", reason: "mutual_elimination" };
  }
  if (unitCountA === 0) {
    return { winner: "B", reason: "elimination" };
  }
  if (unitCountB === 0) {
    return { winner: "A", reason: "elimination" };
  }

  const controlledByA = visible.filter((c) => c.controlledBy === "A").length;
  const controlledByB = visible.filter((c) => c.controlledBy === "B").length;
  const total = visible.length;

  if (total === 0) {
    return { winner: null, reason: null };
  }

  const pctA = controlledByA / total;
  const pctB = controlledByB / total;

  if (pctA >= TERRITORY_THRESHOLD) {
    return { winner: "A", reason: "territory_control" };
  }
  if (pctB >= TERRITORY_THRESHOLD) {
    return { winner: "B", reason: "territory_control" };
  }

  if (state.turn >= 50) {
    if (pctA > pctB) {
      return { winner: "A", reason: "turn_cap" };
    }
    if (pctB > pctA) {
      return { winner: "B", reason: "turn_cap" };
    }
    return { winner: "draw", reason: "turn_cap" };
  }

  return { winner: null, reason: null };
}
