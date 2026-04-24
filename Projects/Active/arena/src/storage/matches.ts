import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";

export interface MatchRecord {
  id: string;
  operatorAId: number | null;
  operatorBId: number | null;
  agentAId: number | null;
  agentBId: number | null;
  originTag: string;
  outcome: string | null;
  createdAt: number;
}

export function createMatch(
  agentAId: number,
  agentBId: number,
  originTag = "auto",
): MatchRecord {
  const db = getDb();
  const id = `match-${randomBytes(4).toString("hex")}-${Date.now()}`;
  const createdAt = Date.now();
  db.exec(
    `INSERT INTO match_records (id, agent_a_id, agent_b_id, origin_tag, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, agentAId, agentBId, originTag, createdAt],
  );
  return {
    id,
    operatorAId: null,
    operatorBId: null,
    agentAId,
    agentBId,
    originTag,
    outcome: null,
    createdAt,
  };
}

export function getMatch(id: string): MatchRecord | null {
  const db = getDb();
  const row = db
    .query<{ id: string; operator_a_id: number | null; operator_b_id: number | null; agent_a_id: number | null; agent_b_id: number | null; origin_tag: string; outcome: string | null; created_at: number }>(
      `SELECT * FROM match_records WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    operatorAId: row.operator_a_id ?? null,
    operatorBId: row.operator_b_id ?? null,
    agentAId: row.agent_a_id ?? null,
    agentBId: row.agent_b_id ?? null,
    originTag: row.origin_tag,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
}

export function updateOutcome(id: string, outcome: string): void {
  const db = getDb();
  db.exec(`UPDATE match_records SET outcome = ? WHERE id = ?`, [outcome, id]);
}