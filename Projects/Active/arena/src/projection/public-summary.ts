import type {
  PublicMatchProjection,
  PublicMatchSummary,
  PublicReplayCard,
} from "../shared/public-match.ts";

export function buildPublicMatchSummary(
  projection: PublicMatchProjection,
): PublicMatchSummary {
  return {
    matchId: projection.matchId,
    mode: projection.mode,
    round: projection.round,
    roundCap: projection.roundCap,
    phase: projection.phase,
    pressure: projection.pressure,
    operatorA: projection.sides.A.operator,
    operatorB: projection.sides.B.operator,
    territoryA: projection.board.territories.A,
    territoryB: projection.board.territories.B,
    momentum: projection.board.momentum,
    outcome: projection.outcome,
  };
}

export function buildPublicReplayCard(
  summary: PublicMatchSummary,
): PublicReplayCard {
  const winner =
    summary.outcome?.winner && summary.outcome.winner !== "draw"
      ? summary.outcome.winner
      : null;
  const title = `${summary.operatorA} vs ${summary.operatorB}`;
  const subtitle = `${summary.phase} · Round ${summary.round}/${summary.roundCap}`;

  return {
    matchId: summary.matchId,
    title,
    subtitle,
    pressure: summary.pressure,
    momentum: summary.momentum,
    winner,
    reason: summary.outcome?.reason ?? null,
  };
}
