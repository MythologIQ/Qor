import { getDb } from "./db";
import { randomBytes } from "node:crypto";

export interface MatchRecordRow {
  id: string;
  agent_a_id: number;
  agent_b_id: number;
  bracket: string;
  origin_tag: string;
  outcome: string | null;
  created_at: number;
  completed_at: number | null;
}

export function createMatch(
  agentAId: number,
  agentBId: number,
  bracket: string,
  originTag = "auto",
): MatchRecordRow {
  const id = `match-${randomBytes(8).toString("hex")}`;
  const now = Date.now();
  getDb().run(
    "INSERT INTO matches (id, agent_a_id, agent_b_id, bracket, origin_tag, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, agentAId, agentBId, bracket, originTag, now],
  );
  return {
    id,
    agent_a_id: agentAId,
    agent_b_id: agentBId,
    bracket,
    origin_tag: originTag,
    outcome: null,
    created_at: now,
    completed_at: null,
  };
}

export function getMatch(id: string): MatchRecordRow | null {
  return getDb().query("SELECT * FROM matches WHERE id = ?").get(id) as MatchRecordRow | null;
}

export function updateOutcome(id: string, outcome: string): void {
  const now = Date.now();
  getDb().run("UPDATE matches SET outcome = ?, completed_at = ? WHERE id = ?", [outcome, now, id]);
}
