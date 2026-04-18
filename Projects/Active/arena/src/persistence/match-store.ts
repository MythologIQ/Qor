// HexaWars Arena — Match Store (Plan A v2, Phase 3)
// Storage-only: saveMatch, appendEvents, getMatch, listMatchesByOperator,
// streamEvents. No runners, no matchmaker. Append-only event log.

import type { Database } from "bun:sqlite";
import type { MatchRecord, MatchEvent } from "../shared/types";

export interface MatchListEntry {
  id: string;
  operatorAHandle: string;
  operatorBHandle: string;
  originTag: string;
  outcome: string | null;
  createdAt: number;
  eventCount: number;
}

export function saveMatch(db: Database, rec: MatchRecord): void {
  db.prepare(
    `INSERT INTO matches
       (id, operator_a_id, operator_b_id, agent_a_id, agent_b_id,
        origin_tag, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    rec.id,
    rec.operatorAId,
    rec.operatorBId,
    rec.agentAId,
    rec.agentBId,
    rec.originTag,
    rec.outcome,
    rec.createdAt,
  );
}

export function appendEvents(
  db: Database,
  matchId: string,
  events: Omit<MatchEvent, "matchId">[],
): void {
  // Auto-create table if it doesn't exist (supports test in-memory dbs)
  db.prepare(`CREATE TABLE IF NOT EXISTS match_events (
    match_id TEXT, seq INTEGER, event_type TEXT, payload TEXT, ts INTEGER
  )`).run();

  const stmt = db.prepare(
    `INSERT INTO match_events (match_id, seq, event_type, payload, ts)
     VALUES (?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const ev of events) {
      stmt.run(matchId, ev.seq, ev.eventType, ev.payload, ev.ts);
    }
  })();
}

export function getMatch(db: Database, id: string): MatchRecord | null {
  const row = db
    .prepare(
      `SELECT id, operator_a_id AS operatorAId, operator_b_id AS operatorBId,
              agent_a_id AS agentAId, agent_b_id AS agentBId,
              origin_tag AS originTag, outcome, created_at AS createdAt
       FROM matches WHERE id = ?`,
    )
    .get(id) as MatchRecord | undefined;
  return row ?? null;
}

export function listMatchesByOperator(
  db: Database,
  operatorId: number,
  limit: number = 50,
): MatchListEntry[] {
  return db
    .prepare(
      `SELECT m.id AS id,
              oa.handle AS operatorAHandle,
              ob.handle AS operatorBHandle,
              m.origin_tag AS originTag,
              m.outcome AS outcome,
              m.created_at AS createdAt,
              (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id) AS eventCount
       FROM matches m
       JOIN operators oa ON m.operator_a_id = oa.id
       JOIN operators ob ON m.operator_b_id = ob.id
       WHERE m.operator_a_id = ? OR m.operator_b_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(operatorId, operatorId, limit) as MatchListEntry[];
}

export function* streamEvents(
  db: Database,
  matchId: string,
): IterableIterator<MatchEvent> {
  const iter = db
    .prepare(
      `SELECT match_id AS matchId, seq, event_type AS eventType,
              payload, ts
       FROM match_events
       WHERE match_id = ?
       ORDER BY seq ASC`,
    )
    .iterate(matchId) as IterableIterator<MatchEvent>;
  for (const row of iter) yield row;
}

export function countEvents(db: Database, matchId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM match_events WHERE match_id = ?`)
    .get(matchId) as { n: number };
  return row.n;
}
