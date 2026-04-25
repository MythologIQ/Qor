import { getDb } from "./db";
import { randomBytes } from "node:crypto";

export interface OperatorRow {
  id: number;
  handle: string;
  handle_normalized: string;
  api_key: string;
  created_at: number;
}

export function registerOperator(handle: string): { operator: OperatorRow; apiKey: string } {
  const normalized = handle.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (normalized.length < 3 || normalized.length > 32) {
    throw new Error("Handle must normalize to 3-32 alphanumeric/hyphen/underscore chars");
  }
  const apiKey = `ak_${randomBytes(24).toString("hex")}`;
  const now = Date.now();
  const db = getDb();
  const result = db.run(
    "INSERT INTO operators (handle, handle_normalized, api_key, created_at) VALUES (?, ?, ?, ?)",
    [handle, normalized, apiKey, now],
  );
  return {
    operator: {
      id: Number(result.lastInsertRowid),
      handle,
      handle_normalized: normalized,
      api_key: apiKey,
      created_at: now,
    },
    apiKey,
  };
}

export const createOperator = registerOperator;

export function authenticateOperator(apiKey: string): OperatorRow | null {
  return getDb().query("SELECT * FROM operators WHERE api_key = ?").get(apiKey) as OperatorRow | null;
}

export const getOperatorByToken = authenticateOperator;
