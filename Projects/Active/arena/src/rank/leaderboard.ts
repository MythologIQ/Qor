// HexaWars Arena — Leaderboard Query
// Top-N operators by Elo rating with match count

import type { Database } from "bun:sqlite";
import type { EloInput, EloResult } from "./types";

export interface LeaderboardEntry {
  handle: string;
  elo: number;
  matchesPlayed: number;
}

export function getLeaderboard(
  db: Database,
  limit: number = 100,
): LeaderboardEntry[] {
  return db
    .prepare(
      `SELECT o.handle, o.elo, COUNT(m.id) AS matchesPlayed
       FROM operators o
       LEFT JOIN matches m ON m.operator_a_id = o.id OR m.operator_b_id = o.id
       GROUP BY o.id
       ORDER BY o.elo DESC
       LIMIT ?`,
    )
    .all(limit) as LeaderboardEntry[];
}