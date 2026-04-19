// HexaWars Arena — Leaderboard (Phase E rank store)
import type { Database } from "bun:sqlite";

export interface LeaderboardEntry {
  handle: string;
  elo: number;
  matchesPlayed: number;
}

export function getLeaderboard(
  db: Database,
  limit = 100,
): LeaderboardEntry[] {
  return db
    .prepare(
      `WITH operator_match_counts AS (
        SELECT operator_id, COUNT(*) AS matchesPlayed
        FROM (
          SELECT operator_a_id AS operator_id FROM matches
          UNION ALL
          SELECT operator_b_id AS operator_id FROM matches
        )
        GROUP BY operator_id
      )
      SELECT o.handle, o.elo, omc.matchesPlayed
      FROM operators o
      JOIN operator_match_counts omc ON o.id = omc.operator_id
      ORDER BY o.elo DESC
      LIMIT ?`,
    )
    .all(limit) as LeaderboardEntry[];
}
