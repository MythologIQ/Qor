import { createHash } from "node:crypto";
import { getDb } from "./db.js";

export interface AgentVersion {
  id: number;
  operatorId: number;
  name: string;
  fingerprint: string;
  modelId: string;
  bracket: string;
  verification: string;
  queueEligible: boolean;
  apiKey: string;
  createdAt: number;
}

export function registerAgent(
  operatorId: number,
  name: string,
  fingerprint: string,
  modelId: string,
): { agent: AgentVersion; apiKey: string } {
  const db = getDb();
  const agentApiKey = require("node:crypto").randomBytes(16).toString("hex");
  const createdAt = Date.now();
  db.exec(
    `INSERT INTO agent_versions (operator_id, name, fingerprint, model_id, bracket, verification, queue_eligible, api_key, created_at) VALUES (?, ?, ?, ?, 'scout_force', 'unverified', 0, ?, ?)`,
    [operatorId, name, fingerprint, modelId, agentApiKey, createdAt],
  );
  const row = db
    .query<{ id: number; operator_id: number; name: string; fingerprint: string; model_id: string; bracket: string; verification: string; queue_eligible: number; api_key: string; created_at: number }>(
      `SELECT * FROM agent_versions WHERE api_key = ?`,
    )
    .get(agentApiKey)!;
  return {
    agent: {
      id: row.id,
      operatorId: row.operator_id,
      name: row.name,
      fingerprint: row.fingerprint,
      modelId: row.model_id,
      bracket: row.bracket,
      verification: row.verification,
      queueEligible: row.queue_eligible === 1,
      apiKey: row.api_key,
      createdAt: row.created_at,
    },
    apiKey: agentApiKey,
  };
}

export function getAgentById(id: number): AgentVersion | null {
  const db = getDb();
  const row = db
    .query<{ id: number; operator_id: number; name: string; fingerprint: string; model_id: string; bracket: string; verification: string; queue_eligible: number; api_key: string; created_at: number }>(
      `SELECT * FROM agent_versions WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    operatorId: row.operator_id,
    name: row.name,
    fingerprint: row.fingerprint,
    modelId: row.model_id,
    bracket: row.bracket,
    verification: row.verification,
    queueEligible: row.queue_eligible === 1,
    apiKey: row.api_key,
    createdAt: row.created_at,
  };
}

export function getAgentsByOperator(operatorId: number): AgentVersion[] {
  const db = getDb();
  return db
    .query<{ id: number; operator_id: number; name: string; fingerprint: string; model_id: string; bracket: string; verification: string; queue_eligible: number; api_key: string; created_at: number }>(
      `SELECT * FROM agent_versions WHERE operator_id = ? ORDER BY created_at DESC`,
    )
    .all(operatorId)
    .map((row) => ({
      id: row.id,
      operatorId: row.operator_id,
      name: row.name,
      fingerprint: row.fingerprint,
      modelId: row.model_id,
      bracket: row.bracket,
      verification: row.verification,
      queueEligible: row.queue_eligible === 1,
      apiKey: row.api_key,
      createdAt: row.created_at,
    }));
}

export function computeFingerprint(modelId: string, handle: string): string {
  return createHash("sha256").update(`${modelId}:${handle.toLowerCase().trim()}`).digest("hex");
}