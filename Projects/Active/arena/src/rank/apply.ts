// HexaWars Arena — ELO Apply
// Applies ELO delta to operators after a match resolves.
// Plan A v2, Phase E.

import type { Database } from "bun:sqlite";
import { elo } from "./elo";

export interface ApplyEloParams {
  winnerOpId: number | null; // null = draw
  loserOpId: number;
  draw?: boolean;
}

/**
 * Reads both operator elos, computes the ELO update, writes back atomically.
 * Callers own the transaction scope when more writes are involved.
 */
export function applyElo(
  db: Database,
  matchId: string,
  { winnerOpId, loserOpId, draw = false }: ApplyEloParams
): { winnerElo: number; loserElo: number; delta: number } {
  const rows = db
    .query<{ id: number; elo: number }, [number, number]>(
      "SELECT id, elo FROM operators WHERE id IN (?, ?)"
    )
    .all(winnerOpId ?? loserOpId, loserOpId);

  const winnerRow = draw ? null : rows.find((r) => r.id === winnerOpId);
  const loserRow = rows.find((r) => r.id === loserOpId);

  const ratingWinner = winnerRow?.elo ?? 1500;
  const ratingLoser = loserRow?.elo ?? 1500;

  const scoreWinner: 0 | 0.5 | 1 = draw ? 0.5 : 1;
  const { newA, newB, delta } = elo({
    ratingA: ratingWinner,
    ratingB: ratingLoser,
    scoreA: scoreWinner,
  });

  const finalWinnerElo = draw ? newA : newA;
  const finalLoserElo = draw ? newB : newB;

  db.transaction(() => {
    if (draw) {
      db.query("UPDATE operators SET elo = ? WHERE id = ?").run(finalWinnerElo, winnerOpId!);
      db.query("UPDATE operators SET elo = ? WHERE id = ?").run(finalLoserElo, loserOpId);
    } else {
      db.query("UPDATE operators SET elo = ? WHERE id = ?").run(newA, winnerOpId!);
      db.query("UPDATE operators SET elo = ? WHERE id = ?").run(newB, loserOpId);
    }

    const outcome = draw ? "draw" : "resolved";
    db
      .query("UPDATE matches SET outcome = ? WHERE id = ?")
      .run(outcome, matchId);
  })();

  return { winnerElo: finalWinnerElo, loserElo: finalLoserElo, delta };
}