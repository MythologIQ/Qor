import { randomBytes } from "node:crypto";
import { getDb } from "./db.js";

export interface Operator {
  id: number;
  handle: string;
  handleNormalized: string;
  apiKey: string;
  createdAt: number;
}

function normalizeHandle(handle: string): string {
  return handle.toLowerCase().trim().replace(/\s+/g, "-");
}

export function createOperator(handle: string): { operator: Operator; apiKey: string } {
  const db = getDb();
  const apiKey = randomBytes(16).toString("hex");
  const normalized = normalizeHandle(handle);
  const createdAt = Date.now();
  try {
    db.exec(
      `INSERT INTO operators (handle, handle_normalized, api_key, created_at) VALUES (?, ?, ?, ?)`,
      [handle, normalized, apiKey, createdAt],
    );
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      throw new Error(`Handle '${handle}' is already taken`);
    }
    throw err;
  }
  const row = db.query<Operator>(`SELECT * FROM operators WHERE api_key = ?`).get(apiKey)!;
  return {
    operator: {
      id: row.id,
      handle: row.handle,
      handleNormalized: row.handle_normalized,
      apiKey: row.api_key,
      createdAt: row.created_at,
    },
    apiKey,
  };
}

export function getOperatorByToken(tokenId: string): Operator | null {
  const db = getDb();
  const row = db.query<Operator>(`SELECT * FROM operators WHERE api_key = ?`).get(tokenId);
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    handleNormalized: row.handle_normalized,
    apiKey: row.api_key,
    createdAt: row.created_at,
  };
}