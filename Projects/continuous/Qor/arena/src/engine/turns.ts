import type { MatchState, AgentAction, CubeCoord, HexCell, Unit } from "../shared/types.ts";

export function advanceTurn(
  state: MatchState,
  actionA: AgentAction,
  actionB: AgentAction
): MatchState {
  const turn = state.turn;
  const isATurn = state.yourTurn;

  const nextTurn = turn + 1;
  const nextYourTurn = !isATurn;

  let units = state.units.map((u) => ({ ...u }));
  let visible = state.visible.map((c) => ({ ...c }));
  let score = { ...state.score };

  const moveUnit = (
    units: Unit[],
    action: AgentAction
  ): { units: Unit[]; moved: boolean } => {
    if (!action.from || !action.to) return { units, moved: false };
    if (action.type === "pass") return { units, moved: false };

    const fromIdx = units.findIndex(
      (u) =>
        u.position.q === action.from!.q &&
        u.position.r === action.from!.r &&
        u.position.s === action.from!.s &&
        (isATurn ? u.owner === "A" : u.owner === "B")
    );
    if (fromIdx === -1) return { units, moved: false };

    const toIdx = units.findIndex(
      (u) =>
        u.position.q === action.to!.q &&
        u.position.r === action.to!.r &&
        u.position.s === action.to!.s
    );

    if (toIdx !== -1) return { units, moved: false };

    const toCellIdx = visible.findIndex(
      (c) =>
        c.position.q === action.to!.q &&
        c.position.r === action.to!.r &&
        c.position.s === action.to!.s
    );
    if (toCellIdx === -1 || visible[toCellIdx].terrain === "water") {
      return { units, moved: false };
    }

    const newUnits = [...units];
    newUnits[fromIdx] = {
      ...newUnits[fromIdx],
      position: action.to!,
    };
    return { units: newUnits, moved: true };
  };

  let targetA: CubeCoord | null = actionA.to ?? null;
  let targetB: CubeCoord | null = actionB.to ?? null;

  const sameTarget =
    targetA !== null &&
    targetB !== null &&
    targetA.q === targetB.q &&
    targetA.r === targetB.r &&
    targetA.s === targetB.s;

  let movedA = false;
  let movedB = false;

  if (!sameTarget) {
    if (targetA !== null) {
      const resultA = moveUnit(units, actionA);
      units = resultA.units;
      movedA = resultA.moved;
    }
    if (targetB !== null) {
      const resultB = moveUnit(units, actionB);
      units = resultB.units;
      movedB = resultB.moved;
    }
  }

  return {
    ...state,
    turn: nextTurn,
    yourTurn: nextYourTurn,
    units,
    visible,
    score,
    deadline: state.deadline + 30000,
  };
}