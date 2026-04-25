import { getDb } from "./db";
import { randomBytes, createHash } from "node:crypto";

export type Bracket = "scout_force" | "warband" | "vanguard_legion";
export type Verification =
  | "unverified"
  | "pending_handshake"
  | "verified_pending_queue"
  | "queue_eligible"
  | "active"
  | "demoted";

export interface AgentVersionRow {
  id: number;
  operator_id: number;
  name: string;
  fingerprint: string;
  model_id: string;
  bracket: Bracket;
  verification: Verification;
  queue_eligible: number;
  api_key: string;
  created_at: number;
}

export function computeFingerprint(config: {
  modelId?: string;
  systemPrompt?: string;
  params?: Record<string, unknown>;
} | string): string {
  // Detect which signature variant we have:
  // Old Phase 1 tests: computeFingerprint("fp-single") — string input (pre-computed fingerprint)
  // New Phase 1 storage: computeFingerprint({ modelId: "...", ... }) — config object
  // Falls back to empty hash for null/undefined config (partial call without config object)
  if (typeof config !== "object" || config === null) {
    const hash = createHash("sha256");
    hash.update(String(config ?? ""));
    return hash.digest("hex").slice(0, 16);
  }
  // config is an object — extract modelId safely
  const modelId = "modelId" in config ? config.modelId : undefined;
  const mid = modelId ?? "";
  const hash = createHash("sha256");
  hash.update(mid);
  if (modelId && config.systemPrompt) hash.update(config.systemPrompt);
  if (modelId && config.params) hash.update(JSON.stringify(config.params));
  return hash.digest("hex").slice(0, 16);
}

export function registerAgent(
  operatorId: number,
  name: string,
  modelId: string,
  bracket: Bracket,
  config: { systemPrompt?: string; params?: Record<string, unknown> },
): { agent: AgentVersionRow; apiKey: string } {
  const fingerprint = computeFingerprint(config);
  const apiKey = `ag_${randomBytes(24).toString("hex")}`;
  const now = Date.now();
  const db = getDb();
  const result = db.run(
    "INSERT INTO agent_versions (operator_id, name, fingerprint, model_id, bracket, verification, queue_eligible, api_key, created_at) VALUES (?, ?, ?, ?, ?, 'unverified', 0, ?, ?)",
    [operatorId, name, fingerprint, modelId, bracket, apiKey, now],
  );
  return {
    agent: {
      id: Number(result.lastInsertRowid),
      operator_id: operatorId,
      name,
      fingerprint,
      model_id: modelId,
      bracket,
      verification: "unverified",
      queue_eligible: 0,
      api_key: apiKey,
      created_at: now,
    },
    apiKey,
  };
}

export function getAgentsByOperator(operatorId: number): AgentVersionRow[] {
  return getDb()
    .query("SELECT * FROM agent_versions WHERE operator_id = ? ORDER BY created_at DESC")
    .all(operatorId) as AgentVersionRow[];
}

export function getAgentById(agentId: number): AgentVersionRow | null {
  return getDb().query("SELECT * FROM agent_versions WHERE id = ?").get(agentId) as AgentVersionRow | null;
}

export function updateAgentVerification(agentId: number, verification: Verification): void {
  getDb().run("UPDATE agent_versions SET verification = ? WHERE id = ?", [verification, agentId]);
}

export function setQueueEligible(agentId: number, eligible: boolean): void {
  getDb().run("UPDATE agent_versions SET queue_eligible = ? WHERE id = ?", [eligible ? 1 : 0, agentId]);
}

export function getQueueEligibleAgents(bracket: Bracket): AgentVersionRow[] {
  return getDb()
    .query(
      "SELECT * FROM agent_versions WHERE queue_eligible = 1 AND bracket = ? AND verification IN ('queue_eligible', 'active')",
    )
    .all(bracket) as AgentVersionRow[];
}
