/**
 * Intent Types
 *
 * Types for intent history and provenance tracking.
 */

// Re-export IntentHistoryEntry from shared.types for backwards compatibility
export type { IntentHistoryEntry } from "./shared.types.js";

/**
 * Intent history record for merkle-chain audit trail (alternative naming)
 */
export interface IntentHistoryRecord {
  id: string;
  timestamp: string;
  intentType: string;
  actorDid: string;
  action: string;
  targetId?: string;
  targetType?: string;
  payload?: Record<string, unknown>;
  result: "success" | "failure" | "pending";
  entryHash: string;
  prevHash: string;
}

/**
 * Intent history log configuration
 */
export interface IntentHistoryConfig {
  historyPath: string;
  maxEntries?: number;
  hashAlgorithm?: "sha256" | "sha512";
}
