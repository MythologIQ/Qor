// HexaWars Arena — Operator Identity (Plan A v2, Phase 2)
// Token format: <token_id>.<secret>
//   token_id = 8 random bytes hex (16 chars), indexed O(1) lookup key
//   secret   = 24 random bytes hex (48 chars)
//   at-rest  = sha256( salt ‖ secret ) with 16-byte per-row salt
// Handle normalization: NFKC + lowercase + strip zero-width / control whitespace.

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { Operator } from "../shared/types";

const TOKEN_ID_BYTES = 8;
const SECRET_BYTES = 24;
const SALT_BYTES = 16;

const ZERO_WIDTH_AND_CONTROL =
  /[\s\u200b-\u200f\u2028-\u202f\u205f\u206f\ufeff]/g;

export class HandleCollisionError extends Error {
  constructor(public readonly handle: string) {
    super(`handle collision: ${handle}`);
    this.name = "HandleCollisionError";
  }
}

export class EmptyHandleError extends Error {
  constructor() {
    super("handle empty after normalization");
    this.name = "EmptyHandleError";
  }
}

export function normalizeHandle(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().replace(ZERO_WIDTH_AND_CONTROL, "");
}

function hashSecret(salt: Buffer, secret: string): Buffer {
  return createHash("sha256").update(salt).update(secret).digest();
}

export interface CreateOperatorResult {
  operator: Operator;
  token: string;
}

export function createOperator(
  db: Database,
  handle: string,
): CreateOperatorResult {
  const normalized = normalizeHandle(handle);
  if (!normalized) throw new EmptyHandleError();

  const tokenId = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  const salt = randomBytes(SALT_BYTES);
  const hash = hashSecret(salt, secret);
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    const row = db
      .prepare(
        `INSERT INTO operators
           (handle, handle_normalized, token_id, token_salt, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, handle, handle_normalized, token_id, created_at`,
      )
      .get(handle, normalized, tokenId, salt, hash, createdAt) as {
        id: number;
        handle: string;
        handle_normalized: string;
        token_id: string;
        created_at: number;
      };
    return {
      operator: {
        id: row.id,
        handle: row.handle,
        handleNormalized: row.handle_normalized,
        tokenId: row.token_id,
        createdAt: row.created_at,
      },
      token: `${tokenId}.${secret}`,
    };
  } catch (err) {
    const msg = (err as Error).message;
    if (/UNIQUE constraint failed/.test(msg)) {
      throw new HandleCollisionError(handle);
    }
    throw err;
  }
}

export function getOperatorByToken(
  db: Database,
  token: string,
): Operator | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const tokenId = token.slice(0, dot);
  const secret = token.slice(dot + 1);

  const row = db
    .prepare(
      `SELECT id, handle, handle_normalized, token_id, token_salt, token_hash, created_at
       FROM operators WHERE token_id = ?`,
    )
    .get(tokenId) as
      | {
          id: number;
          handle: string;
          handle_normalized: string;
          token_id: string;
          token_salt: Buffer;
          token_hash: Buffer;
          created_at: number;
        }
      | undefined;
  if (!row) return null;

  const computed = hashSecret(row.token_salt, secret);
  if (computed.length !== row.token_hash.length) return null;
  if (!timingSafeEqual(computed, row.token_hash)) return null;

  return {
    id: row.id,
    handle: row.handle,
    handleNormalized: row.handle_normalized,
    tokenId: row.token_id,
    createdAt: row.created_at,
  };
}

export function rotateToken(db: Database, operatorId: number): string {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("hex");
  const salt = randomBytes(SALT_BYTES);
  const hash = hashSecret(salt, secret);

  const res = db
    .prepare(
      `UPDATE operators SET token_id = ?, token_salt = ?, token_hash = ?
       WHERE id = ?`,
    )
    .run(tokenId, salt, hash, operatorId);
  if (res.changes !== 1) {
    throw new Error(`rotateToken: operator ${operatorId} not found`);
  }
  return `${tokenId}.${secret}`;
}
