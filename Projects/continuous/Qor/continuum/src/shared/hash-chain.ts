/**
 * Hash-chain computation for ledger entries.
 * Extracted from qora/src/api/append-entry.ts:17.
 * Deterministic: base64(first 32 chars of JSON serialization).
 */

export function computeHash(prev: string, type: string, payload: unknown): string {
  return Buffer.from(JSON.stringify({ prev, type, payload })).toString("base64").slice(0, 32);
}
